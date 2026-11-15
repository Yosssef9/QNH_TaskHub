import { getDatabasePool, sql } from '../../database/sql.js';
import { withTransaction } from '../../database/transaction.js';
import type { DatabaseTransaction } from '../../database/types.js';
import { AppError } from '../../shared/errors/app-error.js';
import { resolveTaskAccess } from '../meeting-action-items/meeting-action-items.access.js';
import { tasksRepository } from '../tasks/tasks.repository.js';
import { canEditExpectedFinish, isValidExpectedFinishDate } from './expected-finishes.policy.js';

type Scope = { taskId: number; subtaskId: number | null };
type RawEstimate = { id:number; taskId:number; subtaskId:number|null; assigneeUserId:number;
  userName:string; expectedFinishDate:string|null; dueDate:string|null; canEdit:boolean };
type RawHistory = { id:number; subtaskId:number|null; assigneeUserId:number; userName:string;
  previousDate:string|null; newDate:string|null; changedAtUtc:Date };

const missing=()=>new AppError({statusCode:404,code:'EXPECTED_FINISH_NOT_FOUND',message:'Task or assignment was not found.'});
const denied=()=>new AppError({statusCode:403,code:'EXPECTED_FINISH_FORBIDDEN',message:'Only the currently assigned employee can edit their own estimate.'});

/** An owner may read all, but only direct assignees may edit their own estimate.
 *  Task shares and proxies never grant estimate editing or visibility to peers.
 */
async function ensureAccess(actorId:number,taskId:number,transaction?:DatabaseTransaction) {
  const access=await resolveTaskAccess(actorId,taskId,false,transaction);
  if(!access) throw missing();
  const request=transaction ? transaction.request() : (await getDatabasePool()).request();
  const rows=await request.input('taskId',sql.BigInt,taskId).query<{
    id:number;ownerUserId:number;status:string;kpiInstanceId:number|null;
  }>(`SELECT id,owner_user_id AS ownerUserId,status,kpi_instance_id AS kpiInstanceId
      FROM dbo.TM_tasks WHERE id=@taskId AND deleted_at_utc IS NULL;`);
  const task=rows.recordset[0];
  if(!task || task.kpiInstanceId!==null) throw missing();
  return {ownerId:task.ownerUserId,cancelled:task.status==='CANCELLED',collaborative:Boolean(access.collaborationActive)};
}

/** Query current assignment membership, never a historical proxy or replaced assignee. */
const currentAssignmentsSql=`
  SELECT a.task_id AS taskId,a.subtask_id AS subtaskId,a.assignee_user_id AS assigneeUserId,
    a.id AS collaborationAssignmentId,
    CASE WHEN a.subtask_id IS NULL THEN t.due_date ELSE s.due_date END AS rawDueDate
  FROM dbo.TM_collaboration_assignments a
  JOIN dbo.TM_tasks t ON t.id=a.task_id
  LEFT JOIN dbo.TM_subtasks s ON s.id=a.subtask_id AND s.deleted_at_utc IS NULL
  WHERE a.task_id=@taskId AND a.is_active=1
    AND (a.subtask_id IS NULL OR s.id IS NOT NULL)
  UNION ALL
  SELECT t.id AS taskId,NULL AS subtaskId,g.assignee_user_id AS assigneeUserId,
    NULL AS collaborationAssignmentId,t.due_date AS rawDueDate
  FROM dbo.TM_tasks t JOIN dbo.TM_general_task_assignments g ON g.task_id=t.id
  WHERE t.id=@taskId AND g.assignee_user_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
    AND NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items m WHERE m.task_id=t.id)
  UNION ALL
  SELECT s.task_id AS taskId,s.id AS subtaskId,
    COALESCE(s.assignee_user_id,g.assignee_user_id) AS assigneeUserId,
    NULL AS collaborationAssignmentId,s.due_date AS rawDueDate
  FROM dbo.TM_subtasks s JOIN dbo.TM_tasks t ON t.id=s.task_id
  LEFT JOIN dbo.TM_general_task_assignments g ON g.task_id=s.task_id
  WHERE s.task_id=@taskId AND s.deleted_at_utc IS NULL
    AND COALESCE(s.assignee_user_id,g.assignee_user_id) IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
    AND NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items m WHERE m.task_id=t.id)
  UNION ALL
  SELECT t.id AS taskId,NULL AS subtaskId,m.assignee_user_id AS assigneeUserId,
    NULL AS collaborationAssignmentId,t.due_date AS rawDueDate
  FROM dbo.TM_tasks t JOIN dbo.TM_meeting_action_items m ON m.task_id=t.id
  WHERE t.id=@taskId AND NOT EXISTS(
    SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
  UNION ALL
  SELECT s.task_id AS taskId,s.id AS subtaskId,
    COALESCE(s.assignee_user_id,m.assignee_user_id) AS assigneeUserId,
    NULL AS collaborationAssignmentId,s.due_date AS rawDueDate
  FROM dbo.TM_subtasks s JOIN dbo.TM_tasks t ON t.id=s.task_id
  JOIN dbo.TM_meeting_action_items m ON m.task_id=s.task_id
  WHERE s.task_id=@taskId AND s.deleted_at_utc IS NULL AND NOT EXISTS(
    SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
`;

export const expectedFinishesService={
  async view(actorId:number,taskId:number) {
    const context=await ensureAccess(actorId,taskId);
    const isOwner=actorId===context.ownerId;
    const pool=await getDatabasePool();
    const data=await pool.request().input('taskId',sql.BigInt,taskId)
      .input('actorId',sql.Int,actorId).input('ownerId',sql.Int,context.ownerId)
      .query<RawEstimate>(`WITH current_members AS (${currentAssignmentsSql})
        SELECT estimate.id,member.taskId,member.subtaskId,member.assigneeUserId,
          COALESCE(person.USER_NAME,person.USER_CODE) AS userName,
          CONVERT(VARCHAR(10),estimate.expected_finish_date,23) AS expectedFinishDate,
          CONVERT(VARCHAR(10),member.rawDueDate,23) AS dueDate,
          CAST(CASE WHEN member.assigneeUserId=@actorId AND @actorId<>@ownerId
            THEN 1 ELSE 0 END AS bit) AS canEdit
        FROM current_members member
        JOIN dbo.users person ON person.USER_ID=member.assigneeUserId
        LEFT JOIN dbo.TM_assignment_expected_finishes estimate
          ON estimate.task_id=member.taskId AND estimate.is_active=1
          AND (estimate.subtask_id=member.subtaskId OR estimate.subtask_id IS NULL AND member.subtaskId IS NULL)
          AND estimate.assignee_user_id=member.assigneeUserId
          AND (estimate.collaboration_assignment_id=member.collaborationAssignmentId
            OR estimate.collaboration_assignment_id IS NULL AND member.collaborationAssignmentId IS NULL)
        WHERE (@actorId=@ownerId OR member.assigneeUserId=@actorId)
          AND member.assigneeUserId<>@ownerId
        ORDER BY member.subtaskId,member.assigneeUserId;`);
    const history=await pool.request().input('taskId',sql.BigInt,taskId)
      .input('actorId',sql.Int,actorId).input('ownerId',sql.Int,context.ownerId)
      .query<RawHistory>(`SELECT changes.id,estimate.subtask_id AS subtaskId,
        estimate.assignee_user_id AS assigneeUserId,
        COALESCE(person.USER_NAME,person.USER_CODE) AS userName,
        CONVERT(VARCHAR(10),changes.previous_date,23) AS previousDate,
        CONVERT(VARCHAR(10),changes.new_date,23) AS newDate,
        changes.changed_at_utc AS changedAtUtc
        FROM dbo.TM_assignment_expected_finish_changes changes
        JOIN dbo.TM_assignment_expected_finishes estimate ON estimate.id=changes.estimate_id
        JOIN dbo.users person ON person.USER_ID=estimate.assignee_user_id
        WHERE estimate.task_id=@taskId AND (@actorId=@ownerId OR
          estimate.assignee_user_id=@actorId AND estimate.is_active=1 AND EXISTS (
            SELECT 1 FROM dbo.TM_tasks t
            LEFT JOIN dbo.TM_general_task_assignments g ON g.task_id=t.id
            LEFT JOIN dbo.TM_subtasks s ON s.id=estimate.subtask_id AND s.deleted_at_utc IS NULL
            LEFT JOIN dbo.TM_collaboration_assignments a ON a.id=estimate.collaboration_assignment_id
            WHERE t.id=estimate.task_id AND
              (a.id IS NOT NULL AND a.is_active=1 AND a.assignee_user_id=@actorId
               OR a.id IS NULL AND NOT EXISTS (
                 SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
                 AND (estimate.subtask_id IS NULL AND g.assignee_user_id=@actorId
                   OR estimate.subtask_id IS NOT NULL AND s.id IS NOT NULL
                     AND COALESCE(s.assignee_user_id,g.assignee_user_id)=@actorId)
                 OR a.id IS NULL AND NOT EXISTS (
                   SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
                 AND EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items mi WHERE mi.task_id=t.id
                   AND (estimate.subtask_id IS NULL AND mi.assignee_user_id=@actorId
                     OR estimate.subtask_id IS NOT NULL AND s.id IS NOT NULL
                       AND COALESCE(s.assignee_user_id,mi.assignee_user_id)=@actorId)))))
        ORDER BY changes.changed_at_utc DESC,changes.id DESC;`);
    return {estimates:data.recordset.map(row=>({...row,id:row.id??null,
      taskId:Number(row.taskId),subtaskId:row.subtaskId===null?null:Number(row.subtaskId),
      assigneeUserId:Number(row.assigneeUserId),canEdit:Boolean(row.canEdit)})),
      history:history.recordset.map(row=>({...row,id:Number(row.id),
        subtaskId:row.subtaskId===null?null:Number(row.subtaskId),changedAtUtc:row.changedAtUtc.toISOString()})),
      canViewAll:isOwner};
  },
  async update(actorId:number,scope:Scope,value:string|null) {
    if(!isValidExpectedFinishDate(value)) throw new AppError({statusCode:400,
      code:'EXPECTED_FINISH_INVALID_DATE',message:'Use a valid YYYY-MM-DD date.'});
    await withTransaction(async(transaction)=>{
      const context=await ensureAccess(actorId,scope.taskId,transaction);
      if(context.cancelled) throw denied();
      // Serializes changes and membership reads with task updates; UNIQUE indexes
      // additionally prevent duplicate active estimates under concurrent requests.
      await transaction.request().input('taskId',sql.BigInt,scope.taskId)
        .query(`SELECT id FROM dbo.TM_tasks WITH(UPDLOCK,HOLDLOCK) WHERE id=@taskId;`);
      const all=await transaction.request().input('taskId',sql.BigInt,scope.taskId)
        .query<{subtaskId:number|null;assigneeUserId:number;collaborationAssignmentId:number|null}>(
          `WITH current_members AS (${currentAssignmentsSql}) SELECT subtaskId,assigneeUserId,
            collaborationAssignmentId FROM current_members;`);
      const member=all.recordset.find(row=>
        (row.subtaskId===null?null:Number(row.subtaskId))===scope.subtaskId &&
        row.assigneeUserId===actorId);
      if(!member || !canEditExpectedFinish({actorId,assigneeId:member.assigneeUserId,
        ownerId:context.ownerId,active:true,cancelled:context.cancelled})) throw denied();
      const existing=await transaction.request().input('taskId',sql.BigInt,scope.taskId)
        .input('subtaskId',sql.BigInt,scope.subtaskId).input('actorId',sql.Int,actorId)
        .input('collaborationId',sql.BigInt,member.collaborationAssignmentId)
        .query<{id:number;currentDate:string|null}>(`SELECT id,
          CONVERT(VARCHAR(10),expected_finish_date,23) AS currentDate
          FROM dbo.TM_assignment_expected_finishes WITH(UPDLOCK,HOLDLOCK)
          WHERE task_id=@taskId AND is_active=1 AND assignee_user_id=@actorId
            AND (subtask_id=@subtaskId OR subtask_id IS NULL AND @subtaskId IS NULL)
            AND (collaboration_assignment_id=@collaborationId OR
                 collaboration_assignment_id IS NULL AND @collaborationId IS NULL);`);
      const previous=existing.recordset[0]?.currentDate??null;
      if(previous===value) return; // No audit noise for identical values.
      let estimateId:number;
      if(existing.recordset[0]) {
        estimateId=Number(existing.recordset[0].id);
        await transaction.request().input('estimateId',sql.BigInt,estimateId)
          .input('value',sql.VarChar(10),value).query(`UPDATE dbo.TM_assignment_expected_finishes
          SET expected_finish_date=CONVERT(DATE,@value,23),updated_at_utc=SYSUTCDATETIME() WHERE id=@estimateId;`);
      } else {
        const inserted=await transaction.request().input('taskId',sql.BigInt,scope.taskId)
          .input('subtaskId',sql.BigInt,scope.subtaskId).input('actorId',sql.Int,actorId)
          .input('collaborationId',sql.BigInt,member.collaborationAssignmentId).input('value',sql.VarChar(10),value)
          .query<{id:number}>(`INSERT dbo.TM_assignment_expected_finishes
            (task_id,subtask_id,assignee_user_id,collaboration_assignment_id,expected_finish_date)
            OUTPUT inserted.id AS id VALUES(@taskId,@subtaskId,@actorId,@collaborationId,CONVERT(DATE,@value,23));`);
        estimateId=Number(inserted.recordset[0]!.id);
      }
      await transaction.request().input('estimateId',sql.BigInt,estimateId)
        .input('actorId',sql.Int,actorId).input('old',sql.VarChar(10),previous)
        .input('next',sql.VarChar(10),value).query(`INSERT dbo.TM_assignment_expected_finish_changes
          (estimate_id,actor_user_id,previous_date,new_date) VALUES(@estimateId,@actorId,CONVERT(DATE,@old,23),CONVERT(DATE,@next,23));`);
      await tasksRepository.addActivity(transaction,context.ownerId,scope.taskId,'EXPECTED_FINISH_CHANGED',{
        subtaskId:scope.subtaskId,assigneeUserId:actorId,
        changes:[{field:'expectedFinishDate',from:previous,to:value}],
      },actorId);
    });
    return this.view(actorId,scope.taskId);
  },
};
