import { getDatabasePool, sql } from '../../database/sql.js';

export interface DashboardListSummary {
  listId: number;
  total: number;
  active: number;
  completed: number;
}

interface ListSummaryRow {
  listId: number | string;
  total: number | string;
  active: number | string;
  completed: number | string;
}

/**
 * A list can only be visible to its owner. Never derive a list's counts
 * through another person's assignment or share: that would expose private
 * task metadata outside the normal list ownership boundary.
 */
export const dashboardListsRepository = {
  async summaries(ownerUserId: number): Promise<DashboardListSummary[]> {
    const pool = await getDatabasePool();
    const result = await pool.request()
      .input('ownerUserId', sql.Int, ownerUserId)
      .query<ListSummaryRow>(`
        SELECT l.id AS listId,
          COUNT_BIG(t.id) AS total,
          COALESCE(SUM(CASE WHEN t.status IN ('TODO', 'IN_PROGRESS') THEN 1 ELSE 0 END), 0) AS active,
          COALESCE(SUM(CASE WHEN t.status = 'DONE' THEN 1 ELSE 0 END), 0) AS completed
        FROM dbo.TM_lists AS l
        LEFT JOIN dbo.TM_tasks AS t
          ON t.list_id = l.id
          AND t.owner_user_id = l.owner_user_id
          AND t.deleted_at_utc IS NULL
          AND t.kpi_instance_id IS NULL
          AND t.status <> 'CANCELLED'
        WHERE l.owner_user_id = @ownerUserId
          AND l.archived_at_utc IS NULL
        GROUP BY l.id
        ORDER BY l.id;
      `);
    return result.recordset.map(row => ({
      listId: Number(row.listId),
      total: Number(row.total),
      active: Number(row.active),
      completed: Number(row.completed),
    }));
  },
};
