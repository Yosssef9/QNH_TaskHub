import { getDatabasePool, sql } from "../../database/sql.js";
import type { DatabaseTransaction } from "../../database/types.js";
import type { TaskListQuery, TaskRecord } from "../tasks/tasks.types.js";
import type { CalculationSubtask, CalculationTask, KpiCalculationResult } from "./kpi-calculation.js";
import type { CreateKpiTaskBody, GlobalKpiTaskListQuery, SaveManualMeasurementBody } from "./kpi-work.schemas.js";

const select = `task.id,task.list_id AS listId,task.kpi_instance_id AS kpiInstanceId,
  instance.kpi_id AS kpiId,instance.cycle_id AS cycleId,cycle.title AS cycleTitle,
  instance.name_snapshot AS kpiName,instance.icon_key_snapshot AS kpiIconKey,
  instance.color_snapshot AS kpiColor,cycle.closed_at_utc AS cycleClosedAtUtc,
  task.title,task.description,task.status,task.priority,task.start_date AS startDate,
  task.due_date AS dueDate,task.reference_date AS referenceDate,task.display_order AS displayOrder,
  task.created_at_utc AS createdAtUtc,task.updated_at_utc AS updatedAtUtc,
  task.completed_at_utc AS completedAtUtc,task.cancelled_at_utc AS cancelledAtUtc,
  task.cancellation_reason AS cancellationReason,task.deleted_at_utc AS deletedAtUtc,
  CAST(CASE WHEN task.due_date<@today AND task.status NOT IN('DONE','CANCELLED') THEN 1 ELSE 0 END AS BIT) AS isOverdue,
  ISNULL(s.total,0) AS subtaskTotal,ISNULL(s.completed,0) AS subtaskCompleted`;
const joins = `INNER JOIN dbo.TM_kpi_instances instance ON instance.id=task.kpi_instance_id AND instance.owner_user_id=task.owner_user_id
  INNER JOIN dbo.TM_work_cycles cycle ON cycle.id=instance.cycle_id AND cycle.owner_user_id=instance.owner_user_id`;
const apply = `OUTER APPLY(SELECT COUNT(*) total,SUM(CASE WHEN is_completed=1 THEN 1 ELSE 0 END) completed
  FROM dbo.TM_subtasks WHERE task_id=task.id AND owner_user_id=task.owner_user_id AND deleted_at_utc IS NULL)s`;
const order = {
  createdAt: "task.created_at_utc",
  dueDate: "CASE WHEN task.due_date IS NULL THEN 1 ELSE 0 END, task.due_date",
  priority: "CASE task.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END",
  title: "task.title",
  status: "task.status",
} as const;

function dueSql(query: TaskListQuery) {
  return { ALL: "", OVERDUE: "AND task.due_date<@today AND task.status NOT IN('DONE','CANCELLED')", TODAY: "AND task.due_date=@today", UPCOMING: "AND task.due_date>@today", NO_DATE: "AND task.due_date IS NULL" }[query.due];
}
function bind(request: sql.Request, owner: number, query: TaskListQuery, today: string) {
  return request.input("owner", sql.Int, owner).input("today", sql.Date, today)
    .input("search", sql.NVarChar(100), query.search ? `%${query.search}%` : null)
    .input("status", sql.VarChar(20), query.status ?? null)
    .input("priority", sql.VarChar(10), query.priority ?? null);
}
const common = (query: TaskListQuery) => `task.owner_user_id=@owner AND task.list_id IS NULL
  AND task.kpi_instance_id IS NOT NULL AND task.deleted_at_utc IS NULL
  AND cycle.archived_at_utc IS NULL AND(@search IS NULL OR task.title LIKE @search)
  AND(@status IS NULL OR task.status=@status)AND(@priority IS NULL OR task.priority=@priority) ${dueSql(query)}`;

type PersistedInput = Omit<CreateKpiTaskBody, "startDate" | "dueDate" | "referenceDate"> & {
  startDate: string | null; dueDate: string | null; referenceDate: string | null;
};

export const kpiWorkRepository = {
  async listAll(owner: number, query: GlobalKpiTaskListQuery, today: string) {
    const pool = await getDatabasePool();
    const where = `${common(query)} AND(@cycle IS NULL OR instance.cycle_id=@cycle) AND(@kpi IS NULL OR instance.kpi_id=@kpi)`;
    const request = bind(pool.request(), owner, query, today)
      .input("cycle", sql.BigInt, query.cycleId ?? null).input("kpi", sql.BigInt, query.kpiId ?? null)
      .input("offset", sql.Int, (query.page - 1) * query.pageSize).input("size", sql.Int, query.pageSize);
    const records = await request.query<TaskRecord>(`SELECT ${select} FROM dbo.TM_tasks task ${joins} ${apply}
      WHERE ${where} ORDER BY ${order[query.sortBy]} ${query.sortDirection === "asc" ? "ASC" : "DESC"},task.id DESC
      OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY;`);
    const count = await bind(pool.request(), owner, query, today)
      .input("cycle", sql.BigInt, query.cycleId ?? null).input("kpi", sql.BigInt, query.kpiId ?? null)
      .query<{ total: number }>(`SELECT COUNT_BIG(*) total FROM dbo.TM_tasks task ${joins} WHERE ${where};`);
    return { records: records.recordset, total: Number(count.recordset[0]?.total ?? 0) };
  },

  async list(owner: number, instanceId: number, query: TaskListQuery, today: string) {
    const pool = await getDatabasePool();
    const where = `${common(query)} AND task.kpi_instance_id=@instance`;
    const request = bind(pool.request(), owner, query, today).input("instance", sql.BigInt, instanceId)
      .input("offset", sql.Int, (query.page - 1) * query.pageSize).input("size", sql.Int, query.pageSize);
    const records = await request.query<TaskRecord>(`SELECT ${select} FROM dbo.TM_tasks task ${joins} ${apply}
      WHERE ${where} ORDER BY ${order[query.sortBy]} ${query.sortDirection === "asc" ? "ASC" : "DESC"},task.id DESC
      OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY;`);
    const count = await bind(pool.request(), owner, query, today).input("instance", sql.BigInt, instanceId)
      .query<{ total: number }>(`SELECT COUNT_BIG(*) total FROM dbo.TM_tasks task ${joins} WHERE ${where};`);
    return { records: records.recordset, total: Number(count.recordset[0]?.total ?? 0) };
  },

  async create(tx: DatabaseTransaction, owner: number, instanceId: number, input: PersistedInput) {
    const result = await tx.request().input("owner", sql.Int, owner).input("instance", sql.BigInt, instanceId)
      .input("title", sql.NVarChar(250), input.title).input("description", sql.NVarChar(sql.MAX), input.description ?? null)
      .input("priority", sql.VarChar(10), input.priority).input("start", sql.Date, input.startDate)
      .input("due", sql.Date, input.dueDate).input("reference", sql.Date, input.referenceDate)
      .query<{ id: number }>(`INSERT dbo.TM_tasks(owner_user_id,kpi_instance_id,title,description,priority,start_date,due_date,reference_date,display_order)
        OUTPUT inserted.id SELECT @owner,@instance,@title,@description,@priority,@start,@due,@reference,ISNULL(MAX(display_order),0)+1
        FROM dbo.TM_tasks WHERE owner_user_id=@owner AND kpi_instance_id=@instance AND deleted_at_utc IS NULL;`);
    return result.recordset[0]?.id ?? null;
  },

  async calculationTasks(owner: number, instanceId: number, start: string, end: string): Promise<CalculationTask[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("owner", sql.Int, owner).input("instance", sql.BigInt, instanceId)
      .input("start", sql.Date, start).input("end", sql.Date, end).query<{ status: string; dueDate: Date | null; completedDate: string | null; subtaskTotal: number; subtaskCompleted: number }>(`
        SELECT task.status,task.due_date dueDate,CONVERT(varchar(10),(task.completed_at_utc AT TIME ZONE 'UTC' AT TIME ZONE 'Arab Standard Time'),23) completedDate,
          ISNULL(s.total,0) subtaskTotal,ISNULL(s.completed,0) subtaskCompleted
        FROM dbo.TM_tasks task OUTER APPLY(SELECT COUNT(*) total,SUM(CASE WHEN is_completed=1 THEN 1 ELSE 0 END) completed
          FROM dbo.TM_subtasks WHERE task_id=task.id AND owner_user_id=task.owner_user_id AND deleted_at_utc IS NULL)s
        WHERE task.owner_user_id=@owner AND task.kpi_instance_id=@instance AND task.deleted_at_utc IS NULL
          AND COALESCE(task.reference_date,task.due_date,CONVERT(date,(task.created_at_utc AT TIME ZONE 'UTC' AT TIME ZONE 'Arab Standard Time'))) BETWEEN @start AND @end;`);
    return result.recordset.map((row) => ({ status: row.status, dueDate: row.dueDate?.toISOString().slice(0,10) ?? null,
      completedDate: row.completedDate, subtaskTotal: Number(row.subtaskTotal), subtaskCompleted: Number(row.subtaskCompleted) }));
  },

  async calculationSubtasks(owner: number, instanceId: number, start: string, end: string): Promise<CalculationSubtask[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("owner", sql.Int, owner).input("instance", sql.BigInt, instanceId)
      .input("start", sql.Date, start).input("end", sql.Date, end).query<{ dueDate: string; completedDate: string | null }>(`
        SELECT CONVERT(varchar(10),subtask.due_date,23) dueDate,CONVERT(varchar(10),(subtask.completed_at_utc AT TIME ZONE 'UTC' AT TIME ZONE 'Arab Standard Time'),23) completedDate
        FROM dbo.TM_subtasks subtask INNER JOIN dbo.TM_tasks task ON task.id=subtask.task_id AND task.owner_user_id=subtask.owner_user_id
        WHERE task.owner_user_id=@owner AND task.kpi_instance_id=@instance AND task.deleted_at_utc IS NULL
          AND task.status<>'CANCELLED' AND subtask.deleted_at_utc IS NULL AND subtask.due_date BETWEEN @start AND @end;`);
    return result.recordset;
  },

  async manual(owner: number, instanceId: number, start: string, end: string) {
    const pool = await getDatabasePool();
    const result = await pool.request().input("owner", sql.Int, owner).input("instance", sql.BigInt, instanceId)
      .input("start", sql.Date, start).input("end", sql.Date, end)
      .query<{ numeratorValue: number | null; denominatorValue: number | null; manualValue: number | null }>(`
        SELECT numerator_value numeratorValue,denominator_value denominatorValue,manual_value manualValue
        FROM dbo.TM_kpi_period_results WHERE owner_user_id=@owner AND kpi_instance_id=@instance AND period_start=@start AND period_end=@end;`);
    return result.recordset[0] ?? null;
  },

  async saveManualResult(
    tx: DatabaseTransaction,
    owner: number,
    instanceId: number,
    input: SaveManualMeasurementBody,
    result: KpiCalculationResult,
    targetValue: number | null,
    targetDirection: string | null,
  ) {
    const merge = await tx.request().input("owner", sql.Int, owner).input("instance", sql.BigInt, instanceId)
      .input("start", sql.Date, input.periodStart).input("end", sql.Date, input.periodEnd)
      .input("num", sql.Decimal(19,4), input.numeratorValue).input("den", sql.Decimal(19,4), input.denominatorValue)
      .input("value", sql.Decimal(19,4), input.manualValue).input("actual", sql.Decimal(19,4), result.actualValue)
      .input("target", sql.Decimal(19,4), targetValue).input("direction", sql.VarChar(20), targetDirection)
      .input("status", sql.VarChar(10), result.status).query(`MERGE dbo.TM_kpi_period_results target
        USING(SELECT @instance kpi_instance_id,@start period_start,@end period_end) source
        ON target.kpi_instance_id=source.kpi_instance_id AND target.period_start=source.period_start AND target.period_end=source.period_end
        WHEN MATCHED AND target.owner_user_id=@owner AND target.is_finalized=0 THEN UPDATE SET
          numerator_value=@num,denominator_value=@den,manual_value=@value,actual_value=@actual,
          target_value_snapshot=@target,target_direction_snapshot=@direction,result_status=@status,
          calculated_at_utc=SYSUTCDATETIME(),updated_at_utc=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT(kpi_instance_id,owner_user_id,period_start,period_end,numerator_value,denominator_value,manual_value,actual_value,target_value_snapshot,target_direction_snapshot,result_status,calculated_at_utc)
          VALUES(@instance,@owner,@start,@end,@num,@den,@value,@actual,@target,@direction,@status,SYSUTCDATETIME());`);
    return merge.rowsAffected.some((count) => count > 0);
  },

};
