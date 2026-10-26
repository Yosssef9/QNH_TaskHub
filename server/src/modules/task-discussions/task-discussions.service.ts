import path from 'node:path';
import { getDatabasePool, sql } from '../../database/sql.js';
import { withTransaction } from '../../database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import { cleanUploadedAttachmentFileName, recoverAttachmentFileName } from '../../shared/utils/attachment-filename.js';
import { readAttachment, removeStoredAttachment, storeAttachment } from '../task-details/attachment-storage.js';
import { assertDiscussionAccess, canDeleteDiscussionAttachment, type DiscussionScope } from './task-discussions.policy.js';
import { publishDiscussionEvent } from './task-discussions.stream.js';
import { notifyDiscussionMembers, listDiscussionMembers } from './task-discussions.notifications.js';
import { logger } from '../../config/logger.js';
import { discussionLikePattern, isDiscussionReaction } from './task-discussions.reactions.js';
import { mentionedMemberIds } from './task-discussions.mentions.js';

export interface DiscussionMessage {
  id:number; taskId:number; subtaskId:number|null; authorUserId:number;
  authorName:string; body:string|null; replyToMessageId:number|null;
  createdAtUtc:string; editedAtUtc:string|null; deletedAtUtc:string|null;
  files:DiscussionFile[]; reactions:DiscussionReaction[]; readByCount:number; recipientCount:number;
  mentions:{userId:number;userCode:string;userName:string}[];
}
export interface DiscussionFile { id:string; name:string; mimeType:string; sizeBytes:number }
export interface DiscussionReaction { emoji:string; count:number; reacted:boolean; users:{userId:number;userName:string}[] }
const invalid = (message = 'Message unavailable.') => new AppError({statusCode:404,code:'DISCUSSION_MESSAGE_NOT_FOUND',message});
const asScope = (row:{taskId:number|string;subtaskId:number|string|null}):DiscussionScope => ({taskId:Number(row.taskId),subtaskId:row.subtaskId===null?null:Number(row.subtaskId)});

async function getMessageRow(messageId:number) {
  const pool=await getDatabasePool();
  const result=await pool.request().input('messageId',sql.BigInt,messageId)
    .query<{id:number;taskId:number;subtaskId:number|null;authorUserId:number;body:string;deletedAtUtc:Date|null}>(`
      SELECT id,task_id taskId,subtask_id subtaskId,author_user_id authorUserId,body,deleted_at_utc deletedAtUtc
      FROM dbo.TM_task_discussion_messages WHERE id=@messageId;`);
  return result.recordset[0]??null;
}

function mapRow(row:any, files:DiscussionFile[],reactions:DiscussionReaction[]=[],readByCount=0,recipientCount=0,mentions:DiscussionMessage['mentions']=[]):DiscussionMessage {
  return {id:Number(row.id),taskId:Number(row.taskId),subtaskId:row.subtaskId===null?null:Number(row.subtaskId),
    authorUserId:Number(row.authorUserId),authorName:row.authorName??'',
    body:row.deletedAtUtc?null:row.body, replyToMessageId:row.replyToMessageId===null?null:Number(row.replyToMessageId),
    createdAtUtc:new Date(row.createdAtUtc).toISOString(),
    editedAtUtc:row.editedAtUtc?new Date(row.editedAtUtc).toISOString():null,
    deletedAtUtc:row.deletedAtUtc?new Date(row.deletedAtUtc).toISOString():null,files,reactions,readByCount,recipientCount,mentions};
}

export const taskDiscussionsService={
  /** Recent discussion scopes, authorized independently for every candidate. A share grant
   * does not itself give discussion access. Cursor is the latest message ID per scope. */
  async inbox(userId:number,options:{beforeId?:number;limit:number}){
    const pool=await getDatabasePool();
    // Candidate selection touches no private content in the API response until after
    // assertDiscussionAccess. Bound the scan to prevent unbounded per-scope ACL queries.
    const result=await pool.request()
      .input('viewer',sql.Int,userId)
      .input('beforeId',sql.BigInt,options.beforeId??null)
      .query<{taskId:number|string;subtaskId:number|string|null;taskTitle:string;subtaskTitle:string|null;lastMessageId:number|string;lastBody:string;lastAtUtc:Date;senderName:string}>(`
        WITH recent AS (
          SELECT m.task_id taskId,m.subtask_id subtaskId,MAX(m.id) lastMessageId
          FROM dbo.TM_task_discussion_messages m
          JOIN dbo.TM_tasks t ON t.id=m.task_id AND t.deleted_at_utc IS NULL AND t.kpi_instance_id IS NULL
          LEFT JOIN dbo.TM_subtasks s ON s.id=m.subtask_id AND s.deleted_at_utc IS NULL
          WHERE m.deleted_at_utc IS NULL AND (m.subtask_id IS NULL OR s.id IS NOT NULL)
          GROUP BY m.task_id,m.subtask_id
        )
        SELECT TOP(150) r.taskId,r.subtaskId,t.title taskTitle,s.title subtaskTitle,
          r.lastMessageId,LEFT(m.body,120) lastBody,m.created_at_utc lastAtUtc,
          COALESCE(u.USER_NAME,N'Unknown') senderName
        FROM recent r
        JOIN dbo.TM_tasks t ON t.id=r.taskId
        LEFT JOIN dbo.TM_subtasks s ON s.id=r.subtaskId
        JOIN dbo.TM_task_discussion_messages m ON m.id=r.lastMessageId
        LEFT JOIN dbo.users u ON u.USER_ID=m.author_user_id
        WHERE (@beforeId IS NULL OR r.lastMessageId<@beforeId)
          AND (
            t.owner_user_id=@viewer
            OR (r.subtaskId IS NULL AND (
              EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments a
                WHERE a.task_id=t.id AND a.subtask_id IS NULL AND a.assignee_user_id=@viewer AND a.is_active=1)
              OR (NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
                AND (EXISTS(SELECT 1 FROM dbo.TM_general_task_assignments g WHERE g.task_id=t.id AND g.assignee_user_id=@viewer)
                  OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ma WHERE ma.task_id=t.id AND ma.assignee_user_id=@viewer)))
            ))
            OR (r.subtaskId IS NOT NULL AND (
              EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments a
                WHERE a.task_id=t.id AND a.subtask_id=r.subtaskId AND a.assignee_user_id=@viewer AND a.is_active=1)
              OR (NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
                AND EXISTS(SELECT 1 FROM dbo.TM_subtasks st
                  LEFT JOIN dbo.TM_general_task_assignments g ON g.task_id=t.id
                  LEFT JOIN dbo.TM_meeting_action_items ma ON ma.task_id=t.id
                  WHERE st.id=r.subtaskId AND st.task_id=t.id AND st.deleted_at_utc IS NULL
                    AND COALESCE(st.assignee_user_id,g.assignee_user_id,ma.assignee_user_id)=@viewer))
            ))
          )
        ORDER BY r.lastMessageId DESC;`);
    const conversations=[] as {taskId:number;subtaskId:number|null;taskTitle:string;subtaskTitle:string|null;
      lastMessageId:number;lastPreview:string;lastAtUtc:string;senderName:string;unread:number;mentions:number}[];
    let lastScanned:number|null=null;
    for(const row of result.recordset){
      const taskId=Number(row.taskId),subtaskId=row.subtaskId===null?null:Number(row.subtaskId);
      lastScanned=Number(row.lastMessageId);
      try {await assertDiscussionAccess(userId,{taskId,subtaskId});}
      catch(error){if(error instanceof AppError && error.code==='DISCUSSION_NOT_FOUND')continue;throw error;}
      const counts=await pool.request().input('taskId',sql.BigInt,taskId)
        .input('subtaskId',sql.BigInt,subtaskId).input('viewer',sql.Int,userId)
        .query<{unread:number;mentions:number}>(`
          SELECT COUNT(*) unread,
            SUM(CASE WHEN n.id IS NOT NULL OR mention.message_id IS NOT NULL THEN 1 ELSE 0 END) mentions
          FROM dbo.TM_task_discussion_messages m
          LEFT JOIN dbo.TM_task_discussion_mentions mention ON mention.message_id=m.id AND mention.mentioned_user_id=@viewer
          LEFT JOIN dbo.TM_notifications n ON n.owner_user_id=@viewer
            AND n.notification_type='TASK_DISCUSSION_MENTION'
            AND n.dedupe_key=CONCAT('TASK_DISCUSSION:',CONVERT(varchar(20),m.id),':',CONVERT(varchar(20),@viewer))
          WHERE m.task_id=@taskId
            AND (m.subtask_id=@subtaskId OR (m.subtask_id IS NULL AND @subtaskId IS NULL))
            AND m.deleted_at_utc IS NULL AND m.author_user_id<>@viewer
            AND m.id>ISNULL((SELECT TOP(1) r.last_read_message_id
              FROM dbo.TM_task_discussion_read_state r WHERE r.task_id=@taskId
                AND r.user_id=@viewer AND (r.subtask_id=@subtaskId OR (r.subtask_id IS NULL AND @subtaskId IS NULL))),0);`);
      conversations.push({taskId,subtaskId,taskTitle:row.taskTitle,subtaskTitle:row.subtaskTitle,
        lastMessageId:Number(row.lastMessageId),lastPreview:row.lastBody,
        lastAtUtc:new Date(row.lastAtUtc).toISOString(),senderName:row.senderName,
        unread:Number(counts.recordset[0]?.unread??0),mentions:Number(counts.recordset[0]?.mentions??0)});
      if(conversations.length>=options.limit)break;
    }
    // Cursor advances beyond excluded scopes too. An exact 150-row scan remains pageable.
    return {conversations,nextCursor:lastScanned!==null &&
      (result.recordset.length===150 || conversations.length===options.limit)?lastScanned:null};
  },
  /** Complete unread total for the sidebar. Keep the same ACL and cursor rules as card badges. */
  async unreadTotal(userId:number):Promise<number>{
    const pool=await getDatabasePool();
    const result=await pool.request().input('userId',sql.Int,userId)
      .query<{unread:number|string}>(`SELECT COUNT_BIG(*) unread
        FROM dbo.TM_task_discussion_messages m
        JOIN dbo.TM_tasks t ON t.id=m.task_id AND t.deleted_at_utc IS NULL AND t.kpi_instance_id IS NULL
        WHERE m.deleted_at_utc IS NULL AND m.author_user_id<>@userId
          AND m.id>COALESCE((SELECT MAX(rs.last_read_message_id)
            FROM dbo.TM_task_discussion_read_state rs
            WHERE rs.task_id=m.task_id AND rs.user_id=@userId AND
              (rs.subtask_id=m.subtask_id OR (rs.subtask_id IS NULL AND m.subtask_id IS NULL))),0)
          AND (t.owner_user_id=@userId OR
            (EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
              AND EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments ca WHERE
                ca.task_id=t.id AND ca.assignee_user_id=@userId AND ca.is_active=1 AND
                (ca.subtask_id=m.subtask_id OR (ca.subtask_id IS NULL AND m.subtask_id IS NULL))))
            OR (NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
              AND ((m.subtask_id IS NULL AND (
                EXISTS(SELECT 1 FROM dbo.TM_general_task_assignments g WHERE g.task_id=t.id AND g.assignee_user_id=@userId)
                OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items mi WHERE mi.task_id=t.id AND mi.assignee_user_id=@userId)))
              OR (m.subtask_id IS NOT NULL AND EXISTS(
                SELECT 1 FROM dbo.TM_subtasks st
                LEFT JOIN dbo.TM_general_task_assignments g ON g.task_id=t.id
                LEFT JOIN dbo.TM_meeting_action_items mi ON mi.task_id=t.id
                WHERE st.id=m.subtask_id AND st.task_id=t.id AND st.deleted_at_utc IS NULL AND
                  COALESCE(st.assignee_user_id,g.assignee_user_id,mi.assignee_user_id)=@userId)))))
`);
    return Number(result.recordset[0]?.unread??0);
  },
  /** Batch-unread count for visible task cards; permission filtering happens entirely in SQL. */
  async unreadForTasks(userId:number,taskIds:number[]):Promise<Record<number,number>>{
    if(!taskIds.length)return {};
    // A typed VALUES table works on older QNHDB SQL compatibility levels where
    // STRING_SPLIT may not be available. Bind each ID; never interpolate its value.
    // Both statements must use the same scoped, parameterized task selection.
    const requestedIdsSql = taskIds.map((_, index) => `(@taskId${index})`).join(', ');
    const taskIdsTableSql = `(SELECT wanted.taskId FROM (VALUES ${requestedIdsSql}) AS wanted(taskId))`;
    const requestForTaskIds = (pool: Awaited<ReturnType<typeof getDatabasePool>>) => {
      const request = pool.request().input('userId', sql.Int, userId);
      taskIds.forEach((taskId, index) => request.input(`taskId${index}`, sql.BigInt, taskId));
      return request;
    };
    const pool=await getDatabasePool();
    const result=await requestForTaskIds(pool)
      .query<{taskId:number|string;unread:number}>(`
        SELECT m.task_id taskId,COUNT(*) unread
        FROM dbo.TM_task_discussion_messages m
        JOIN dbo.TM_tasks t ON t.id=m.task_id AND t.deleted_at_utc IS NULL AND t.kpi_instance_id IS NULL
        WHERE m.task_id IN ${taskIdsTableSql}
          AND m.deleted_at_utc IS NULL AND m.author_user_id<>@userId
          AND m.id>COALESCE((SELECT MAX(rs.last_read_message_id)
            FROM dbo.TM_task_discussion_read_state rs
            WHERE rs.task_id=m.task_id AND rs.user_id=@userId AND
              (rs.subtask_id=m.subtask_id OR (rs.subtask_id IS NULL AND m.subtask_id IS NULL))),0)
          AND (t.owner_user_id=@userId OR
            (EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
              AND EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments ca WHERE
                ca.task_id=t.id AND ca.assignee_user_id=@userId AND ca.is_active=1 AND
                (ca.subtask_id=m.subtask_id OR (ca.subtask_id IS NULL AND m.subtask_id IS NULL))))
            OR (NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
              AND ((m.subtask_id IS NULL AND (
                EXISTS(SELECT 1 FROM dbo.TM_general_task_assignments g WHERE g.task_id=t.id AND g.assignee_user_id=@userId)
                OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items mi WHERE mi.task_id=t.id AND mi.assignee_user_id=@userId)))
              OR (m.subtask_id IS NOT NULL AND EXISTS(
                SELECT 1 FROM dbo.TM_subtasks st
                LEFT JOIN dbo.TM_general_task_assignments g ON g.task_id=t.id
                LEFT JOIN dbo.TM_meeting_action_items mi ON mi.task_id=t.id
                WHERE st.id=m.subtask_id AND st.task_id=t.id AND st.deleted_at_utc IS NULL AND
                  COALESCE(st.assignee_user_id,g.assignee_user_id,mi.assignee_user_id)=@userId)))))
        GROUP BY m.task_id;`);
    // Include eligible conversations with zero unread messages. This response is also
    // the authorization-aware source for displaying a shortcut on each task card.
    // Do not treat a user with only a VIEW/EDIT share grant as a participant.
    const available=await requestForTaskIds(pool)
      .query<{taskId:number|string}>(`
        SELECT t.id taskId FROM dbo.TM_tasks t
        WHERE t.id IN ${taskIdsTableSql}
          AND t.deleted_at_utc IS NULL AND t.kpi_instance_id IS NULL
          AND (
            (t.owner_user_id=@userId AND (
              EXISTS(SELECT 1 FROM dbo.TM_task_discussion_messages history
                WHERE history.task_id=t.id)
              OR EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments ca
                WHERE ca.task_id=t.id AND ca.is_active=1 AND ca.assignee_user_id<>@userId)
              OR (NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
                AND (
                  EXISTS(SELECT 1 FROM dbo.TM_general_task_assignments g
                    WHERE g.task_id=t.id AND g.assignee_user_id<>@userId)
                  OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ma
                    WHERE ma.task_id=t.id AND ma.assignee_user_id<>@userId)
                  OR EXISTS(SELECT 1 FROM dbo.TM_subtasks st
                    WHERE st.task_id=t.id AND st.deleted_at_utc IS NULL
                      AND st.assignee_user_id IS NOT NULL AND st.assignee_user_id<>@userId)
                ))
            ))
            OR (t.owner_user_id<>@userId AND (
              EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments ca
                WHERE ca.task_id=t.id AND ca.is_active=1 AND ca.assignee_user_id=@userId)
              OR (NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
                AND (EXISTS(SELECT 1 FROM dbo.TM_general_task_assignments g
                       WHERE g.task_id=t.id AND g.assignee_user_id=@userId)
                  OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ma
                       WHERE ma.task_id=t.id AND ma.assignee_user_id=@userId)
                  OR EXISTS(SELECT 1 FROM dbo.TM_subtasks st
                       WHERE st.task_id=t.id AND st.deleted_at_utc IS NULL AND st.assignee_user_id=@userId)))
            ))
          );`);
    const counts=new Map(result.recordset.map(row=>[Number(row.taskId),Number(row.unread)]));
    return Object.fromEntries(available.recordset.map(row=>{
      const id=Number(row.taskId);
      return [id,counts.get(id)??0];
    }));
  },
  async scopes(userId:number,taskId:number){
    const pool=await getDatabasePool();
    const ids=await pool.request().input('taskId',sql.BigInt,taskId)
      .query<{id:number|string;title:string}>(`SELECT id,title FROM dbo.TM_subtasks WHERE task_id=@taskId AND deleted_at_utc IS NULL ORDER BY display_order,id;`);
    const candidates=[{subtaskId:null,title:null},...ids.recordset.map(row=>({subtaskId:Number(row.id),title:row.title}))];
    // One batched latest-message query instead of a separate round trip per subtask.
    const previews=await pool.request().input('taskId',sql.BigInt,taskId)
      .query<{subtaskId:number|string|null;body:string;lastAtUtc:Date}>(`
        WITH ranked AS (SELECT m.subtask_id subtaskId,LEFT(m.body,110) body,
          m.created_at_utc lastAtUtc,
          ROW_NUMBER() OVER(PARTITION BY m.subtask_id ORDER BY m.id DESC) rn
          FROM dbo.TM_task_discussion_messages m
          WHERE m.task_id=@taskId AND m.deleted_at_utc IS NULL)
        SELECT subtaskId,body,lastAtUtc FROM ranked WHERE rn=1;`);
    const previewByScope=new Map(previews.recordset.map(r=>[r.subtaskId===null?'main':String(r.subtaskId),r]));
    const accessible=[] as {subtaskId:number|null;title:string|null;unread:number;lastReadMessageId:number;lastPreview:string|null;lastAtUtc:string|null}[];
    for(const candidate of candidates){
      try {await assertDiscussionAccess(userId,{taskId,subtaskId:candidate.subtaskId});}
      catch(error){if(error instanceof AppError && error.code==='DISCUSSION_NOT_FOUND')continue;throw error;}
      const unread=await pool.request().input('taskId',sql.BigInt,taskId)
        .input('subtaskId',sql.BigInt,candidate.subtaskId).input('userId',sql.Int,userId)
        .query<{count:number;lastReadMessageId:number|string}>(`SELECT COUNT(*) [count],
          COALESCE((SELECT TOP(1) r.last_read_message_id FROM dbo.TM_task_discussion_read_state r
            WHERE r.task_id=@taskId AND r.user_id=@userId
              AND (r.subtask_id=@subtaskId OR (r.subtask_id IS NULL AND @subtaskId IS NULL))),0) lastReadMessageId
          FROM dbo.TM_task_discussion_messages m
          WHERE m.task_id=@taskId AND ((m.subtask_id=@subtaskId) OR (m.subtask_id IS NULL AND @subtaskId IS NULL))
          AND m.author_user_id<>@userId AND m.deleted_at_utc IS NULL AND m.id>COALESCE((
            SELECT TOP(1) last_read_message_id FROM dbo.TM_task_discussion_read_state r
            WHERE r.task_id=@taskId AND r.user_id=@userId AND
              (r.subtask_id=@subtaskId OR (r.subtask_id IS NULL AND @subtaskId IS NULL))),0);`);
      const latest=previewByScope.get(candidate.subtaskId===null?'main':String(candidate.subtaskId));
      accessible.push({...candidate,unread:Number(unread.recordset[0]?.count??0),
        lastReadMessageId:Number(unread.recordset[0]?.lastReadMessageId??0),
        lastPreview:latest?.body??null,
        lastAtUtc:latest?.lastAtUtc?new Date(latest.lastAtUtc).toISOString():null});
    }
    return accessible;
  },
  async list(userId:number,scope:DiscussionScope,beforeId?:number){
    await assertDiscussionAccess(userId,scope);
    const pool=await getDatabasePool();
    const result=await pool.request().input('taskId',sql.BigInt,scope.taskId)
      .input('subtaskId',sql.BigInt,scope.subtaskId).input('beforeId',sql.BigInt,beforeId??null)
      .query<any>(`SELECT TOP(60) m.id,m.task_id taskId,m.subtask_id subtaskId,m.author_user_id authorUserId,
        COALESCE(u.USER_NAME,N'Unknown') authorName,m.body,m.reply_to_message_id replyToMessageId,
        m.created_at_utc createdAtUtc,m.edited_at_utc editedAtUtc,m.deleted_at_utc deletedAtUtc
        FROM dbo.TM_task_discussion_messages m
        LEFT JOIN dbo.users u ON u.USER_ID=m.author_user_id
        WHERE m.task_id=@taskId AND (m.subtask_id=@subtaskId OR (m.subtask_id IS NULL AND @subtaskId IS NULL))
          AND (@beforeId IS NULL OR m.id<@beforeId)
        ORDER BY m.id DESC;`);
    const rows=result.recordset.reverse();
    const attachmentsByMessage=new Map<number,DiscussionFile[]>();
    if(rows.length){
      const fileRows=await pool.request().input('messageIds',sql.NVarChar(sql.MAX),rows.map((row:any)=>Number(row.id)).join(','))
        .query<{messageId:number|string;id:string;name:string;mimeType:string;sizeBytes:number}>(`
          SELECT f.message_id messageId,CONVERT(varchar(36),f.id) id,
            f.original_file_name name,f.mime_type mimeType,f.size_bytes sizeBytes
          FROM dbo.TM_task_discussion_files f
          WHERE f.deleted_at_utc IS NULL AND f.message_id IN (SELECT TRY_CAST(value AS bigint) FROM STRING_SPLIT(@messageIds,','));`);
      for(const file of fileRows.recordset){
        const key=Number(file.messageId);
        const grouped=attachmentsByMessage.get(key)??[];
        grouped.push({id:file.id,name:recoverAttachmentFileName(file.name),mimeType:file.mimeType,sizeBytes:Number(file.sizeBytes)});
        attachmentsByMessage.set(key,grouped);
      }
    }
    const mentionsByMessage=new Map<number,DiscussionMessage['mentions']>();
    if(rows.length){
      const mentions=await pool.request().input('ids',sql.NVarChar(sql.MAX),rows.map((r:any)=>Number(r.id)).join(','))
        .query<{messageId:number|string;userId:number;userCode:string;userName:string}>(`
          SELECT m.message_id messageId,u.USER_ID userId,u.USER_CODE userCode,u.USER_NAME userName
          FROM dbo.TM_task_discussion_mentions m JOIN dbo.users u ON u.USER_ID=m.mentioned_user_id
          WHERE m.message_id IN (SELECT TRY_CAST(value AS bigint) FROM STRING_SPLIT(@ids,','));`);
      for(const m of mentions.recordset){const id=Number(m.messageId);
        const list=mentionsByMessage.get(id)??[];
        list.push({userId:Number(m.userId),userCode:m.userCode,userName:m.userName});mentionsByMessage.set(id,list);
      }
    }
    const reactionsByMessage=new Map<number,DiscussionReaction[]>();
    const readersByMessage=new Map<number,number>();
    const allMembers=await listDiscussionMembers(userId,scope);
    if(rows.length){
      // Fetch reactor identities in one batch only after assertDiscussionAccess has
      // authorized the conversation; never expose identities through a public route.
      const reactionRows=await pool.request().input('ids',sql.NVarChar(sql.MAX),rows.map((r:any)=>Number(r.id)).join(','))
        .query<{messageId:number|string;emoji:string;userId:number;userName:string}>(`
          SELECT r.message_id messageId,r.emoji,r.user_id userId,
            COALESCE(u.USER_NAME,N'Unknown') userName
          FROM dbo.TM_task_discussion_reactions r
          LEFT JOIN dbo.users u ON u.USER_ID=r.user_id
          WHERE r.message_id IN (SELECT TRY_CAST(value AS bigint) FROM STRING_SPLIT(@ids,','))
          ORDER BY r.message_id,r.emoji,u.USER_NAME;`);
      for(const r of reactionRows.recordset){
        const id=Number(r.messageId);
        const group=reactionsByMessage.get(id)??[];
        let item=group.find(item=>item.emoji===r.emoji);
        if(!item){item={emoji:r.emoji,count:0,reacted:false,users:[]};group.push(item)}
        item.count+=1;
        if(Number(r.userId)===userId)item.reacted=true;
        item.users.push({userId:Number(r.userId),userName:r.userName});
        reactionsByMessage.set(id,group);
      }
      const eligibleIds=allMembers.map(m=>m.userId);
      if(eligibleIds.length){
        const readerRows=await pool.request().input('taskId',sql.BigInt,scope.taskId)
          .input('subtaskId',sql.BigInt,scope.subtaskId)
          .input('ids',sql.NVarChar(sql.MAX),eligibleIds.join(','))
          .query<{userId:number;lastRead:number|string}>(`SELECT user_id userId,last_read_message_id lastRead
             FROM dbo.TM_task_discussion_read_state WHERE task_id=@taskId AND
             (subtask_id=@subtaskId OR (subtask_id IS NULL AND @subtaskId IS NULL))
             AND user_id IN (SELECT TRY_CAST(value AS int) FROM STRING_SPLIT(@ids,','));`);
        const readMap=new Map(readerRows.recordset.map(r=>[Number(r.userId),Number(r.lastRead)]));
        for(const row of rows){const id=Number(row.id);
          readersByMessage.set(id,allMembers.filter(m=>m.userId!==Number(row.authorUserId) && (readMap.get(m.userId)??0)>=id).length);}
      }
    }
    return rows.map((row:any)=>mapRow(row,attachmentsByMessage.get(Number(row.id))??[],
      reactionsByMessage.get(Number(row.id))??[],readersByMessage.get(Number(row.id))??0,
      allMembers.filter(m=>m.userId!==Number(row.authorUserId)).length,mentionsByMessage.get(Number(row.id))??[]));
  },
  async search(userId:number,scope:DiscussionScope,query:string){
    await assertDiscussionAccess(userId,scope);
    const term=query.trim();if(term.length<2 || term.length>120)
      throw new AppError({statusCode:400,code:'DISCUSSION_SEARCH_INVALID',message:'Search must be 2–120 characters.'});
    // Escape SQL LIKE wildcards so user-provided text remains a literal substring.
    const pattern=discussionLikePattern(term);
    const pool=await getDatabasePool();const result=await pool.request()
      .input('taskId',sql.BigInt,scope.taskId).input('subtaskId',sql.BigInt,scope.subtaskId)
      .input('pattern',sql.NVarChar(250),pattern)
      .query<{id:number|string;authorName:string;body:string;createdAtUtc:Date}>(`
        SELECT TOP(50) m.id,COALESCE(u.USER_NAME,N'Unknown') authorName,m.body,m.created_at_utc createdAtUtc
        FROM dbo.TM_task_discussion_messages m LEFT JOIN dbo.users u ON u.USER_ID=m.author_user_id
        WHERE m.task_id=@taskId AND (m.subtask_id=@subtaskId OR (m.subtask_id IS NULL AND @subtaskId IS NULL))
          AND m.deleted_at_utc IS NULL AND m.body LIKE @pattern ESCAPE '~'
        ORDER BY m.id DESC;`);
    return result.recordset.map(r=>({id:Number(r.id),authorName:r.authorName,body:r.body,
      createdAtUtc:new Date(r.createdAtUtc).toISOString()}));
  },
  async react(userId:number,messageId:number,emoji:string,active:boolean){
    if(!isDiscussionReaction(emoji))throw new AppError({statusCode:400,code:'DISCUSSION_REACTION_INVALID',message:'Unsupported reaction.'});
    const message=await getMessageRow(messageId);
    if(!message || message.deletedAtUtc)throw invalid();
    const scope=asScope(message);await assertDiscussionAccess(userId,scope,true);
    await withTransaction(async tx=>{
      const request=tx.request().input('messageId',sql.BigInt,messageId)
        .input('userId',sql.Int,userId).input('emoji',sql.NVarChar(12),emoji);
      // Serialize concurrent reaction changes against the parent message row. A participant
      // has at most one reaction on a message; choosing a new emoji replaces the old one.
      await request.query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.TM_task_discussion_messages WITH (UPDLOCK,HOLDLOCK)
          WHERE id=@messageId AND deleted_at_utc IS NULL
        ) THROW 55910, 'Discussion message no longer available.', 1;
      `);
      await request.query(active?`
        DELETE FROM dbo.TM_task_discussion_reactions
        WHERE message_id=@messageId AND user_id=@userId AND emoji<>@emoji;
        IF NOT EXISTS(SELECT 1 FROM dbo.TM_task_discussion_reactions WITH (UPDLOCK,HOLDLOCK)
          WHERE message_id=@messageId AND user_id=@userId)
          INSERT dbo.TM_task_discussion_reactions(message_id,user_id,emoji) VALUES(@messageId,@userId,@emoji);`:`
        DELETE FROM dbo.TM_task_discussion_reactions
        WHERE message_id=@messageId AND user_id=@userId AND emoji=@emoji;`);
    });
    publishDiscussionEvent(scope,'reaction',{messageId});
  },
  async send(userId:number,scope:DiscussionScope,input:{body:string;replyToMessageId?:number|null;clientRequestId:string}){
    await assertDiscussionAccess(userId,scope,true);
    const body=input.body.trim();
    if(!body || body.length>4000) throw new AppError({statusCode:400,code:'DISCUSSION_BODY_INVALID',message:'Message must contain 1–4000 characters.'});
    if(input.replyToMessageId){
      const reply=await getMessageRow(input.replyToMessageId);
      if(!reply || reply.deletedAtUtc || Number(reply.taskId)!==scope.taskId ||
        (reply.subtaskId===null?null:Number(reply.subtaskId))!==scope.subtaskId) throw invalid('Reply target unavailable.');
    }
    const eligible=await listDiscussionMembers(userId,scope);
    const mentionedIds=mentionedMemberIds(body,eligible);
    if(mentionedIds.length>10)throw new AppError({statusCode:400,code:'DISCUSSION_TOO_MANY_MENTIONS',message:'Maximum 10 mentions.'});
    const id=await withTransaction(async(tx)=>{
      // Database deduplication protects against retry after a network interruption.
      const r=await tx.request().input('taskId',sql.BigInt,scope.taskId)
        .input('subtaskId',sql.BigInt,scope.subtaskId).input('userId',sql.Int,userId)
        .input('body',sql.NVarChar(4000),body)
        .input('reply',sql.BigInt,input.replyToMessageId??null)
        .input('key',sql.UniqueIdentifier,input.clientRequestId)
        .query<{id:number|string}>(`
          IF NOT EXISTS(SELECT 1 FROM dbo.TM_task_discussion_messages WITH (UPDLOCK,HOLDLOCK)
            WHERE author_user_id=@userId AND client_request_id=@key)
            INSERT dbo.TM_task_discussion_messages(task_id,subtask_id,author_user_id,body,reply_to_message_id,client_request_id)
              VALUES(@taskId,@subtaskId,@userId,@body,@reply,@key);
          SELECT id FROM dbo.TM_task_discussion_messages
          WHERE author_user_id=@userId AND client_request_id=@key AND task_id=@taskId
            AND (subtask_id=@subtaskId OR (subtask_id IS NULL AND @subtaskId IS NULL));
        `);
      if(!r.recordset[0])throw new AppError({statusCode:409,code:'DISCUSSION_REQUEST_REUSED',message:'Message request was already used elsewhere.'});
      const messageId=Number(r.recordset[0].id);
      for(const mentionId of mentionedIds){
        await tx.request().input('messageId',sql.BigInt,messageId).input('member',sql.Int,mentionId)
          .query(`IF NOT EXISTS(SELECT 1 FROM dbo.TM_task_discussion_mentions WHERE message_id=@messageId AND mentioned_user_id=@member)
            INSERT dbo.TM_task_discussion_mentions(message_id,mentioned_user_id) VALUES(@messageId,@member);`);
      }
      return messageId;
    });
    const persisted=await getMessageRow(id);
    publishDiscussionEvent(scope,'message',{messageId:id});
    try {await notifyDiscussionMembers(userId,scope,id,persisted?.body??body)}
    catch(error){logger.error({err:error,taskId:scope.taskId,messageId:id},'Discussion notification delivery failed')}
    return {id};
  },
  async edit(userId:number,messageId:number,body:string){
    const row=await getMessageRow(messageId);
    if(!row) throw invalid();
    const scope=asScope(row);
    await assertDiscussionAccess(userId,scope,true);
    if(Number(row.authorUserId)!==userId || row.deletedAtUtc) throw invalid();
    const text=body.trim(); if(!text || text.length>4000) throw new AppError({statusCode:400,code:'DISCUSSION_BODY_INVALID',message:'Invalid message length.'});
    const eligible=await listDiscussionMembers(userId,scope);
    const mentionedIds=mentionedMemberIds(text,eligible);
    if(mentionedIds.length>10)throw new AppError({statusCode:400,code:'DISCUSSION_TOO_MANY_MENTIONS',message:'Maximum 10 mentions.'});
    const changed=await withTransaction(async tx => {
      const result=await tx.request().input('messageId',sql.BigInt,messageId)
        .input('userId',sql.Int,userId).input('body',sql.NVarChar(4000),text)
        .query(`DECLARE @previous NVARCHAR(4000);
          SELECT @previous=body FROM dbo.TM_task_discussion_messages WITH (UPDLOCK,HOLDLOCK)
          WHERE id=@messageId AND author_user_id=@userId AND deleted_at_utc IS NULL;
          IF @previous IS NULL THROW 55910, 'Discussion message no longer available.', 1;
          IF @previous<>@body
          BEGIN
            INSERT dbo.TM_task_discussion_message_revisions(message_id,actor_user_id,previous_body,revision_kind)
              VALUES(@messageId,@userId,@previous,'EDIT');
            UPDATE dbo.TM_task_discussion_messages SET body=@body,edited_at_utc=SYSUTCDATETIME() WHERE id=@messageId;
          END;
          SELECT CAST(CASE WHEN @previous<>@body THEN 1 ELSE 0 END AS int) changed;`);
      if(result.recordset[0]?.changed!==1)return {changed:false,newIds:[] as number[]};
      const prior=await tx.request().input('messageId',sql.BigInt,messageId)
        .query<{id:number}>(`SELECT mentioned_user_id id FROM dbo.TM_task_discussion_mentions WHERE message_id=@messageId;`);
      const former=new Set(prior.recordset.map(r=>Number(r.id)));
      await tx.request().input('messageId',sql.BigInt,messageId)
        .query(`DELETE FROM dbo.TM_task_discussion_mentions WHERE message_id=@messageId;`);
      for(const member of mentionedIds){await tx.request().input('messageId',sql.BigInt,messageId).input('member',sql.Int,member)
        .query(`INSERT dbo.TM_task_discussion_mentions(message_id,mentioned_user_id) VALUES(@messageId,@member);`);}
      return {changed:true,newIds:mentionedIds.filter(id=>!former.has(id))};
    });
    if(changed.changed){publishDiscussionEvent(scope,'edited',{messageId});
      // Edits create mention notifications only for newly referenced users, once per message.
      try {await notifyDiscussionMembers(userId,scope,messageId,text,changed.newIds,true)}
      catch(error){logger.error({err:error,messageId},'Edited mention notification failed')}
    }
  },
  async remove(userId:number,messageId:number){
    const row=await getMessageRow(messageId);if(!row) throw invalid();
    const scope=asScope(row); await assertDiscussionAccess(userId,scope,true);
    if(Number(row.authorUserId)!==userId || row.deletedAtUtc) throw invalid();
    await withTransaction(async tx => {
      await tx.request().input('messageId',sql.BigInt,messageId).input('userId',sql.Int,userId)
        .query(`DECLARE @previous NVARCHAR(4000);
          SELECT @previous=body FROM dbo.TM_task_discussion_messages WITH (UPDLOCK,HOLDLOCK)
          WHERE id=@messageId AND author_user_id=@userId AND deleted_at_utc IS NULL;
          IF @previous IS NULL THROW 55910, 'Discussion message no longer available.', 1;
          INSERT dbo.TM_task_discussion_message_revisions(message_id,actor_user_id,previous_body,revision_kind)
            VALUES(@messageId,@userId,@previous,'DELETE');
          UPDATE dbo.TM_task_discussion_messages SET deleted_at_utc=SYSUTCDATETIME() WHERE id=@messageId;`);
    });
    publishDiscussionEvent(scope,'deleted',{messageId});
  },
  async markRead(userId:number,scope:DiscussionScope,lastMessageId:number){
    await assertDiscussionAccess(userId,scope);
    const pool=await getDatabasePool();
    await pool.request().input('taskId',sql.BigInt,scope.taskId)
      .input('subtaskId',sql.BigInt,scope.subtaskId).input('userId',sql.Int,userId)
      .input('lastId',sql.BigInt,lastMessageId)
      .query(`DECLARE @actualId BIGINT=(SELECT COALESCE(MAX(id),0)
        FROM dbo.TM_task_discussion_messages WHERE task_id=@taskId
        AND (subtask_id=@subtaskId OR (subtask_id IS NULL AND @subtaskId IS NULL))
        AND id<=@lastId);
        BEGIN TRANSACTION;
        IF EXISTS(SELECT 1 FROM dbo.TM_task_discussion_read_state WITH (UPDLOCK,HOLDLOCK)
          WHERE task_id=@taskId AND user_id=@userId
            AND (subtask_id=@subtaskId OR (subtask_id IS NULL AND @subtaskId IS NULL)))
          UPDATE dbo.TM_task_discussion_read_state
            SET last_read_message_id=CASE WHEN last_read_message_id>@actualId THEN last_read_message_id ELSE @actualId END,
              updated_at_utc=SYSUTCDATETIME()
            WHERE task_id=@taskId AND user_id=@userId
              AND (subtask_id=@subtaskId OR (subtask_id IS NULL AND @subtaskId IS NULL));
        ELSE INSERT dbo.TM_task_discussion_read_state(task_id,subtask_id,user_id,last_read_message_id)
          VALUES(@taskId,@subtaskId,@userId,@actualId);
        COMMIT TRANSACTION;`);
    publishDiscussionEvent(scope,'read',{userId,lastMessageId});
  },
  async upload(userId:number,messageId:number,file:Express.Multer.File){
    const row=await getMessageRow(messageId);if(!row || row.deletedAtUtc) throw invalid();
    const scope=asScope(row);await assertDiscussionAccess(userId,scope,true);
    if(Number(row.authorUserId)!==userId) throw invalid();
    const name=cleanUploadedAttachmentFileName(file.originalname);
    const ext=path.extname(name).toLowerCase();
    if(!name || !ext || !file.size) throw new AppError({statusCode:400,code:'DISCUSSION_FILE_INVALID',message:'Invalid attachment.'});
    const key=await storeAttachment(file.buffer,ext);
    try {
      const pool=await getDatabasePool();
      const result=await pool.request().input('messageId',sql.BigInt,messageId)
        .input('key',sql.NVarChar(200),key).input('name',sql.NVarChar(260),name)
        .input('mime',sql.NVarChar(150),file.mimetype||'application/octet-stream')
        .input('size',sql.BigInt,file.size)
        .query<{id:string}>(`INSERT dbo.TM_task_discussion_files(message_id,storage_key,original_file_name,mime_type,size_bytes)
          OUTPUT CONVERT(varchar(36),inserted.id) id VALUES(@messageId,@key,@name,@mime,@size);`);
      publishDiscussionEvent(scope,'file',{messageId});
      return {id:result.recordset[0].id};
    } catch(error){await removeStoredAttachment(key);throw error;}
  },
  async removeFile(userId:number,fileId:string){
    const pool=await getDatabasePool();
    const result=await pool.request().input('fileId',sql.UniqueIdentifier,fileId)
      .query<{taskId:number;subtaskId:number|null;authorUserId:number;messageDeletedAtUtc:Date|null;key:string}>(`
        SELECT m.task_id taskId,m.subtask_id subtaskId,m.author_user_id authorUserId,
          m.deleted_at_utc messageDeletedAtUtc,f.storage_key [key]
        FROM dbo.TM_task_discussion_files f
        JOIN dbo.TM_task_discussion_messages m ON m.id=f.message_id
        WHERE f.id=@fileId AND f.deleted_at_utc IS NULL;`);
    const file=result.recordset[0];
    if(!file || !canDeleteDiscussionAttachment(userId,file)) throw invalid('Attachment unavailable.');
    const scope=asScope(file);
    await assertDiscussionAccess(userId,scope,true);
    const storageKey=await withTransaction(async transaction=>{
      const updated=await transaction.request().input('fileId',sql.UniqueIdentifier,fileId)
        .input('actorId',sql.Int,userId).query<{key:string}>(`
          UPDATE f SET deleted_at_utc=SYSUTCDATETIME(),deleted_by_user_id=@actorId
          OUTPUT inserted.storage_key AS [key]
          FROM dbo.TM_task_discussion_files f
          JOIN dbo.TM_task_discussion_messages m ON m.id=f.message_id
          WHERE f.id=@fileId AND f.deleted_at_utc IS NULL AND m.deleted_at_utc IS NULL
            AND m.author_user_id=@actorId;`);
      if(!updated.recordset[0]) throw invalid('Attachment unavailable.');
      return updated.recordset[0].key;
    });
    await removeStoredAttachment(storageKey);
    publishDiscussionEvent(scope,'file-removed',{fileId});
  },
  async file(userId:number,fileId:string){
    const pool=await getDatabasePool();
    const result=await pool.request().input('fileId',sql.UniqueIdentifier,fileId)
      .query<{taskId:number;subtaskId:number|null;deletedAtUtc:Date|null;key:string;name:string;mime:string}>(`
        SELECT m.task_id taskId,m.subtask_id subtaskId,m.deleted_at_utc deletedAtUtc,
          f.storage_key [key],f.original_file_name name,f.mime_type mime
        FROM dbo.TM_task_discussion_files f
        JOIN dbo.TM_task_discussion_messages m ON m.id=f.message_id
        WHERE f.id=@fileId AND f.deleted_at_utc IS NULL;`);
    const row=result.recordset[0];if(!row||row.deletedAtUtc) throw invalid();
    await assertDiscussionAccess(userId,asScope(row));
    return {buffer:await readAttachment(row.key),name:recoverAttachmentFileName(row.name),mime:row.mime};
  }
};

