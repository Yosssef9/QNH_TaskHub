import { getDatabasePool, sql } from "../../database/sql.js";
import type { SearchResultType } from "./search.types.js";

export interface SearchResultRecord {
  resultType: SearchResultType;
  entityId: number | string;
  title: string;
  subtitle: string | null;
  listId: number | string | null;
  cycleId: number | string | null;
  instanceId: number | string | null;
  taskId: number | string | null;
  isCurrentContext: boolean;
}

export interface SearchRepository {
  search(
    ownerUserId: number,
    exactQuery: string,
    prefixQuery: string,
    containsQuery: string,
    limit: number,
  ): Promise<SearchResultRecord[]>;
}

async function search(
  ownerUserId: number,
  exactQuery: string,
  prefixQuery: string,
  containsQuery: string,
  limit: number,
): Promise<SearchResultRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("exactQuery", sql.NVarChar(120), exactQuery)
    .input("prefixQuery", sql.NVarChar(244), prefixQuery)
    .input("containsQuery", sql.NVarChar(246), containsQuery)
    .input("limit", sql.Int, limit)
    .query<SearchResultRecord>(`
      ;WITH current_cycle AS (
        SELECT settings.current_work_cycle_id AS cycleId
        FROM dbo.TM_user_settings AS settings
        INNER JOIN dbo.TM_work_cycles AS cycle
          ON cycle.id = settings.current_work_cycle_id
          AND cycle.owner_user_id = settings.portal_user_id
          AND cycle.closed_at_utc IS NULL
          AND cycle.archived_at_utc IS NULL
        WHERE settings.portal_user_id = @ownerUserId
      ),
      matches AS (
        SELECT
          CAST('TASK' AS VARCHAR(20)) AS resultType,
          task.id AS entityId,
          task.title,
          CASE
            WHEN list.id IS NOT NULL THEN list.name
            WHEN cycle.id IS NOT NULL THEN CONCAT(cycle.title, N' · ', instance.name_snapshot)
            ELSE NULL
          END AS subtitle,
          task.list_id AS listId,
          instance.cycle_id AS cycleId,
          task.kpi_instance_id AS instanceId,
          task.id AS taskId,
          CAST(CASE WHEN instance.cycle_id = current_cycle.cycleId THEN 1 ELSE 0 END AS BIT) AS isCurrentContext,
          CASE
            WHEN task.title = @exactQuery THEN 0
            WHEN task.title LIKE @prefixQuery ESCAPE '\\' THEN 1
            WHEN task.title LIKE @containsQuery ESCAPE '\\' THEN 2
            ELSE 3
          END AS matchRank,
          0 AS typeRank
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
        LEFT JOIN current_cycle ON 1 = 1
        WHERE task.owner_user_id = @ownerUserId
          AND task.deleted_at_utc IS NULL
          AND (task.list_id IS NULL OR list.archived_at_utc IS NULL)
          AND (task.kpi_instance_id IS NULL OR cycle.archived_at_utc IS NULL)
          AND (
            task.title LIKE @containsQuery ESCAPE '\\'
            OR task.description LIKE @containsQuery ESCAPE '\\'
          )

        UNION ALL

        SELECT
          CAST('SUBTASK' AS VARCHAR(20)) AS resultType,
          subtask.id AS entityId,
          subtask.title,
          CASE
            WHEN list.id IS NOT NULL THEN CONCAT(task.title, N' · ', list.name)
            WHEN cycle.id IS NOT NULL THEN CONCAT(task.title, N' · ', cycle.title)
            ELSE task.title
          END AS subtitle,
          task.list_id AS listId,
          instance.cycle_id AS cycleId,
          task.kpi_instance_id AS instanceId,
          task.id AS taskId,
          CAST(CASE WHEN instance.cycle_id = current_cycle.cycleId THEN 1 ELSE 0 END AS BIT) AS isCurrentContext,
          CASE
            WHEN subtask.title = @exactQuery THEN 0
            WHEN subtask.title LIKE @prefixQuery ESCAPE '\\' THEN 1
            ELSE 2
          END AS matchRank,
          1 AS typeRank
        FROM dbo.TM_subtasks AS subtask
        INNER JOIN dbo.TM_tasks AS task
          ON task.id = subtask.task_id
          AND task.owner_user_id = subtask.owner_user_id
        LEFT JOIN dbo.TM_lists AS list
          ON list.id = task.list_id
          AND list.owner_user_id = task.owner_user_id
        LEFT JOIN dbo.TM_kpi_instances AS instance
          ON instance.id = task.kpi_instance_id
          AND instance.owner_user_id = task.owner_user_id
        LEFT JOIN dbo.TM_work_cycles AS cycle
          ON cycle.id = instance.cycle_id
          AND cycle.owner_user_id = instance.owner_user_id
        LEFT JOIN current_cycle ON 1 = 1
        WHERE subtask.owner_user_id = @ownerUserId
          AND subtask.deleted_at_utc IS NULL
          AND task.deleted_at_utc IS NULL
          AND (task.list_id IS NULL OR list.archived_at_utc IS NULL)
          AND (task.kpi_instance_id IS NULL OR cycle.archived_at_utc IS NULL)
          AND subtask.title LIKE @containsQuery ESCAPE '\\'

        UNION ALL

        SELECT
          CAST('WORK_CYCLE' AS VARCHAR(20)) AS resultType,
          cycle.id AS entityId,
          cycle.title,
          cycle.description AS subtitle,
          NULL AS listId,
          cycle.id AS cycleId,
          NULL AS instanceId,
          NULL AS taskId,
          CAST(CASE WHEN cycle.id = current_cycle.cycleId THEN 1 ELSE 0 END AS BIT) AS isCurrentContext,
          CASE
            WHEN cycle.title = @exactQuery THEN 0
            WHEN cycle.title LIKE @prefixQuery ESCAPE '\\' THEN 1
            WHEN cycle.title LIKE @containsQuery ESCAPE '\\' THEN 2
            ELSE 3
          END AS matchRank,
          2 AS typeRank
        FROM dbo.TM_work_cycles AS cycle
        LEFT JOIN current_cycle ON 1 = 1
        WHERE cycle.owner_user_id = @ownerUserId
          AND cycle.archived_at_utc IS NULL
          AND (
            cycle.title LIKE @containsQuery ESCAPE '\\'
            OR cycle.description LIKE @containsQuery ESCAPE '\\'
          )

        UNION ALL

        SELECT
          CAST('KPI_INSTANCE' AS VARCHAR(20)) AS resultType,
          instance.id AS entityId,
          instance.name_snapshot AS title,
          cycle.title AS subtitle,
          NULL AS listId,
          instance.cycle_id AS cycleId,
          instance.id AS instanceId,
          NULL AS taskId,
          CAST(CASE WHEN instance.cycle_id = current_cycle.cycleId THEN 1 ELSE 0 END AS BIT) AS isCurrentContext,
          CASE
            WHEN instance.name_snapshot = @exactQuery THEN 0
            WHEN instance.name_snapshot LIKE @prefixQuery ESCAPE '\\' THEN 1
            WHEN instance.name_snapshot LIKE @containsQuery ESCAPE '\\' THEN 2
            ELSE 3
          END AS matchRank,
          3 AS typeRank
        FROM dbo.TM_kpi_instances AS instance
        INNER JOIN dbo.TM_work_cycles AS cycle
          ON cycle.id = instance.cycle_id
          AND cycle.owner_user_id = instance.owner_user_id
        LEFT JOIN current_cycle ON 1 = 1
        WHERE instance.owner_user_id = @ownerUserId
          AND cycle.archived_at_utc IS NULL
          AND (
            instance.name_snapshot LIKE @containsQuery ESCAPE '\\'
            OR instance.description_snapshot LIKE @containsQuery ESCAPE '\\'
          )

        UNION ALL

        SELECT
          CAST('KPI_TEMPLATE' AS VARCHAR(20)) AS resultType,
          kpi.id AS entityId,
          kpi.name AS title,
          kpi.description AS subtitle,
          NULL AS listId,
          NULL AS cycleId,
          NULL AS instanceId,
          NULL AS taskId,
          CAST(0 AS BIT) AS isCurrentContext,
          CASE
            WHEN kpi.name = @exactQuery THEN 0
            WHEN kpi.name LIKE @prefixQuery ESCAPE '\\' THEN 1
            WHEN kpi.name LIKE @containsQuery ESCAPE '\\' THEN 2
            ELSE 3
          END AS matchRank,
          4 AS typeRank
        FROM dbo.TM_kpis AS kpi
        WHERE kpi.owner_user_id = @ownerUserId
          AND kpi.archived_at_utc IS NULL
          AND (
            kpi.name LIKE @containsQuery ESCAPE '\\'
            OR kpi.description LIKE @containsQuery ESCAPE '\\'
          )

        UNION ALL

        SELECT
          CAST('LIST' AS VARCHAR(20)) AS resultType,
          list.id AS entityId,
          list.name AS title,
          NULL AS subtitle,
          list.id AS listId,
          NULL AS cycleId,
          NULL AS instanceId,
          NULL AS taskId,
          CAST(0 AS BIT) AS isCurrentContext,
          CASE
            WHEN list.name = @exactQuery THEN 0
            WHEN list.name LIKE @prefixQuery ESCAPE '\\' THEN 1
            ELSE 2
          END AS matchRank,
          5 AS typeRank
        FROM dbo.TM_lists AS list
        WHERE list.owner_user_id = @ownerUserId
          AND list.archived_at_utc IS NULL
          AND list.name LIKE @containsQuery ESCAPE '\\'
      ),
      ranked AS (
        SELECT
          matches.*,
          ROW_NUMBER() OVER (
            PARTITION BY resultType
            ORDER BY matchRank, isCurrentContext DESC, title, entityId
          ) AS typeRow
        FROM matches
      )
      SELECT TOP (@limit)
        resultType,
        entityId,
        title,
        subtitle,
        listId,
        cycleId,
        instanceId,
        taskId,
        isCurrentContext
      FROM ranked
      WHERE typeRow <= 5
      ORDER BY matchRank, isCurrentContext DESC, typeRank, title, entityId;
    `);

  return result.recordset;
}

export const searchRepository: SearchRepository = { search };
