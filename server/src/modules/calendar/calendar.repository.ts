import { getDatabasePool, sql } from "../../database/sql.js";
import type { CalendarTaskRecord, CalendarTasksQuery } from "./calendar.types.js";

export const calendarRepository = {
  async listTasks(
    ownerUserId: number,
    query: CalendarTasksQuery,
    today: string,
    searchPattern: string | null,
  ): Promise<CalendarTaskRecord[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("start", sql.Date, query.start)
      .input("end", sql.Date, query.end)
      .input("today", sql.Date, today)
      .input("scope", sql.VarChar(10), query.scope)
      .input("search", sql.NVarChar(220), searchPattern)
      .input("status", sql.VarChar(20), query.status ?? null)
      .input("priority", sql.VarChar(10), query.priority ?? null)
      .input("listId", sql.BigInt, query.listId ?? null)
      .input("cycleId", sql.BigInt, query.cycleId ?? null)
      .input("kpiInstanceId", sql.BigInt, query.kpiInstanceId ?? null)
      .query<CalendarTaskRecord>(`
        SELECT
          task.id,
          task.title,
          task.status,
          task.priority,
          task.start_date AS startDate,
          task.due_date AS dueDate,
          COALESCE(task.due_date, task.start_date) AS calendarDate,
          CAST(CASE WHEN task.due_date IS NOT NULL THEN 'DUE_DATE' ELSE 'START_DATE' END AS VARCHAR(10)) AS calendarDateSource,
          CAST(CASE
            WHEN task.due_date < @today AND task.status NOT IN ('DONE', 'CANCELLED') THEN 1
            ELSE 0
          END AS BIT) AS isOverdue,
          list.id AS listId,
          list.name AS listName,
          cycle.id AS cycleId,
          cycle.title AS cycleTitle,
          cycle.closed_at_utc AS cycleClosedAtUtc,
          instance.id AS kpiInstanceId,
          instance.kpi_id AS kpiTemplateId,
          instance.name_snapshot AS kpiName
        FROM dbo.TM_tasks AS task
        LEFT JOIN dbo.TM_lists AS list
          ON list.id = task.list_id
          AND list.owner_user_id = task.owner_user_id
        LEFT JOIN dbo.TM_kpi_instances AS instance
          ON instance.id = task.kpi_instance_id
          AND instance.owner_user_id = task.owner_user_id
        LEFT JOIN dbo.TM_work_cycles AS cycle
          ON cycle.id = instance.cycle_id
          AND cycle.owner_user_id = instance.owner_user_id
        WHERE task.owner_user_id = @ownerUserId
          AND task.deleted_at_utc IS NULL
          AND COALESCE(task.due_date, task.start_date) IS NOT NULL
          AND COALESCE(task.due_date, task.start_date) >= @start
          AND COALESCE(task.due_date, task.start_date) < @end
          AND (@search IS NULL OR task.title LIKE @search ESCAPE '\\' OR task.description LIKE @search ESCAPE '\\')
          AND (@status IS NULL OR task.status = @status)
          AND (@priority IS NULL OR task.priority = @priority)
          AND (
            (
              @scope = 'PERSONAL'
              AND task.list_id IS NOT NULL
              AND task.kpi_instance_id IS NULL
              AND list.id IS NOT NULL
              AND list.archived_at_utc IS NULL
              AND (@listId IS NULL OR task.list_id = @listId)
            )
            OR
            (
              @scope = 'KPI'
              AND task.list_id IS NULL
              AND task.kpi_instance_id IS NOT NULL
              AND instance.id IS NOT NULL
              AND cycle.id IS NOT NULL
              AND cycle.archived_at_utc IS NULL
              AND (@cycleId IS NULL OR cycle.id = @cycleId)
              AND (@kpiInstanceId IS NULL OR instance.id = @kpiInstanceId)
            )
          )
        ORDER BY
          COALESCE(task.due_date, task.start_date),
          CASE task.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
          task.title,
          task.id;
      `);

    return result.recordset;
  },
};
