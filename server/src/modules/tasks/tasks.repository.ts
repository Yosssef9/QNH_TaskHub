import { getDatabasePool, sql } from "../../database/sql.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import type {
  CreateTaskInput,
  TaskListQuery,
  TaskRecord,
  TaskSummary,
  TaskSummaryRecord,
  UpdateTaskInput,
} from "./tasks.types.js";

interface CountRecord {
  total: number;
}
interface IdRecord {
  id: number;
}

const taskSelect = `
  task.id, task.list_id AS listId, task.kpi_instance_id AS kpiInstanceId,
  instance.kpi_id AS kpiId, instance.cycle_id AS cycleId, cycle.title AS cycleTitle,
  instance.name_snapshot AS kpiName, instance.icon_key_snapshot AS kpiIconKey,
  instance.color_snapshot AS kpiColor, cycle.closed_at_utc AS cycleClosedAtUtc,
  task.title, task.description, task.status,
  task.priority, task.start_date AS startDate, task.due_date AS dueDate, task.reference_date AS referenceDate,
  task.display_order AS displayOrder, task.created_at_utc AS createdAtUtc,
  task.updated_at_utc AS updatedAtUtc, task.completed_at_utc AS completedAtUtc,
  task.cancelled_at_utc AS cancelledAtUtc, task.cancellation_reason AS cancellationReason,
  task.deleted_at_utc AS deletedAtUtc,
  CAST(CASE WHEN task.due_date < @today
    AND task.status NOT IN ('DONE', 'CANCELLED') THEN 1 ELSE 0 END AS BIT) AS isOverdue,
  ISNULL(subtaskSummary.total, 0) AS subtaskTotal,
  ISNULL(subtaskSummary.completed, 0) AS subtaskCompleted`;

const subtaskSummarySql = `OUTER APPLY (
  SELECT COUNT(*) AS total,
    SUM(CASE WHEN subtask.is_completed = 1 THEN 1 ELSE 0 END) AS completed
  FROM dbo.TM_subtasks AS subtask
  WHERE subtask.task_id = task.id
    AND subtask.owner_user_id = task.owner_user_id
    AND subtask.deleted_at_utc IS NULL
) AS subtaskSummary`;
const taskContextJoins = `LEFT JOIN dbo.TM_kpi_instances AS instance
  ON instance.id=task.kpi_instance_id AND instance.owner_user_id=task.owner_user_id
  LEFT JOIN dbo.TM_work_cycles AS cycle
  ON cycle.id=instance.cycle_id AND cycle.owner_user_id=instance.owner_user_id`;

function addListFilters(
  request: sql.Request,
  ownerUserId: number,
  listId: number,
  query: TaskListQuery,
  today: string,
) {
  request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("listId", sql.BigInt, listId)
    .input("today", sql.Date, today)
    .input("search", sql.NVarChar(100), query.search ? `%${query.search}%` : null)
    .input("status", sql.VarChar(20), query.status ?? null)
    .input("priority", sql.VarChar(10), query.priority ?? null);
}

function filterSql(query: TaskListQuery): string {
  const due = {
    ALL: "",
    OVERDUE: "AND task.due_date < @today AND task.status NOT IN ('DONE', 'CANCELLED')",
    TODAY: "AND task.due_date = @today",
    UPCOMING: "AND task.due_date > @today",
    NO_DATE: "AND task.due_date IS NULL",
  }[query.due];
  return `task.owner_user_id = @ownerUserId AND task.list_id = @listId
    AND task.kpi_instance_id IS NULL AND task.deleted_at_utc IS NULL
    AND (@search IS NULL OR task.title LIKE @search)
    AND (@status IS NULL OR task.status = @status)
    AND (@priority IS NULL OR task.priority = @priority) ${due}`;
}

const sortColumns = {
  createdAt: "task.created_at_utc",
  dueDate: "CASE WHEN task.due_date IS NULL THEN 1 ELSE 0 END, task.due_date",
  priority: "CASE task.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END",
  title: "task.title",
  status: "task.status",
} as const;

export const tasksRepository = {
  async list(ownerUserId: number, listId: number, query: TaskListQuery, today: string) {
    const pool = await getDatabasePool();
    const request = pool.request();
    addListFilters(request, ownerUserId, listId, query, today);
    request
      .input("offset", sql.Int, (query.page - 1) * query.pageSize)
      .input("pageSize", sql.Int, query.pageSize);
    const order = `${sortColumns[query.sortBy]} ${query.sortDirection === "asc" ? "ASC" : "DESC"}, task.id DESC`;
    const result = await request.query<TaskRecord>(`
      SELECT ${taskSelect} FROM dbo.TM_tasks AS task ${taskContextJoins}
      ${subtaskSummarySql}
      WHERE ${filterSql(query)} ORDER BY ${order}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);

    const countRequest = pool.request();
    addListFilters(countRequest, ownerUserId, listId, query, today);
    const count = await countRequest.query<CountRecord>(`
      SELECT COUNT_BIG(*) AS total FROM dbo.TM_tasks AS task WHERE ${filterSql(query)};`);
    return { records: result.recordset, total: Number(count.recordset[0]?.total ?? 0) };
  },

  async summary(ownerUserId: number, listId: number, today: string): Promise<TaskSummary> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("listId", sql.BigInt, listId)
      .input("today", sql.Date, today).query<TaskSummaryRecord>(`
        SELECT
          COUNT_BIG(*) AS total,
          COALESCE(SUM(CASE WHEN task.status = 'TODO' THEN 1 ELSE 0 END), 0) AS todo,
          COALESCE(SUM(CASE WHEN task.status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) AS inProgress,
          COALESCE(SUM(CASE WHEN task.status = 'DONE' THEN 1 ELSE 0 END), 0) AS done,
          COALESCE(SUM(CASE WHEN task.status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled,
          COALESCE(SUM(CASE
            WHEN task.due_date < @today AND task.status NOT IN ('DONE', 'CANCELLED') THEN 1
            ELSE 0
          END), 0) AS overdue,
          (
            SELECT COUNT_BIG(*)
            FROM dbo.TM_subtasks AS subtask
            INNER JOIN dbo.TM_tasks AS parentTask ON parentTask.id = subtask.task_id
            WHERE parentTask.owner_user_id = @ownerUserId
              AND parentTask.list_id = @listId
              AND parentTask.kpi_instance_id IS NULL
              AND parentTask.deleted_at_utc IS NULL
              AND parentTask.status <> 'CANCELLED'
              AND subtask.owner_user_id = @ownerUserId
              AND subtask.deleted_at_utc IS NULL
          ) AS subtaskTotal,
          (
            SELECT COUNT_BIG(*)
            FROM dbo.TM_subtasks AS subtask
            INNER JOIN dbo.TM_tasks AS parentTask ON parentTask.id = subtask.task_id
            WHERE parentTask.owner_user_id = @ownerUserId
              AND parentTask.list_id = @listId
              AND parentTask.kpi_instance_id IS NULL
              AND parentTask.deleted_at_utc IS NULL
              AND parentTask.status <> 'CANCELLED'
              AND subtask.owner_user_id = @ownerUserId
              AND subtask.deleted_at_utc IS NULL
              AND subtask.is_completed = 1
          ) AS subtaskCompleted
        FROM dbo.TM_tasks AS task
        WHERE task.owner_user_id = @ownerUserId
          AND task.list_id = @listId
          AND task.kpi_instance_id IS NULL
          AND task.deleted_at_utc IS NULL;
      `);

    const record = result.recordset[0];

    return {
      total: Number(record?.total ?? 0),
      todo: Number(record?.todo ?? 0),
      inProgress: Number(record?.inProgress ?? 0),
      done: Number(record?.done ?? 0),
      cancelled: Number(record?.cancelled ?? 0),
      overdue: Number(record?.overdue ?? 0),
      subtaskTotal: Number(record?.subtaskTotal ?? 0),
      subtaskCompleted: Number(record?.subtaskCompleted ?? 0),
    };
  },

  async findOwnedById(ownerUserId: number, taskId: number, today: string, includeDeleted = false) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .input("today", sql.Date, today).query<TaskRecord>(`
        SELECT TOP (1) ${taskSelect} FROM dbo.TM_tasks AS task ${taskContextJoins}
        ${subtaskSummarySql}
        WHERE task.id = @taskId AND task.owner_user_id = @ownerUserId
          ${includeDeleted ? "" : "AND task.deleted_at_utc IS NULL"};`);
    return result.recordset[0] ?? null;
  },

  async findOwnedForUpdate(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    taskId: number,
    includeDeleted = false,
  ) {
    const result = await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .input("today", sql.Date, getCurrentDateInAppTimeZone()).query<TaskRecord>(`
        SELECT TOP (1) ${taskSelect}
        FROM dbo.TM_tasks AS task WITH (UPDLOCK, HOLDLOCK) ${taskContextJoins} ${subtaskSummarySql}
        WHERE task.id = @taskId AND task.owner_user_id = @ownerUserId
          ${includeDeleted ? "" : "AND task.deleted_at_utc IS NULL"};`);
    return result.recordset[0] ?? null;
  },

  async ownedListExists(ownerUserId: number, listId: number, transaction?: DatabaseTransaction) {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("listId", sql.BigInt, listId).query<IdRecord>(`
      SELECT TOP (1) id FROM dbo.TM_lists ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      WHERE id = @listId AND owner_user_id = @ownerUserId AND archived_at_utc IS NULL;`);
    return Boolean(result.recordset[0]);
  },

  async ownedKpiInstanceIsOpen(ownerUserId: number, instanceId: number, transaction?: DatabaseTransaction) {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("instanceId", sql.BigInt, instanceId).query<IdRecord>(`
      SELECT TOP (1) instance.id FROM dbo.TM_kpi_instances instance ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      INNER JOIN dbo.TM_work_cycles cycle ON cycle.id=instance.cycle_id AND cycle.owner_user_id=instance.owner_user_id
      WHERE instance.id=@instanceId AND instance.owner_user_id=@ownerUserId
        AND cycle.closed_at_utc IS NULL AND cycle.archived_at_utc IS NULL;`);
    return Boolean(result.recordset[0]);
  },

  async create(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    listId: number,
    input: CreateTaskInput,
  ) {
    const result = await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("listId", sql.BigInt, listId)
      .input("title", sql.NVarChar(1000), input.title)
      .input("description", sql.NVarChar(sql.MAX), input.description ?? null)
      .input("priority", sql.VarChar(10), input.priority)
      .input("startDate", sql.Date, input.startDate ?? null)
      .input("dueDate", sql.Date, input.dueDate ?? null).query<IdRecord>(`INSERT INTO dbo.TM_tasks
        (owner_user_id, list_id, title, description, priority, start_date, due_date, display_order)
        OUTPUT inserted.id
        SELECT @ownerUserId, @listId, @title, @description, @priority, @startDate, @dueDate,
          ISNULL(MAX(display_order), 0) + 1 FROM dbo.TM_tasks
        WHERE owner_user_id = @ownerUserId AND list_id = @listId AND deleted_at_utc IS NULL;`);
    return result.recordset[0]?.id ?? null;
  },

  async update(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    taskId: number,
    input: Required<Omit<UpdateTaskInput, "listId">> & { listId: number | null },
  ) {
    await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .input("listId", sql.BigInt, input.listId)
      .input("title", sql.NVarChar(1000), input.title)
      .input("description", sql.NVarChar(sql.MAX), input.description)
      .input("priority", sql.VarChar(10), input.priority)
      .input("startDate", sql.Date, input.startDate)
      .input("dueDate", sql.Date, input.dueDate)
      .input("referenceDate", sql.Date, input.referenceDate).query(`
        UPDATE dbo.TM_tasks SET list_id=@listId, title=@title, description=@description,
          priority=@priority, start_date=@startDate, due_date=@dueDate, reference_date=@referenceDate,
          updated_at_utc=SYSUTCDATETIME()
        WHERE id=@taskId AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
  },

  async changeStatus(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    taskId: number,
    status: string,
    reason: string | null,
  ) {
    await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .input("status", sql.VarChar(20), status)
      .input("reason", sql.NVarChar(1000), reason).query(`
        UPDATE dbo.TM_tasks SET status=@status, updated_at_utc=SYSUTCDATETIME(),
          completed_at_utc=CASE WHEN @status='DONE' THEN SYSUTCDATETIME() ELSE NULL END,
          cancelled_at_utc=CASE WHEN @status='CANCELLED' THEN SYSUTCDATETIME() ELSE NULL END,
          cancellation_reason=CASE WHEN @status='CANCELLED' THEN @reason ELSE NULL END
        WHERE id=@taskId AND owner_user_id=@ownerUserId AND deleted_at_utc IS NULL;`);
  },

  async setDeleted(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    taskId: number,
    deleted: boolean,
  ) {
    await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId).query(`
      UPDATE dbo.TM_tasks SET deleted_at_utc=${deleted ? "SYSUTCDATETIME()" : "NULL"}, updated_at_utc=SYSUTCDATETIME()
      WHERE id=@taskId AND owner_user_id=@ownerUserId
        AND deleted_at_utc IS ${deleted ? "NULL" : "NOT NULL"};`);
  },

  async addActivity(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    taskId: number,
    type: string,
    data?: unknown,
  ) {
    await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("taskId", sql.BigInt, taskId)
      .input("type", sql.VarChar(50), type)
      .input("data", sql.NVarChar(sql.MAX), data === undefined ? null : JSON.stringify(data))
      .query(`
        INSERT INTO dbo.TM_task_activity (task_id, owner_user_id, actor_user_id, activity_type, event_data_json)
        VALUES (@taskId, @ownerUserId, @ownerUserId, @type, @data);`);
  },
};
