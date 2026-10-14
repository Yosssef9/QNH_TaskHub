import { getDatabasePool, sql } from '../../database/sql.js';
import type { DatabaseTransaction } from '../../database/types.js';
import { withTransaction } from '../../database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import { resolveTaskAccess } from '../meeting-action-items/meeting-action-items.access.js';
import { tasksRepository } from '../tasks/tasks.repository.js';

export type TagView = { id:number;name:string;scope:'SYSTEM'|'PERSONAL';iconKind:'SYSTEM'|'LUCIDE'|'UPLOAD';iconKey:string|null;color:string;ownerUserId?:number|null;selectable?:boolean };
type TagRow = {id:number|string;name:string;scope:TagView['scope'];iconKind:TagView['iconKind'];iconKey:string|null;color:string;ownerUserId:number|null};
const selection = `tag.id, tag.name, tag.scope,tag.icon_kind AS iconKind,tag.icon_key AS iconKey,tag.color,tag.owner_user_id AS ownerUserId`;
const fail=(code:string,statusCode=403)=>new AppError({code,statusCode,message:code.replaceAll('_',' ').toLowerCase()});
const tagIds=(ids:number[]) => [...new Set(ids)].sort((a,b)=>a-b);

/** The SQL BIGINT identity is returned as a string by some SQL Server drivers. */
function toTagView(row:TagRow, selectable:boolean):TagView {
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw fail('INVALID_TAG_ID',500);
  return {...row,id,selectable};
}


async function hasTaskAccess(userId:number,tagId:number) {
  const pool=await getDatabasePool();
  const tasks=await pool.request().input('tagId',sql.BigInt,tagId).query<{taskId:number}>(`
    SELECT tt.task_id AS taskId FROM dbo.TM_task_tags tt
    JOIN dbo.TM_tasks task ON task.id=tt.task_id AND task.deleted_at_utc IS NULL
    WHERE tt.tag_id=@tagId ORDER BY tt.task_id DESC`);
  for (const task of tasks.recordset) if (await resolveTaskAccess(userId,Number(task.taskId))) return true;
  return false;
}

export const tagsService = {
  async list(userId:number,includeShared=true):Promise<TagView[]> {
    const pool=await getDatabasePool();
    const records=await pool.request().input('actor',sql.Int,userId).query<TagRow>(`
      SELECT ${selection} FROM dbo.TM_tags tag
      WHERE tag.is_active=1 AND (tag.scope='SYSTEM' OR tag.owner_user_id=@actor)
      ORDER BY CASE WHEN tag.scope='SYSTEM' THEN 0 ELSE 1 END,tag.name`);
    const owned = records.recordset.map(t=>toTagView(t,true));
    if (!includeShared) return owned;
    // A personal tag used on someone else's accessible task is filterable but not reusable.
    const shared=await pool.request().input('actor',sql.Int,userId).query<TagRow>(`
      SELECT DISTINCT ${selection} FROM dbo.TM_tags tag
      JOIN dbo.TM_task_tags tt ON tt.tag_id=tag.id
      JOIN dbo.TM_tasks task ON task.id=tt.task_id AND task.deleted_at_utc IS NULL
      LEFT JOIN dbo.TM_meeting_action_items actionItem ON actionItem.task_id=task.id
      WHERE tag.is_active=1 AND tag.scope='PERSONAL' AND tag.owner_user_id<>@actor
        AND (task.owner_user_id=@actor
          OR EXISTS (SELECT 1 FROM dbo.TM_task_shares share WHERE share.task_id=task.id AND share.recipient_user_id=@actor AND share.revoked_at_utc IS NULL)
          OR EXISTS (SELECT 1 FROM dbo.TM_collaboration_assignments a WHERE a.task_id=task.id AND a.assignee_user_id=@actor AND a.is_active=1)
          OR EXISTS (SELECT 1 FROM dbo.TM_general_task_assignments ga WHERE ga.task_id=task.id AND ga.assignee_user_id=@actor)
          OR actionItem.task_id IS NOT NULL AND EXISTS(
            SELECT 1 FROM dbo.TM_meetings meeting WHERE meeting.id=actionItem.meeting_id
              AND (meeting.organizer_user_id=@actor OR EXISTS(
                SELECT 1 FROM dbo.TM_meeting_attendees attendee
                WHERE attendee.meeting_id=meeting.id AND attendee.attendee_user_id=@actor)))
          OR EXISTS (SELECT 1 FROM dbo.TM_subtasks child WHERE child.task_id=task.id
             AND child.deleted_at_utc IS NULL AND child.assignee_user_id=@actor))`);
    const seen=new Set(owned.map(t=>t.id));
    // Do not rely on the coarse SQL candidate condition as an authorization grant:
    // Meeting attendees and assignments can change, so confirm current access.
    const verified:TagView[]=[];
    for (const row of shared.recordset) {
      const tag = toTagView(row,false);
      if (seen.has(tag.id)) continue;
      if (await hasTaskAccess(userId,tag.id)) verified.push(tag);
    }
    return [...owned,...verified];
  },
  async create(actor:number,input:{name:string;iconKind:'LUCIDE'|'UPLOAD';iconKey?:string; color:string;image?:Buffer;mime?:string}):Promise<TagView> {
    const name=input.name.trim();
    if (['QNH','QMS'].includes(name.toUpperCase())) throw fail('RESERVED_TAG_NAME',400);
    if (input.iconKind==='UPLOAD' && (!input.image || !input.mime)) throw fail('TAG_IMAGE_REQUIRED',400);
    const pool=await getDatabasePool();
    const existing=await pool.request().input('actor',sql.Int,actor).input('name',sql.NVarChar(80),name)
      .query<{id:number}>(`SELECT id FROM dbo.TM_tags WHERE (scope='SYSTEM' OR owner_user_id=@actor) AND is_active=1 AND UPPER(LTRIM(RTRIM(name)))=UPPER(@name)`);
    if (existing.recordset.length) throw fail('TAG_NAME_ALREADY_EXISTS',409);
    const result=await pool.request().input('actor',sql.Int,actor).input('name',sql.NVarChar(80),name)
      .input('iconKind',sql.VarChar(12),input.iconKind).input('iconKey',sql.VarChar(80),input.iconKind==='LUCIDE'?(input.iconKey??'tag'):null)
      .input('mime',sql.VarChar(20),input.mime??null).input('image',sql.VarBinary(sql.MAX),input.image??null)
      .input('color',sql.Char(7),input.color).query<TagRow>(`
        INSERT dbo.TM_tags(scope,owner_user_id,name,icon_kind,icon_key,icon_mime,icon_data,color,created_by_user_id)
        OUTPUT inserted.id,inserted.name,inserted.scope,inserted.icon_kind AS iconKind,
          inserted.icon_key AS iconKey,inserted.color,inserted.owner_user_id AS ownerUserId
        VALUES ('PERSONAL',@actor,@name,@iconKind,@iconKey,@mime,@image,@color,@actor)`);
    return toTagView(result.recordset[0]!,true);
  },
  async update(actor:number,id:number,input:{name:string;color:string;iconKind:'LUCIDE'|'UPLOAD';iconKey?:string;image?:Buffer;mime?:string}):Promise<void> {
    if (['QNH','QMS'].includes(input.name.trim().toUpperCase())) throw fail('RESERVED_TAG_NAME',400);
    const pool=await getDatabasePool();
    const existing=await pool.request().input('actor',sql.Int,actor).input('id',sql.BigInt,id).input('name',sql.NVarChar(80),input.name)
      .query<{id:number}>(`SELECT id FROM dbo.TM_tags WHERE owner_user_id=@actor AND id<>@id AND is_active=1 AND UPPER(LTRIM(RTRIM(name)))=UPPER(@name)`);
    if (existing.recordset.length) throw fail('TAG_NAME_ALREADY_EXISTS',409);
    const result=await pool.request().input('actor',sql.Int,actor).input('id',sql.BigInt,id)
      .input('name',sql.NVarChar(80),input.name.trim()).input('color',sql.Char(7),input.color)
      .input('kind',sql.VarChar(12),input.iconKind)
      .input('key',sql.VarChar(80),input.iconKind==='LUCIDE'?(input.iconKey??'tag'):null)
      .input('mime',sql.VarChar(20),input.mime??null).input('image',sql.VarBinary(sql.MAX),input.image??null)
      .query(`UPDATE dbo.TM_tags SET name=@name,color=@color,icon_kind=@kind,icon_key=@key,
        icon_mime=CASE WHEN @kind='UPLOAD' THEN COALESCE(@mime,icon_mime) ELSE NULL END,
        icon_data=CASE WHEN @kind='UPLOAD' THEN COALESCE(@image,icon_data) ELSE NULL END,updated_at_utc=SYSUTCDATETIME()
        WHERE id=@id AND owner_user_id=@actor AND is_active=1`);
    if (!result.rowsAffected[0]) throw fail('TAG_NOT_FOUND',404);
  },
  async archive(actor:number,id:number) {
    const pool=await getDatabasePool();
    const result=await pool.request().input('actor',sql.Int,actor).input('id',sql.BigInt,id)
      .query(`UPDATE dbo.TM_tags SET is_active=0,updated_at_utc=SYSUTCDATETIME()
        WHERE id=@id AND owner_user_id=@actor AND scope='PERSONAL' AND is_active=1`);
    if (!result.rowsAffected[0]) throw fail('TAG_NOT_FOUND',404);
  },
  async image(actor:number,id:number):Promise<{mime:string;image:Buffer}> {
    const pool=await getDatabasePool();
    const result=await pool.request().input('id',sql.BigInt,id)
      .query<{ownerUserId:number|null;scope:string;mime:string|null;image:Buffer|null}>(`
        SELECT owner_user_id AS ownerUserId,scope,icon_mime AS mime,icon_data AS image
        FROM dbo.TM_tags WHERE id=@id AND is_active=1 AND icon_kind='UPLOAD'`);
    const tag=result.recordset[0];
    if (!tag || !tag.image || !tag.mime) throw fail('TAG_IMAGE_NOT_FOUND',404);
    if (tag.ownerUserId!==actor && tag.scope!=='SYSTEM' && !(await hasTaskAccess(actor,id))) throw fail('TAG_IMAGE_NOT_FOUND',404);
    return {mime:tag.mime,image:tag.image};
  },
  async replaceTaskTags(transaction:DatabaseTransaction,actor:number,taskId:number,ids:number[]):Promise<void> {
    const selected=tagIds(ids);
    if(selected.length>8) throw fail('TOO_MANY_TASK_TAGS',400);
    const request=transaction.request().input('actor',sql.Int,actor).input('taskId',sql.BigInt,taskId)
      .input('ids',sql.NVarChar(sql.MAX),JSON.stringify(selected));
    const found=await request.query<{id:number}>(`SELECT tag.id FROM dbo.TM_tags tag
      WHERE tag.id IN (SELECT TRY_CONVERT(BIGINT,value) FROM OPENJSON(@ids))
        AND tag.is_active=1 AND (tag.scope='SYSTEM' OR tag.owner_user_id=@actor
          OR EXISTS (SELECT 1 FROM dbo.TM_task_tags existing WHERE existing.task_id=@taskId AND existing.tag_id=tag.id))`);
    if (found.recordset.length!==selected.length) throw fail('TAG_NOT_SELECTABLE',403);
    await transaction.request().input('taskId',sql.BigInt,taskId).query(`DELETE FROM dbo.TM_task_tags WHERE task_id=@taskId`);
    if (selected.length) await transaction.request().input('actor',sql.Int,actor).input('taskId',sql.BigInt,taskId)
      .input('ids',sql.NVarChar(sql.MAX),JSON.stringify(selected)).query(`INSERT INTO dbo.TM_task_tags(task_id,tag_id,assigned_by_user_id)
        SELECT @taskId,tag.id,@actor FROM dbo.TM_tags tag WHERE tag.id IN
        (SELECT TRY_CONVERT(BIGINT,value) FROM OPENJSON(@ids))`);
  },
  async assign(actor:number,taskId:number,ids:number[]) {
    return withTransaction(async tx=>{
      const access=await resolveTaskAccess(actor,taskId,false,tx);
      if (!access) throw fail('TASK_NOT_FOUND',404);
      if (!access.capabilities.canEditDetails) throw fail('TASK_TAG_EDIT_FORBIDDEN',403);
      const task=await tasksRepository.findOwnedForUpdate(tx,access.ownerUserId,taskId);
      if(!task || task.kpiInstanceId!==null) throw fail('TASK_TAG_EDIT_FORBIDDEN',403);
      const before=await tx.request().input('id',sql.BigInt,taskId).query<{tagId:number}>(
        `SELECT tag_id AS tagId FROM dbo.TM_task_tags WHERE task_id=@id`);
      await tagsService.replaceTaskTags(tx,actor,taskId,ids);
      await tasksRepository.addActivity(tx,access.ownerUserId,taskId,'TAGS_CHANGED',
        {previousTagIds:before.recordset.map(r=>Number(r.tagId)),tagIds:tagIds(ids)},actor);
    });
  },
};
