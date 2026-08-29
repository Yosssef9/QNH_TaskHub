import { getDatabasePool, sql } from "../../database/sql.js";
import type {
  DashboardAttentionTask,
  DashboardCycleSummary,
  DashboardPersonalSummary,
} from "./dashboard.types.js";

interface CycleSummaryRecord {
  total: number | string;
  completed: number | string;
  inProgress: number | string;
  overdue: number | string;
  dueToday: number | string;
}

interface AttentionTaskRecord {
  id: number | string;
  kpiInstanceId: number | string;
  title: string;
  kpiName: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: Date | null;
  isOverdue: boolean;
}

interface PersonalSummaryRecord {
  defaultListId: number | string | null;
  total: number | string;
  inProgress: number | string;
  overdue: number | string;
  dueToday: number | string;
}

function date(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

export const dashboardRepository = {
  async cycleSummary(owner: number, cycleId: number, today: string): Promise<DashboardCycleSummary> {
    const pool = await getDatabasePool();
    const result = await pool.request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId)
      .input("today", sql.Date, today)
      .query<CycleSummaryRecord>(`
        SELECT
          SUM(CASE WHEN task.status<>'CANCELLED' THEN 1 ELSE 0 END) AS total,
          SUM(CASE WHEN task.status='DONE' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN task.status='IN_PROGRESS' THEN 1 ELSE 0 END) AS inProgress,
          SUM(CASE WHEN task.due_date<@today AND task.status NOT IN('DONE','CANCELLED') THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN task.due_date=@today AND task.status NOT IN('DONE','CANCELLED') THEN 1 ELSE 0 END) AS dueToday
        FROM dbo.TM_kpi_instances instance
        INNER JOIN dbo.TM_tasks task
          ON task.kpi_instance_id=instance.id
          AND task.owner_user_id=instance.owner_user_id
          AND task.deleted_at_utc IS NULL
        WHERE instance.owner_user_id=@owner
          AND instance.cycle_id=@cycleId;
      `);

    const row = result.recordset[0];
    return {
      total: Number(row?.total ?? 0),
      completed: Number(row?.completed ?? 0),
      inProgress: Number(row?.inProgress ?? 0),
      overdue: Number(row?.overdue ?? 0),
      dueToday: Number(row?.dueToday ?? 0),
    };
  },

  async attentionTasks(
    owner: number,
    cycleId: number,
    today: string,
    limit = 6,
  ): Promise<DashboardAttentionTask[]> {
    const pool = await getDatabasePool();
    const result = await pool.request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId)
      .input("today", sql.Date, today)
      .input("limit", sql.Int, limit)
      .query<AttentionTaskRecord>(`
        SELECT TOP (@limit)
          task.id,
          instance.id AS kpiInstanceId,
          task.title,
          instance.name_snapshot AS kpiName,
          task.priority,
          task.due_date AS dueDate,
          CAST(CASE WHEN task.due_date<@today THEN 1 ELSE 0 END AS BIT) AS isOverdue
        FROM dbo.TM_kpi_instances instance
        INNER JOIN dbo.TM_tasks task
          ON task.kpi_instance_id=instance.id
          AND task.owner_user_id=instance.owner_user_id
          AND task.deleted_at_utc IS NULL
        WHERE instance.owner_user_id=@owner
          AND instance.cycle_id=@cycleId
          AND task.status NOT IN('DONE','CANCELLED')
        ORDER BY
          CASE
            WHEN task.due_date<@today THEN 0
            WHEN task.due_date=@today THEN 1
            WHEN task.due_date IS NOT NULL THEN 2
            ELSE 3
          END,
          CASE task.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
          task.due_date,
          task.id;
      `);

    return result.recordset.map((row) => ({
      id: Number(row.id),
      kpiInstanceId: Number(row.kpiInstanceId),
      title: row.title,
      kpiName: row.kpiName,
      priority: row.priority,
      dueDate: date(row.dueDate),
      isOverdue: row.isOverdue,
    }));
  },

  async personalSummary(owner: number, today: string): Promise<DashboardPersonalSummary> {
    const pool = await getDatabasePool();
    const result = await pool.request()
      .input("owner", sql.Int, owner)
      .input("today", sql.Date, today)
      .query<PersonalSummaryRecord>(`
        SELECT
          list.id AS defaultListId,
          SUM(CASE WHEN task.id IS NOT NULL AND task.status<>'CANCELLED' THEN 1 ELSE 0 END) AS total,
          SUM(CASE WHEN task.status='IN_PROGRESS' THEN 1 ELSE 0 END) AS inProgress,
          SUM(CASE WHEN task.due_date<@today AND task.status NOT IN('DONE','CANCELLED') THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN task.due_date=@today AND task.status NOT IN('DONE','CANCELLED') THEN 1 ELSE 0 END) AS dueToday
        FROM dbo.TM_lists list
        LEFT JOIN dbo.TM_tasks task
          ON task.list_id=list.id
          AND task.owner_user_id=list.owner_user_id
          AND task.deleted_at_utc IS NULL
        WHERE list.owner_user_id=@owner
          AND list.is_default=1
          AND list.archived_at_utc IS NULL
        GROUP BY list.id;
      `);

    const row = result.recordset[0];
    return {
      defaultListId: row?.defaultListId == null ? null : Number(row.defaultListId),
      total: Number(row?.total ?? 0),
      inProgress: Number(row?.inProgress ?? 0),
      overdue: Number(row?.overdue ?? 0),
      dueToday: Number(row?.dueToday ?? 0),
    };
  },
};
