import { getDatabasePool, sql } from "../../database/sql.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { taskTagsSelectSql,taskTagsFilterSql } from "../tags/task-tags.sql.js";
import { collaborationCardSummarySql, taskTypeConditionSql } from "../collaboration/collaboration-card-summary.sql.js";
import { normalizeSqlRowVersion } from "../../shared/utils/sql-row-version.js";

export interface GeneralAssignmentContext {
  taskId: number;
  ownerUserId: number;
  assigneeUserId: number | null;
  assignedByUserId: number;
  assignedAtUtc: string;
  rowVersion: string;
}

type RelationRecord = {
  taskId: number | string;
  ownerUserId: number;
  assigneeUserId: number | null;
  assignedByUserId: number;
  assignedAtUtc: Date;
  rowVersion: unknown;
};

function mapRelation(row: RelationRecord): GeneralAssignmentContext {
  const rowVersion = normalizeSqlRowVersion(row.rowVersion);
  if (!rowVersion) throw new Error("Invalid general task assignment rowversion.");
  return {
    taskId: Number(row.taskId), ownerUserId: row.ownerUserId,
    assigneeUserId: row.assigneeUserId, assignedByUserId: row.assignedByUserId,
    assignedAtUtc: row.assignedAtUtc.toISOString(), rowVersion,
  };
}

export const generalTaskAssignmentsRepository = {
  async findContext(taskId: number, transaction?: DatabaseTransaction): Promise<GeneralAssignmentContext | null> {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request.input("taskId", sql.BigInt, taskId).query<RelationRecord>(`
      SELECT relation.task_id AS taskId, relation.owner_user_id AS ownerUserId,
        relation.assignee_user_id AS assigneeUserId,
        relation.assigned_by_user_id AS assignedByUserId,
        relation.assigned_at_utc AS assignedAtUtc, relation.row_version AS rowVersion
      FROM dbo.TM_general_task_assignments relation
      INNER JOIN dbo.TM_tasks task ON task.id = relation.task_id
      WHERE relation.task_id=@taskId AND task.kpi_instance_id IS NULL;`);
    return result.recordset[0] ? mapRelation(result.recordset[0]) : null;
  },

  async isEligibleUser(userId: number, transaction: DatabaseTransaction): Promise<boolean> {
    const result = await transaction.request().input("userId", sql.Int, userId).query<{ userId: number }>(`
      SELECT TOP (1) access.portal_user_id AS userId
      FROM dbo.TM_user_access access JOIN dbo.users portal ON portal.USER_ID=access.portal_user_id
      WHERE access.portal_user_id=@userId AND access.is_active=1 AND portal.IS_ACTIVE=1;`);
    return !!result.recordset[0];
  },

  async ensureRelation(transaction: DatabaseTransaction, taskId: number, ownerUserId: number,
    actorUserId: number, assigneeUserId: number | null, changeMain = false): Promise<void> {
    await transaction.request().input("taskId", sql.BigInt, taskId)
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("actorUserId", sql.Int, actorUserId)
      .input("assigneeUserId", sql.Int, assigneeUserId)
      .input("changeMain", sql.Bit, changeMain)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.TM_meeting_action_items WHERE task_id=@taskId)
          THROW 54820, 'Meeting assignments must use the Meeting workflow.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.TM_tasks WHERE id=@taskId AND owner_user_id=@ownerUserId
          AND list_id IS NOT NULL AND kpi_instance_id IS NULL AND deleted_at_utc IS NULL)
          THROW 54821, 'Only active normal tasks can have general assignees.', 1;
        IF EXISTS (SELECT 1 FROM dbo.TM_general_task_assignments WITH (UPDLOCK, HOLDLOCK)
          WHERE task_id=@taskId)
        BEGIN
          IF @changeMain=1
            UPDATE dbo.TM_general_task_assignments
               SET assignee_user_id=@assigneeUserId, assigned_by_user_id=@actorUserId,
                   assigned_at_utc=SYSUTCDATETIME() WHERE task_id=@taskId;
        END
        ELSE
          INSERT dbo.TM_general_task_assignments(task_id, owner_user_id, assignee_user_id, assigned_by_user_id)
          VALUES(@taskId, @ownerUserId, @assigneeUserId, @actorUserId);`);
  },

  async setSubtaskAssignee(transaction: DatabaseTransaction, ownerUserId: number, subtaskId: number,
    assigneeUserId: number | null): Promise<void> {
    await transaction.request().input("ownerUserId", sql.Int, ownerUserId)
      .input("subtaskId", sql.BigInt, subtaskId).input("assigneeUserId", sql.Int, assigneeUserId)
      .query(`UPDATE dbo.TM_subtasks SET assignee_user_id=@assigneeUserId,assignment_changed_at_utc=SYSUTCDATETIME(),updated_at_utc=SYSUTCDATETIME()
        WHERE id=@subtaskId AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
  },

  async effectiveSubtaskAssignee(ownerUserId: number, subtaskId: number, transaction?: DatabaseTransaction): Promise<number | null> {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request.input("ownerUserId", sql.Int, ownerUserId)
      .input("subtaskId", sql.BigInt, subtaskId).query<{ assigneeUserId: number | null }>(`
      SELECT COALESCE(subtask.assignee_user_id, meeting.assignee_user_id, relation.assignee_user_id, task.owner_user_id) AS assigneeUserId
      FROM dbo.TM_subtasks subtask JOIN dbo.TM_tasks task ON task.id=subtask.task_id
      LEFT JOIN dbo.TM_general_task_assignments relation ON relation.task_id=task.id
      LEFT JOIN dbo.TM_meeting_action_items meeting ON meeting.task_id=task.id
      WHERE subtask.owner_user_id=@ownerUserId AND subtask.id=@subtaskId
        AND subtask.deleted_at_utc IS NULL AND task.deleted_at_utc IS NULL;`);
    return result.recordset[0]?.assigneeUserId ?? null;
  },

  async visibleSubtaskIds(taskId: number, actorUserId: number, transaction?: DatabaseTransaction): Promise<number[]> {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request.input("taskId", sql.BigInt, taskId)
      .input("actorUserId", sql.Int, actorUserId).query<{ id: number | string }>(`
      SELECT subtask.id FROM dbo.TM_subtasks subtask
      JOIN dbo.TM_tasks task ON task.id=subtask.task_id AND task.owner_user_id=subtask.owner_user_id
      LEFT JOIN dbo.TM_general_task_assignments relation ON relation.task_id=task.id
      LEFT JOIN dbo.TM_meeting_action_items meeting ON meeting.task_id=task.id
      WHERE (relation.task_id IS NOT NULL OR meeting.task_id IS NOT NULL) AND task.id=@taskId AND task.deleted_at_utc IS NULL AND subtask.deleted_at_utc IS NULL
        AND COALESCE(subtask.assignee_user_id,meeting.assignee_user_id,relation.assignee_user_id,task.owner_user_id)=@actorUserId;`);
    return result.recordset.map(row => Number(row.id));
  },

  async hasAccessToTask(taskId: number, actorUserId: number, transaction?: DatabaseTransaction): Promise<boolean> {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request.input("taskId", sql.BigInt, taskId)
      .input("actorUserId", sql.Int, actorUserId).query<{ allowed: number }>(`
      SELECT TOP (1) 1 AS allowed FROM dbo.TM_general_task_assignments relation
      JOIN dbo.TM_tasks task ON task.id=relation.task_id
      JOIN dbo.TM_user_access access ON access.portal_user_id=@actorUserId AND access.is_active=1
      JOIN dbo.users portal ON portal.USER_ID=access.portal_user_id AND portal.IS_ACTIVE=1
      WHERE relation.task_id=@taskId AND task.deleted_at_utc IS NULL
        AND (relation.assignee_user_id=@actorUserId OR EXISTS(
          SELECT 1 FROM dbo.TM_subtasks subtask
          WHERE subtask.task_id=task.id AND subtask.deleted_at_utc IS NULL
            AND COALESCE(subtask.assignee_user_id,relation.assignee_user_id,task.owner_user_id)=@actorUserId));`);
    return !!result.recordset[0];
  },

  async countIncompleteSubtasks(transaction: DatabaseTransaction, taskId: number, ownerUserId: number) {
    const result = await transaction.request().input("taskId", sql.BigInt, taskId)
      .input("ownerUserId", sql.Int, ownerUserId).query<{ total: number; incomplete: number }>(`
      SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN is_completed=0 THEN 1 ELSE 0 END),0) AS incomplete
      FROM dbo.TM_subtasks WITH (UPDLOCK, HOLDLOCK) WHERE task_id=@taskId
        AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
    return { total: Number(result.recordset[0]?.total ?? 0),
      incomplete: Number(result.recordset[0]?.incomplete ?? 0) };
  },

  // Historical TM_subtasks.work_notes is intentionally never updated again: its
  // author cannot be reliably reconstructed after past reassignments.
  async addWorkNote(transaction: DatabaseTransaction, ownerUserId: number, taskId: number,
    subtaskId: number, authorUserId: number, content: string): Promise<number> {
    const result = await transaction.request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .input("subtaskId", sql.BigInt, subtaskId)
      .input("authorUserId", sql.Int, authorUserId)
      .input("content", sql.NVarChar(4000), content)
      .query<{id:number|string}>(`INSERT dbo.TM_subtask_work_note_entries
        (task_id, subtask_id, owner_user_id, author_user_id, content)
        OUTPUT inserted.id VALUES(@taskId,@subtaskId,@ownerUserId,@authorUserId,@content);`);
    return Number(result.recordset[0]?.id);
  },

  async listWorkNoteEntries(ownerUserId: number, taskId: number) {
    const pool = await getDatabasePool();
    const result = await pool.request().input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .query<{id:number|string;subtaskId:number|string;authorUserId:number;
        authorName:string;content:string;createdAtUtc:Date}>(`
        SELECT note.id, note.subtask_id AS subtaskId, note.author_user_id AS authorUserId,
          COALESCE(author.USER_NAME, CONVERT(NVARCHAR(20), note.author_user_id)) AS authorName,
          note.content, note.created_at_utc AS createdAtUtc
        FROM dbo.TM_subtask_work_note_entries note
        JOIN dbo.TM_subtasks child ON child.id=note.subtask_id AND child.task_id=@taskId
          AND child.owner_user_id=@ownerUserId AND child.deleted_at_utc IS NULL
        LEFT JOIN dbo.users author ON author.USER_ID=note.author_user_id
        WHERE note.task_id=@taskId AND note.owner_user_id=@ownerUserId
        ORDER BY note.created_at_utc ASC, note.id ASC;`);
    return result.recordset.map(row=>({id:Number(row.id),subtaskId:Number(row.subtaskId),
      authorUserId:row.authorUserId,authorName:row.authorName,content:row.content,
      createdAtUtc:row.createdAtUtc.toISOString()}));
  },

  async ownerHasExplicitSubtaskAssignment(taskId: number, ownerUserId: number,
    transaction: DatabaseTransaction): Promise<boolean> {
    const result = await transaction.request().input("taskId",sql.BigInt,taskId)
      .input("ownerUserId",sql.Int,ownerUserId).query<{id:number}>(`
      SELECT TOP(1) 1 AS id FROM dbo.TM_subtasks WITH (UPDLOCK, HOLDLOCK)
      WHERE task_id=@taskId AND owner_user_id=@ownerUserId
        AND assignee_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
    return result.recordset.length>0;
  },

  // Never modify TM_tasks.completion_summary: historical attribution cannot be
  // verified after reassignment. Each new contribution gets its own immutable row.
  async addCompletionSummaryEntry(transaction: DatabaseTransaction, ownerUserId: number,
    taskId: number, authorUserId: number, content: string): Promise<number> {
    const result = await transaction.request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .input("authorUserId", sql.Int, authorUserId)
      .input("content", sql.NVarChar(sql.MAX), content)
      .query<{ id: number | string }>(`
        INSERT dbo.TM_task_completion_summary_entries
          (task_id, owner_user_id, author_user_id, content)
        OUTPUT inserted.id
        SELECT task.id, task.owner_user_id, @authorUserId, @content
        FROM dbo.TM_tasks AS task
        WHERE task.id=@taskId AND task.owner_user_id=@ownerUserId AND task.deleted_at_utc IS NULL;
      `);
    if (!result.recordset[0]) throw new AppError({ statusCode:404,
      code:"TASK_NOT_FOUND", message:"Task not found." });
    return Number(result.recordset[0].id);
  },

  async listCompletionSummaryEntries(ownerUserId: number, taskId: number) {
    const pool = await getDatabasePool();
    const result = await pool.request().input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .query<{ id:number|string; authorUserId:number; authorName:string;
        content:string; createdAtUtc:Date }>(`
        SELECT entry.id, entry.author_user_id AS authorUserId,
          COALESCE(author.USER_NAME, CONVERT(NVARCHAR(20), entry.author_user_id)) AS authorName,
          entry.content, entry.created_at_utc AS createdAtUtc
        FROM dbo.TM_task_completion_summary_entries AS entry
        JOIN dbo.TM_tasks AS task ON task.id=entry.task_id
          AND task.owner_user_id=@ownerUserId AND task.deleted_at_utc IS NULL
        LEFT JOIN dbo.users AS author ON author.USER_ID=entry.author_user_id
        WHERE entry.task_id=@taskId AND entry.owner_user_id=@ownerUserId
        ORDER BY entry.created_at_utc ASC, entry.id ASC;
      `);
    return result.recordset.map(row => ({
      id:Number(row.id), authorUserId:row.authorUserId, authorName:row.authorName,
      content:row.content, createdAtUtc:row.createdAtUtc.toISOString(),
    }));
  },
};
// SQL writes for automatic parent completion are centralized to preserve the
// terminal status timestamp/metadata invariants of TM_tasks.
export async function setAutoParentStatus(transaction: DatabaseTransaction,
  ownerUserId: number, taskId: number, status: "DONE" | "IN_PROGRESS") {
  await transaction.request().input("ownerUserId", sql.Int, ownerUserId)
    .input("taskId", sql.BigInt, taskId).input("status", sql.VarChar(20), status)
    .query(`UPDATE dbo.TM_tasks SET status=@status,
      auto_completed_from_subtasks=CASE WHEN @status='DONE' THEN 1 ELSE 0 END,
      completed_at_utc=CASE WHEN @status='DONE' THEN SYSUTCDATETIME() ELSE NULL END,
      cancelled_at_utc=NULL,cancellation_reason=NULL,updated_at_utc=SYSUTCDATETIME()
      WHERE id=@taskId AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL
        AND status <> 'CANCELLED';`);
}

export interface GeneralAssignedTask {
  taskId: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  creatorUserId: number;
  creatorName: string;
  isMainAssignee: boolean;
  subtaskTotal: number;
  subtaskCompleted: number;
  assignedSubtasks: Array<{id:number;title:string;dueDate:string|null;isCompleted:boolean;workNotes:string|null}>;
  teamTask: boolean;
  teamMemberCount: number;
  mainAssigneeCount: number;
  mainCompletedCount: number;
  teamRoster: Array<{userId:number;userName:string;userCode:string;email:string|null;mainAssignee:boolean}>;
}
export interface GeneralAssignmentListFilters {
  status?: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  priority?: "LOW" | "MEDIUM" | "HIGH";
  due?: "ALL" | "OVERDUE" | "TODAY" | "UPCOMING" | "NO_DATE";
  sortBy?: "assignedAt" | "dueDate" | "priority" | "title" | "status";
  sortDirection?: "asc" | "desc";
  taskType?: "ALL" | "TEAM" | "SINGLE" | "PERSONAL";
  tagIds?: string; tagMatch?: "ANY" | "ALL" | "UNTAGGED";
}
export async function listGeneralAssignments(actorUserId: number, page: number, pageSize: number, search: string,
  filters: GeneralAssignmentListFilters = {}) {
  const pool=await getDatabasePool();
  const sqlScope = `FROM dbo.TM_general_task_assignments rel
    JOIN dbo.TM_tasks task ON task.id=rel.task_id AND task.owner_user_id=rel.owner_user_id
    LEFT JOIN dbo.TM_collaboration_tasks collaboration ON collaboration.task_id=task.id
    JOIN dbo.TM_user_access access ON access.portal_user_id=@actor AND access.is_active=1
    JOIN dbo.users portal ON portal.USER_ID=access.portal_user_id AND portal.IS_ACTIVE=1
    WHERE task.deleted_at_utc IS NULL AND task.list_id IS NOT NULL
      AND task.owner_user_id<>@actor
      AND ((collaboration.task_id IS NULL AND (rel.assignee_user_id=@actor OR EXISTS (
        SELECT 1 FROM dbo.TM_subtasks child WHERE child.task_id=task.id
          AND child.deleted_at_utc IS NULL AND
          COALESCE(child.assignee_user_id,rel.assignee_user_id,task.owner_user_id)=@actor)))
        OR (collaboration.task_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM dbo.TM_collaboration_assignments a WHERE a.task_id=task.id
            AND a.assignee_user_id=@actor AND a.is_active=1)))
      AND (@search IS NULL OR task.title LIKE @search OR EXISTS (
        SELECT 1 FROM dbo.TM_subtasks child
        WHERE child.task_id=task.id AND child.deleted_at_utc IS NULL
          AND ((collaboration.task_id IS NULL AND
            COALESCE(child.assignee_user_id,rel.assignee_user_id,task.owner_user_id)=@actor)
            OR (collaboration.task_id IS NOT NULL AND EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments a
              WHERE a.subtask_id=child.id AND a.assignee_user_id=@actor AND a.is_active=1)))
          AND child.title LIKE @search))
      AND (@status IS NULL OR task.status=@status)
      AND (@priority IS NULL OR task.priority=@priority)
      AND ${taskTypeConditionSql}
      AND ${taskTagsFilterSql}
      AND (@due='ALL'
        OR (@due='NO_DATE' AND task.due_date IS NULL)
        OR (@due='OVERDUE' AND task.due_date < @today AND task.status IN ('TODO','IN_PROGRESS'))
        OR (@due='TODAY' AND task.due_date=@today)
        OR (@due='UPCOMING' AND task.due_date > @today))`;
  const addFilters = (request: ReturnType<typeof pool.request>) => request
    .input("actor",sql.Int,actorUserId)
    .input("search",sql.NVarChar(120),search ? `%${search}%`:null)
    .input("status",sql.VarChar(20),filters.status??null)
    .input("priority",sql.VarChar(10),filters.priority??null)
    .input("taskType",sql.VarChar(12),filters.taskType??"ALL")
    .input("tagIds",sql.VarChar(240),filters.tagIds??null)
    .input("tagMatch",sql.VarChar(12),filters.tagMatch??"ANY")
    .input("due",sql.VarChar(10),filters.due??'ALL')
    .input("today",sql.Date,new Date(`${getCurrentDateInAppTimeZone()}T00:00:00.000Z`));
  const count=await addFilters(pool.request())
    .query<{total:number|string}>(`SELECT COUNT_BIG(*) AS total ${sqlScope};`);
  const orderBy = ({ assignedAt: 'rel.assigned_at_utc', dueDate: 'task.due_date',
    priority: 'task.priority', title: 'task.title', status: 'task.status' } as const)[filters.sortBy??'assignedAt'];
  const direction = filters.sortDirection === 'asc' ? 'ASC' : 'DESC';
  const result=await addFilters(pool.request())
    .input("offset",sql.Int,(page-1)*pageSize).input("limit",sql.Int,pageSize)
    .query<{
      taskId:number|string;title:string;description:string|null;status:string;priority:string;
      dueDate:Date|null;creatorUserId:number;creatorName:string;isMainAssignee:boolean;
      subtaskTotal:number;subtaskCompleted:number;assignedSubtasksJson:string|null;
      teamTask:boolean;teamMemberCount:number;mainAssigneeCount:number;mainCompletedCount:number;teamRosterJson:string|null;taskTagsJson:string|null
    }>(`SELECT task.id AS taskId,task.title,task.description,task.status,task.priority,
      task.due_date AS dueDate,task.owner_user_id AS creatorUserId,
      COALESCE(creatorPortal.USER_NAME,creatorPortal.USER_CODE) AS creatorName,
      CAST(CASE WHEN (collaboration.task_id IS NULL AND rel.assignee_user_id=@actor)
        OR (collaboration.task_id IS NOT NULL AND EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments a
          WHERE a.task_id=task.id AND a.subtask_id IS NULL AND a.is_active=1 AND a.assignee_user_id=@actor))
        THEN 1 ELSE 0 END AS BIT) AS isMainAssignee,
      (SELECT COUNT(*) FROM dbo.TM_subtasks c WHERE c.task_id=task.id AND c.deleted_at_utc IS NULL) AS subtaskTotal,
      (SELECT COUNT(*) FROM dbo.TM_subtasks c WHERE c.task_id=task.id AND c.deleted_at_utc IS NULL
        AND c.is_completed=1) AS subtaskCompleted,
      ${collaborationCardSummarySql}, ${taskTagsSelectSql},
      (SELECT s.id,s.title,s.due_date AS dueDate,s.is_completed AS isCompleted,
        CASE WHEN collaboration.task_id IS NULL THEN s.work_notes ELSE NULL END AS workNotes
       FROM dbo.TM_subtasks s WHERE s.task_id=task.id AND s.deleted_at_utc IS NULL
       AND ((collaboration.task_id IS NULL AND
         COALESCE(s.assignee_user_id,rel.assignee_user_id,task.owner_user_id)=@actor)
         OR (collaboration.task_id IS NOT NULL AND EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments a
           WHERE a.subtask_id=s.id AND a.assignee_user_id=@actor AND a.is_active=1)))
       ORDER BY s.display_order,s.id FOR JSON PATH) AS assignedSubtasksJson
      ${sqlScope.replace('FROM dbo.TM_general_task_assignments rel','FROM dbo.TM_general_task_assignments rel\n      JOIN dbo.users creatorPortal ON creatorPortal.USER_ID=rel.owner_user_id')}
      ORDER BY ${orderBy} ${direction},task.id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
  const items:GeneralAssignedTask[]=result.recordset.map(row=>({
    taskId:Number(row.taskId),title:row.title,description:row.description,status:row.status,
    priority:row.priority,dueDate:row.dueDate?.toISOString().slice(0,10)??null,
    creatorUserId:row.creatorUserId,creatorName:row.creatorName,isMainAssignee:Boolean(row.isMainAssignee),
    subtaskTotal:Number(row.subtaskTotal),subtaskCompleted:Number(row.subtaskCompleted),
    teamTask:Boolean(row.teamTask),teamMemberCount:Number(row.teamMemberCount),
    mainAssigneeCount:Number(row.mainAssigneeCount),mainCompletedCount:Number(row.mainCompletedCount),
    teamRoster:row.teamRosterJson ? JSON.parse(row.teamRosterJson) : [],
    tags:row.taskTagsJson ? JSON.parse(row.taskTagsJson) : [],
    assignedSubtasks: (row.assignedSubtasksJson?JSON.parse(row.assignedSubtasksJson) as Array<{
      id:number;title:string;dueDate:string|null;isCompleted:boolean;workNotes:string|null
    }>:[]),
  }));
  return {items,page,pageSize,total:Number(count.recordset[0]?.total??0)};
}

export async function listGeneralEligibleUsers(actorUserId:number,search:string,page:number,pageSize:number) {
  const pool=await getDatabasePool();
  const result=await pool.request().input('actor',sql.Int,actorUserId)
    .input('search',sql.NVarChar(120),search ? `%${search}%` : null)
    .input('offset',sql.Int,(page-1)*pageSize).input('limit',sql.Int,pageSize)
    .query<{userId:number;userCode:string;userName:string;email:string|null}>(`
    SELECT portal.USER_ID AS userId,portal.USER_CODE AS userCode,
      COALESCE(portal.USER_NAME,portal.USER_CODE) AS userName,
      portal.email AS email
    FROM dbo.users portal JOIN dbo.TM_user_access access ON access.portal_user_id=portal.USER_ID
    WHERE access.is_active=1 AND portal.IS_ACTIVE=1
      AND (@search IS NULL OR LOWER(portal.USER_NAME) LIKE LOWER(@search)
        OR LOWER(portal.USER_CODE) LIKE LOWER(@search)
        OR LOWER(portal.email) LIKE LOWER(@search))
    ORDER BY portal.USER_NAME,portal.USER_ID OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
  return {items:result.recordset,page,pageSize};
}

// Resolve an already-selected assignee without relying on the current search page.
export async function findEligibleGeneralTaskUser(userId: number) {
  const pool = await getDatabasePool();
  const result = await pool.request().input('userId', sql.Int, userId)
    .query<{userId:number;userCode:string;userName:string;email:string|null}>(`
    SELECT TOP (1) portal.USER_ID AS userId,portal.USER_CODE AS userCode,
      COALESCE(portal.USER_NAME,portal.USER_CODE) AS userName,
      portal.email AS email
    FROM dbo.users portal
    JOIN dbo.TM_user_access access ON access.portal_user_id=portal.USER_ID
    WHERE portal.USER_ID=@userId AND portal.IS_ACTIVE=1 AND access.is_active=1;`);
  return result.recordset[0] ?? null;
}



