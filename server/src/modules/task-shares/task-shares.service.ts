import {randomUUID} from 'node:crypto';
import {getDatabasePool,sql} from '../../database/sql.js';
import {withTransaction} from '../../database/transaction.js';
import type {DatabaseTransaction} from '../../database/types.js';
import {AppError} from '../../shared/errors/app-error.js';
import {tasksRepository} from '../tasks/tasks.repository.js';
import {taskTagsSelectSql} from '../tags/task-tags.sql.js';
import {taskTypeConditionSql} from '../collaboration/collaboration-card-summary.sql.js';
import {getCurrentDateInAppTimeZone} from '../../shared/utils/date.utils.js';
import {notificationsRepository} from '../notifications/notifications.repository.js';
import type {SharePermission} from './task-shares.repository.js';

function fail(code:string,statusCode=403) {return new AppError({code,statusCode,message:code.replaceAll('_',' ').toLowerCase()});}
interface Recipient {userId:number;permission:SharePermission}
export interface SharedTaskItem {
 taskId:number;title:string;description:string|null;status:string;priority:string;dueDate:string|null;
 ownerUserId:number;ownerName:string;ownerCode:string;
 permission:SharePermission;sharedAtUtc:string;
 recipientCount:number;
 tags: Array<{id:number;name:string;scope:'SYSTEM'|'PERSONAL';iconKind:'SYSTEM'|'LUCIDE'|'UPLOAD';iconKey:string|null;color:string}>;
}
const taskProjection=`t.id AS taskId,t.title,t.description,t.status,t.priority,CONVERT(varchar(10),t.due_date,23) AS dueDate,
 t.created_at_utc AS createdAtUtc,t.owner_user_id AS ownerUserId,owner.USER_NAME AS ownerName,CONVERT(nvarchar(50),owner.USER_CODE) AS ownerCode,
 s.permission_code AS permission,CONVERT(varchar(30),s.updated_at_utc,126)+'Z' AS sharedAtUtc,
 (SELECT COUNT_BIG(*) FROM dbo.TM_task_shares total WHERE total.task_id=t.id AND total.revoked_at_utc IS NULL) AS recipientCount,${taskTagsSelectSql.replaceAll('task.id','t.id')}`;
async function assertOwner(tx:DatabaseTransaction,actor:number,taskId:number) {
 const task=await tasksRepository.findOwnedForUpdate(tx,actor,taskId);
 if(!task || task.kpiInstanceId!==null)throw fail('TASK_SHARING_UNAVAILABLE',404);
 return task;
}
async function notify(tx:DatabaseTransaction,userId:number,actorId:number,taskId:number,type:'TASK_SHARED'|'TASK_SHARE_UPDATED'|'TASK_SHARE_REVOKED',title:string) {
 const tick=randomUUID();
 await notificationsRepository.ensureGeneralTaskNotification(userId,{
  type,dedupeKey:`sharing:${type}:${taskId}:${userId}:${tick}:${actorId}`,
  taskId,listId:null,subjectTitle:title,
  contextTitle:type==='TASK_SHARED'?'A task was shared with you':type==='TASK_SHARE_UPDATED'?'Task sharing permission changed':'Task sharing access removed',
 },tx);
}
export const taskSharesService={
 /** Lists only authorized active share grants; every filter is applied before deduplication/pagination. */
 async list(actor:number,query:{
  tab:'with'|'by';search:string;page:number;pageSize:number;personId?:number;
  permission:'ALL'|SharePermission;status:'ALL'|'TODO'|'IN_PROGRESS'|'DONE'|'CANCELLED';
  priority:'ALL'|'LOW'|'MEDIUM'|'HIGH';taskType:'ALL'|'TEAM'|'SINGLE'|'PERSONAL';
  due:'ALL'|'OVERDUE'|'TODAY'|'UPCOMING'|'NO_DATE';
  sortBy:'createdAt'|'dueDate'|'priority'|'title'|'status';sortDirection:'asc'|'desc';
  tagIds?:string;tagMatch:'ANY'|'ALL'|'UNTAGGED';
 }) {
  const pool=await getDatabasePool();
  // Bracket-escape LIKE wildcards so user input remains literal.
  const escaped=query.search.replace(/\[/g,'[[]').replace(/%/g,'[%]').replace(/_/g,'[_]');
  const q=pool.request().input('actor',sql.Int,actor).input('search',sql.NVarChar(320),`%${escaped}%`)
   .input('personId',sql.Int,query.personId??null)
   .input('permission',sql.VarChar(8),query.permission).input('status',sql.VarChar(20),query.status)
   .input('priority',sql.VarChar(10),query.priority).input('taskType',sql.VarChar(12),query.taskType)
   .input('due',sql.VarChar(10),query.due).input('today',sql.Date,getCurrentDateInAppTimeZone())
   .input('tagIds',sql.VarChar(240),query.tagIds??null).input('tagMatch',sql.VarChar(8),query.tagMatch)
   .input('offset',sql.Int,(query.page-1)*query.pageSize).input('size',sql.Int,query.pageSize);
  const side=query.tab==='with'?'s.recipient_user_id=@actor':'t.owner_user_id=@actor';
  const personFilter=query.tab==='with'?'t.owner_user_id=@personId':'s.recipient_user_id=@personId';
  const sortColumns={
   createdAt:'createdAtUtc',
   dueDate:'CASE WHEN dueDate IS NULL THEN 1 ELSE 0 END, dueDate',
   priority:"CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END",
   title:'title',status:'status',
  } as const;
  const order=`${sortColumns[query.sortBy]} ${query.sortDirection==='asc'?'ASC':'DESC'},taskId DESC`;
  const active=`s.revoked_at_utc IS NULL AND t.deleted_at_utc IS NULL AND t.kpi_instance_id IS NULL AND (${side})
     AND (@personId IS NULL OR ${personFilter})
     AND (@permission='ALL' OR s.permission_code=@permission)
     AND (@search='%%' OR t.title LIKE @search OR owner.USER_NAME LIKE @search)
     AND (@status='ALL' OR t.status=@status) AND (@priority='ALL' OR t.priority=@priority)
     AND ${taskTypeConditionSql.replaceAll('task.id','t.id')}
     AND (@due='ALL' OR (@due='OVERDUE' AND t.due_date<@today AND t.status NOT IN ('DONE','CANCELLED'))
       OR (@due='TODAY' AND t.due_date=@today) OR (@due='UPCOMING' AND t.due_date>@today)
       OR (@due='NO_DATE' AND t.due_date IS NULL))
     AND ((@tagMatch='ANY' AND (@tagIds IS NULL OR EXISTS(
       SELECT 1 FROM dbo.TM_task_tags tt JOIN dbo.TM_tags tg ON tg.id=tt.tag_id AND tg.is_active=1
        WHERE tt.task_id=t.id AND tt.tag_id IN(SELECT TRY_CONVERT(BIGINT,value) FROM STRING_SPLIT(@tagIds,',')))))
       OR (@tagMatch='ALL' AND (@tagIds IS NULL OR NOT EXISTS(
         SELECT 1 FROM STRING_SPLIT(@tagIds,',') selected WHERE NOT EXISTS(
           SELECT 1 FROM dbo.TM_task_tags tt JOIN dbo.TM_tags tg ON tg.id=tt.tag_id AND tg.is_active=1
           WHERE tt.task_id=t.id AND tt.tag_id=TRY_CONVERT(BIGINT,selected.value)))))
       OR (@tagMatch='UNTAGGED' AND NOT EXISTS(SELECT 1 FROM dbo.TM_task_tags tt WHERE tt.task_id=t.id)))
     AND (NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ma WHERE ma.task_id=t.id)
       OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ma JOIN dbo.TM_meetings m ON m.id=ma.meeting_id
         WHERE ma.task_id=t.id AND (m.organizer_user_id=s.recipient_user_id OR EXISTS(
           SELECT 1 FROM dbo.TM_meeting_attendees a WHERE a.meeting_id=m.id AND a.attendee_user_id=s.recipient_user_id))))`;
  // Filter first, then select a single representative share for each task. Recipient
  // count intentionally covers every active grant, not just the selected person.
  const result=await q.query<SharedTaskItem & {total:number}>(`
    WITH share_rows AS (SELECT ${taskProjection},ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY s.updated_at_utc DESC,s.recipient_user_id) AS rn
    FROM dbo.TM_task_shares s JOIN dbo.TM_tasks t ON t.id=s.task_id JOIN dbo.users owner ON owner.USER_ID=t.owner_user_id
    JOIN dbo.TM_user_access grantee ON grantee.portal_user_id=s.recipient_user_id AND grantee.is_active=1
    JOIN dbo.users portal ON portal.USER_ID=s.recipient_user_id AND portal.IS_ACTIVE=1
    WHERE ${active})
    SELECT *,COUNT_BIG(*) OVER() AS total FROM share_rows WHERE rn=1 ORDER BY ${order}
    OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`);
  return {items:result.recordset.map(({total,...item})=>({...item,taskId:Number(item.taskId),ownerUserId:Number(item.ownerUserId),recipientCount:Number(item.recipientCount),
      tags: (()=>{try{return (JSON.parse((item as SharedTaskItem & {taskTagsJson?:string}).taskTagsJson??'[]') as Array<SharedTaskItem['tags'][number]>).map(tag=>({...tag,id:Number(tag.id)}))}catch{return []}})()})),
    total:Number(result.recordset[0]?.total??0),page:query.page,pageSize:query.pageSize};
 },
 /** Picker options are restricted to actual authorized sharing relationships. */
 async people(actor:number,tab:'with'|'by') {
  const pool=await getDatabasePool();
  const side=tab==='with'?'s.recipient_user_id=@actor':'t.owner_user_id=@actor';
  const who=tab==='with'?'owner':'portal';
  const result=await pool.request().input('actor',sql.Int,actor).query<{
    userId:number;userName:string;userCode:string;email:string|null
  }>(`
    SELECT DISTINCT ${who}.USER_ID AS userId,${who}.USER_NAME AS userName,
      CONVERT(nvarchar(50),${who}.USER_CODE) AS userCode,${who}.email
    FROM dbo.TM_task_shares s
    JOIN dbo.TM_tasks t ON t.id=s.task_id AND t.deleted_at_utc IS NULL AND t.kpi_instance_id IS NULL
    JOIN dbo.users owner ON owner.USER_ID=t.owner_user_id
    JOIN dbo.users portal ON portal.USER_ID=s.recipient_user_id AND portal.IS_ACTIVE=1
    JOIN dbo.TM_user_access grantee ON grantee.portal_user_id=s.recipient_user_id AND grantee.is_active=1
    WHERE s.revoked_at_utc IS NULL AND ${side}
      AND (NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ma WHERE ma.task_id=t.id)
       OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ma JOIN dbo.TM_meetings m ON m.id=ma.meeting_id
         WHERE ma.task_id=t.id AND (m.organizer_user_id=s.recipient_user_id OR EXISTS(
           SELECT 1 FROM dbo.TM_meeting_attendees a WHERE a.meeting_id=m.id AND a.attendee_user_id=s.recipient_user_id))))
    ORDER BY userName,userCode,userId`);
  return result.recordset.map(person=>({...person,userId:Number(person.userId)}));
 },
 async recipients(actor:number,taskId:number) {
  const pool=await getDatabasePool();
  const task=await pool.request().input('actor',sql.Int,actor).input('task',sql.BigInt,taskId)
   .query<{ownerUserId:number}>(`SELECT owner_user_id AS ownerUserId FROM dbo.TM_tasks WHERE id=@task AND owner_user_id=@actor AND kpi_instance_id IS NULL AND deleted_at_utc IS NULL`);
  if(!task.recordset.length)throw fail('TASK_SHARING_OWNER_ONLY');
  const result=await pool.request().input('task',sql.BigInt,taskId).query<{userId:number;userName:string;userCode:string;email:string|null;permission:SharePermission}>(`
    SELECT s.recipient_user_id AS userId,u.USER_NAME AS userName,CONVERT(nvarchar(50),u.USER_CODE) AS userCode,u.email,
      s.permission_code AS permission FROM dbo.TM_task_shares s JOIN dbo.users u ON u.USER_ID=s.recipient_user_id
    WHERE s.task_id=@task AND s.revoked_at_utc IS NULL ORDER BY u.USER_NAME`);
  return result.recordset;
 },
 async upsert(actor:number,taskId:number,recipients:Recipient[]) {
  if(new Set(recipients.map(x=>x.userId)).size!==recipients.length)throw fail('DUPLICATE_SHARE_RECIPIENT',400);
  await withTransaction(async tx=>{
   const task=await assertOwner(tx,actor,taskId);
   // Saving the dialog replaces the entire active recipient set atomically.
   // Validate desired recipients before revoking any existing access.
   for (const candidate of recipients) {
    if(candidate.userId===actor)throw fail('CANNOT_SHARE_WITH_SELF',400);
    const valid=await tx.request().input('user',sql.Int,candidate.userId).query(`SELECT 1 FROM dbo.TM_user_access a JOIN dbo.users u ON u.USER_ID=a.portal_user_id WHERE a.portal_user_id=@user AND a.is_active=1 AND u.IS_ACTIVE=1`);
    if(!valid.recordset.length)throw fail('INVALID_SHARE_RECIPIENT',400);
    const eligible=await tx.request().input('task',sql.BigInt,taskId).input('user',sql.Int,candidate.userId)
      .query(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items WHERE task_id=@task)
        OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ai JOIN dbo.TM_meetings m ON m.id=ai.meeting_id
          WHERE ai.task_id=@task AND (m.organizer_user_id=@user OR EXISTS(
            SELECT 1 FROM dbo.TM_meeting_attendees a WHERE a.meeting_id=m.id AND a.attendee_user_id=@user)))
        THEN 1 ELSE 0 END AS allowed`);
    if(!eligible.recordset[0]?.allowed)throw fail('MEETING_SHARE_RECIPIENT_NOT_ATTENDEE',403);
   }
   const oldGrants=await tx.request().input('task',sql.BigInt,taskId)
     .query<{userId:number}>(`SELECT recipient_user_id AS userId FROM dbo.TM_task_shares WITH(UPDLOCK,HOLDLOCK)
       WHERE task_id=@task AND revoked_at_utc IS NULL`);
   const desiredIds=new Set(recipients.map(r=>r.userId));
   for(const previous of oldGrants.recordset){
    if(desiredIds.has(previous.userId))continue;
    await tx.request().input('task',sql.BigInt,taskId).input('user',sql.Int,previous.userId).input('actor',sql.Int,actor)
      .query(`UPDATE dbo.TM_task_shares SET revoked_at_utc=SYSUTCDATETIME(),revoked_by_user_id=@actor,updated_at_utc=SYSUTCDATETIME()
       WHERE task_id=@task AND recipient_user_id=@user AND revoked_at_utc IS NULL`);
    await tasksRepository.addActivity(tx,actor,taskId,'TASK_SHARE_REVOKED',{recipientUserId:previous.userId},actor);
    await notify(tx,previous.userId,actor,taskId,'TASK_SHARE_REVOKED','Shared task access removed');
   }
   for(const recipient of recipients){
    if(recipient.userId===actor)throw fail('CANNOT_SHARE_WITH_SELF',400);
    const valid=await tx.request().input('user',sql.Int,recipient.userId).query(`SELECT 1 FROM dbo.TM_user_access a JOIN dbo.users u ON u.USER_ID=a.portal_user_id WHERE a.portal_user_id=@user AND a.is_active=1 AND u.IS_ACTIVE=1`);
    if(!valid.recordset.length)throw fail('INVALID_SHARE_RECIPIENT',400);
    // Meeting Action Items must not be exposed to non-attendees via task sharing.
    const meetingEligible=await tx.request().input('task',sql.BigInt,taskId).input('user',sql.Int,recipient.userId)
      .query(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items WHERE task_id=@task)
        OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ai JOIN dbo.TM_meetings m ON m.id=ai.meeting_id
          WHERE ai.task_id=@task AND (m.organizer_user_id=@user OR EXISTS(
            SELECT 1 FROM dbo.TM_meeting_attendees a WHERE a.meeting_id=m.id AND a.attendee_user_id=@user)))
        THEN 1 ELSE 0 END AS allowed`);
    if(!meetingEligible.recordset[0]?.allowed)throw fail('MEETING_SHARE_RECIPIENT_NOT_ATTENDEE',403);
    const prev=await tx.request().input('task',sql.BigInt,taskId).input('user',sql.Int,recipient.userId)
      .query<{permission:SharePermission;revokedAtUtc:Date|null}>(`SELECT permission_code AS permission,revoked_at_utc AS revokedAtUtc FROM dbo.TM_task_shares WITH(UPDLOCK,HOLDLOCK) WHERE task_id=@task AND recipient_user_id=@user`);
    const old=prev.recordset[0];
    if(old && !old.revokedAtUtc && old.permission===recipient.permission)continue;
    await tx.request().input('task',sql.BigInt,taskId).input('user',sql.Int,recipient.userId).input('actor',sql.Int,actor)
     .input('permission',sql.VarChar(8),recipient.permission).query(`
       IF EXISTS(SELECT 1 FROM dbo.TM_task_shares WHERE task_id=@task AND recipient_user_id=@user)
         UPDATE dbo.TM_task_shares SET permission_code=@permission,shared_by_user_id=@actor,revoked_at_utc=NULL,revoked_by_user_id=NULL,updated_at_utc=SYSUTCDATETIME()
         WHERE task_id=@task AND recipient_user_id=@user
       ELSE INSERT dbo.TM_task_shares(task_id,recipient_user_id,permission_code,shared_by_user_id)
         VALUES(@task,@user,@permission,@actor)`);
    await tasksRepository.addActivity(tx,actor,taskId,old&&!old.revokedAtUtc?'TASK_SHARE_UPDATED':'TASK_SHARED',
      {recipientUserId:recipient.userId,from:old?.permission??null,to:recipient.permission},actor);
    await notify(tx,recipient.userId,actor,taskId,old&&!old.revokedAtUtc?'TASK_SHARE_UPDATED':'TASK_SHARED',task.title);
   }
  });
 },
 async revoke(actor:number,taskId:number,user:number) {
  await withTransaction(async tx=>{
   const task=await assertOwner(tx,actor,taskId);
   const result=await tx.request().input('actor',sql.Int,actor).input('task',sql.BigInt,taskId).input('user',sql.Int,user)
    .query(`UPDATE dbo.TM_task_shares SET revoked_at_utc=SYSUTCDATETIME(),revoked_by_user_id=@actor,updated_at_utc=SYSUTCDATETIME()
    WHERE task_id=@task AND recipient_user_id=@user AND revoked_at_utc IS NULL`);
   if(!result.rowsAffected[0])throw fail('TASK_SHARE_NOT_FOUND',404);
   await tasksRepository.addActivity(tx,actor,taskId,'TASK_SHARE_REVOKED',{recipientUserId:user},actor);
   // Do not include task details in revoked-access notifications or email.
   await notify(tx,user,actor,taskId,'TASK_SHARE_REVOKED','Shared task access removed');
  });
 }
};

