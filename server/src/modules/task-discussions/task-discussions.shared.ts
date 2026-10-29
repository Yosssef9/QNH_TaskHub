import { getDatabasePool, sql } from '../../database/sql.js';
import { recoverAttachmentFileName } from '../../shared/utils/attachment-filename.js';
import { assertDiscussionAccess, type DiscussionScope } from './task-discussions.policy.js';
import { discussionLikePattern } from './task-discussions.reactions.js';

export type SharedDiscussionTab = 'files' | 'images' | 'links';
export type SharedDiscussionSort = 'newest' | 'oldest' | 'name';
export type SharedDiscussionItem = {
  kind: 'file' | 'image' | 'link';
  messageId: number;
  authorName: string;
  createdAtUtc: string;
  file?: { id: string; name: string; mimeType: string; sizeBytes: number };
  url?: string;
  domain?: string;
};
export type SharedDiscussionPage = { items: SharedDiscussionItem[]; nextOffset: number | null };

/** Only web URLs are extracted. No HTML scraping or third-party requests. */
export function extractDiscussionLinks(body: string): {url:string; domain:string}[] {
  const matches = body.match(/https?:\/\/[^\s<>"'`]+/giu) ?? [];
  const result: {url:string;domain:string}[] = [];
  for (const candidate of matches) {
    const cleaned = candidate.replace(/[.,;:!?\]\}]+$/u, '').replace(/\)+$/u, suffix => {
      const opening = (candidate.match(/\(/g) ?? []).length;
      const closing = (candidate.match(/\)/g) ?? []).length;
      return ')'.repeat(Math.min(suffix.length, Math.max(0, opening - (closing - suffix.length))));
    });
    try {
      const parsed = new URL(cleaned);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) continue;
      result.push({url:parsed.href, domain:parsed.hostname});
    } catch { /* Ignore malformed web links. */ }
  }
  return result;
}

/** Scope authorization is repeated on every page; a revoked participant cannot browse a cached scope. */
export async function listSharedDiscussionItems(userId:number,scope:DiscussionScope,options:{
  tab:SharedDiscussionTab; sort:SharedDiscussionSort; q:string; offset:number; limit:number;
}):Promise<SharedDiscussionPage> {
  await assertDiscussionAccess(userId,scope);
  const pool=await getDatabasePool();
  const pattern=options.q.trim()?discussionLikePattern(options.q.trim()):null;
  const batch=options.limit+1;
  if (options.tab==='links') {
    // SQL pages through messages, not extracted URLs. Every matching message is returned in its entirety,
    // so a message containing several links never gets split or skipped across pages.
    const ordering=options.sort==='oldest'?'ASC':'DESC';
    const rows=await pool.request()
      .input('taskId',sql.BigInt,scope.taskId)
      .input('subtaskId',sql.BigInt,scope.subtaskId)
      .input('pattern',sql.NVarChar(250),pattern)
      .input('offset',sql.Int,options.offset)
      .input('batch',sql.Int,batch)
      .query<{messageId:number|string;authorName:string;body:string;createdAtUtc:Date}>(`
        SELECT m.id messageId,COALESCE(u.USER_NAME,N'Unknown') authorName,m.body,
          m.created_at_utc createdAtUtc
        FROM dbo.TM_task_discussion_messages m
        LEFT JOIN dbo.users u ON u.USER_ID=m.author_user_id
        WHERE m.task_id=@taskId
          AND (m.subtask_id=@subtaskId OR (m.subtask_id IS NULL AND @subtaskId IS NULL))
          AND m.deleted_at_utc IS NULL AND m.body LIKE '%http%'
          AND (@pattern IS NULL OR m.body LIKE @pattern ESCAPE '~'
            OR u.USER_NAME LIKE @pattern ESCAPE '~')
        ORDER BY m.id ${ordering}
        OFFSET @offset ROWS FETCH NEXT @batch ROWS ONLY;`);
    const pageRows=rows.recordset.slice(0,options.limit);
    const lower=options.q.trim().toLocaleLowerCase();
    const items:SharedDiscussionItem[]=pageRows.flatMap(row=>extractDiscussionLinks(row.body)
      .filter(link=>!lower||link.url.toLocaleLowerCase().includes(lower)||row.authorName.toLocaleLowerCase().includes(lower))
      .map(link=>({kind:'link' as const,messageId:Number(row.messageId),authorName:row.authorName,
        createdAtUtc:new Date(row.createdAtUtc).toISOString(),...link})));
    return {items,nextOffset:rows.recordset.length>options.limit?options.offset+options.limit:null};
  }
  const isImage=options.tab==='images';
  const ordering=options.sort==='oldest'?'m.id ASC, f.id ASC':options.sort==='name'?'f.original_file_name ASC, m.id DESC, f.id DESC':'m.id DESC, f.id DESC';
  const rows=await pool.request()
    .input('taskId',sql.BigInt,scope.taskId)
    .input('subtaskId',sql.BigInt,scope.subtaskId)
    .input('pattern',sql.NVarChar(250),pattern)
    .input('isImage',sql.Bit,isImage)
    .input('offset',sql.Int,options.offset)
    .input('batch',sql.Int,batch)
    .query<{messageId:number|string;authorName:string;createdAtUtc:Date;fileId:string;fileName:string;mimeType:string;sizeBytes:number|string}>(`
      SELECT m.id messageId,COALESCE(u.USER_NAME,N'Unknown') authorName,
        m.created_at_utc createdAtUtc,CONVERT(varchar(36),f.id) fileId,
        f.original_file_name fileName,f.mime_type mimeType,f.size_bytes sizeBytes
      FROM dbo.TM_task_discussion_files f
      JOIN dbo.TM_task_discussion_messages m ON m.id=f.message_id
      LEFT JOIN dbo.users u ON u.USER_ID=m.author_user_id
      WHERE m.task_id=@taskId
        AND (m.subtask_id=@subtaskId OR (m.subtask_id IS NULL AND @subtaskId IS NULL))
        AND m.deleted_at_utc IS NULL AND f.deleted_at_utc IS NULL
        AND (CASE WHEN f.mime_type LIKE 'image/%' THEN 1 ELSE 0 END)=@isImage
        AND (@pattern IS NULL OR f.original_file_name LIKE @pattern ESCAPE '~'
          OR u.USER_NAME LIKE @pattern ESCAPE '~')
      ORDER BY ${ordering}
      OFFSET @offset ROWS FETCH NEXT @batch ROWS ONLY;`);
  const items:SharedDiscussionItem[]=rows.recordset.slice(0,options.limit).map(row=>({
    kind:isImage?'image':'file',messageId:Number(row.messageId),authorName:row.authorName,
    createdAtUtc:new Date(row.createdAtUtc).toISOString(),
    file:{id:row.fileId,name:recoverAttachmentFileName(row.fileName),mimeType:row.mimeType,sizeBytes:Number(row.sizeBytes)},
  }));
  return {items,nextOffset:rows.recordset.length>options.limit?options.offset+options.limit:null};
}
