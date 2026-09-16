import { getDatabasePool, sql } from "../../database/sql.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
import type { SearchAccessScope, SearchResultType } from "./search.types.js";

const itemsTable = PROCUREMENT_DB_OBJECTS.itemsTable;
const suppliersTable = PROCUREMENT_DB_OBJECTS.suppliersTable;

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
    access: SearchAccessScope,
  ): Promise<SearchResultRecord[]>;
}

async function search(
  ownerUserId: number,
  exactQuery: string,
  prefixQuery: string,
  containsQuery: string,
  limit: number,
  access: SearchAccessScope,
): Promise<SearchResultRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("exactQuery", sql.NVarChar(1000), exactQuery)
    .input("prefixQuery", sql.NVarChar(1002), prefixQuery)
    .input("containsQuery", sql.NVarChar(1002), containsQuery)
    .input("limit", sql.Int, limit)
    .input("includeKpiWorkCycles", sql.Bit, access.includeKpiWorkCycles)
    .input("canCoordinateMeetings", sql.Bit, access.canCoordinateMeetings)
    .input("includeContracts", sql.Bit, access.includeContracts)
    .input("includeSuppliers", sql.Bit, access.includeSuppliers)
    .input("includeItems", sql.Bit, access.includeItems)
    .input("includePriceQuotes", sql.Bit, access.includePriceQuotes)
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
          AND (task.kpi_instance_id IS NULL OR @includeKpiWorkCycles = 1)
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
          AND (task.kpi_instance_id IS NULL OR @includeKpiWorkCycles = 1)
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
        WHERE @includeKpiWorkCycles = 1
          AND cycle.owner_user_id = @ownerUserId
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
        WHERE @includeKpiWorkCycles = 1
          AND instance.owner_user_id = @ownerUserId
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
        WHERE @includeKpiWorkCycles = 1
          AND kpi.owner_user_id = @ownerUserId
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

        UNION ALL

        SELECT
          CAST('MEETING' AS VARCHAR(20)) AS resultType,
          meeting.id AS entityId,
          meeting.title,
          organizer.USER_NAME AS subtitle,
          NULL AS listId,
          NULL AS cycleId,
          NULL AS instanceId,
          NULL AS taskId,
          CAST(0 AS BIT) AS isCurrentContext,
          CASE
            WHEN CONVERT(NVARCHAR(30), meeting.id) = @exactQuery THEN 0
            WHEN meeting.title = @exactQuery THEN 0
            WHEN meeting.title LIKE @prefixQuery ESCAPE '\\' THEN 1
            WHEN meeting.title LIKE @containsQuery ESCAPE '\\' THEN 2
            ELSE 3
          END AS matchRank,
          6 AS typeRank
        FROM dbo.TM_meetings AS meeting
        INNER JOIN dbo.users AS organizer
          ON organizer.USER_ID = meeting.organizer_user_id
        WHERE (
            meeting.organizer_user_id = @ownerUserId
            OR @canCoordinateMeetings = 1
            OR (
              meeting.status IN ('SCHEDULED', 'CANCELLED')
              AND EXISTS (
                SELECT 1
                FROM dbo.TM_meeting_attendees AS attendee
                WHERE attendee.meeting_id = meeting.id
                  AND attendee.attendee_user_id = @ownerUserId
              )
            )
          )
          AND (
            CONVERT(NVARCHAR(30), meeting.id) = @exactQuery
            OR meeting.title LIKE @containsQuery ESCAPE '\\'
            OR meeting.description LIKE @containsQuery ESCAPE '\\'
            OR organizer.USER_NAME LIKE @containsQuery ESCAPE '\\'
            OR organizer.USER_CODE LIKE @containsQuery ESCAPE '\\'
          )

        UNION ALL

        SELECT
          CAST('MEETING_SERIES' AS VARCHAR(20)) AS resultType,
          meeting_series.id AS entityId,
          COALESCE(NULLIF(series_defaults.title, N''), N'Meeting Series') AS title,
          series_defaults.description AS subtitle,
          NULL AS listId,
          NULL AS cycleId,
          NULL AS instanceId,
          NULL AS taskId,
          CAST(0 AS BIT) AS isCurrentContext,
          CASE
            WHEN CONVERT(NVARCHAR(30), meeting_series.id) = @exactQuery THEN 0
            WHEN series_defaults.title = @exactQuery THEN 0
            WHEN series_defaults.title LIKE @prefixQuery ESCAPE '\\' THEN 1
            WHEN series_defaults.title LIKE @containsQuery ESCAPE '\\' THEN 2
            ELSE 3
          END AS matchRank,
          7 AS typeRank
        FROM dbo.TM_meeting_series AS meeting_series
        OUTER APPLY OPENJSON(meeting_series.defaults_json)
          WITH (
            title NVARCHAR(1000) '$.title',
            description NVARCHAR(MAX) '$.description'
          ) AS series_defaults
        WHERE @canCoordinateMeetings = 1
          AND meeting_series.created_by_user_id = @ownerUserId
          AND (
            CONVERT(NVARCHAR(30), meeting_series.id) = @exactQuery
            OR series_defaults.title LIKE @containsQuery ESCAPE '\\'
            OR series_defaults.description LIKE @containsQuery ESCAPE '\\'
          )

        UNION ALL

        SELECT
          CAST('CONTRACT' AS VARCHAR(20)) AS resultType,
          contract.id AS entityId,
          contract.title,
          CASE
            WHEN NULLIF(LTRIM(RTRIM(contract.contract_number)), N'') IS NOT NULL
              THEN CONCAT(contract.contract_number, N' · ', CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME))
            ELSE CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME)
          END AS subtitle,
          NULL AS listId,
          NULL AS cycleId,
          NULL AS instanceId,
          NULL AS taskId,
          CAST(0 AS BIT) AS isCurrentContext,
          CASE
            WHEN CONVERT(NVARCHAR(30), contract.id) = @exactQuery THEN 0
            WHEN contract.contract_number = @exactQuery THEN 0
            WHEN contract.title = @exactQuery
              OR CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) = @exactQuery THEN 1
            WHEN contract.contract_number LIKE @prefixQuery ESCAPE '\\' THEN 2
            WHEN contract.title LIKE @prefixQuery ESCAPE '\\' THEN 2
            WHEN contract.contract_number LIKE @containsQuery ESCAPE '\\'
              OR contract.title LIKE @containsQuery ESCAPE '\\' THEN 3
            ELSE 4
          END AS matchRank,
          8 AS typeRank
        FROM dbo.TM_contracts AS contract
        INNER JOIN ${suppliersTable} AS supplier
          ON CONVERT(BIGINT, supplier.SUPPLIER_ID) = contract.supplier_id
        WHERE @includeContracts = 1
          AND (
            contract.owner_user_id = @ownerUserId
            OR EXISTS (
              SELECT 1
              FROM dbo.TM_access_permissions AS contract_permission
              WHERE contract_permission.grantee_user_id = @ownerUserId
                AND contract_permission.module_code = 'PROCUREMENT'
                AND contract_permission.entity_code = 'CONTRACTS'
                AND contract_permission.permission_code = 'VIEW'
                AND contract_permission.resource_owner_user_id = contract.owner_user_id
                AND contract_permission.is_active = 1
            )
          )
          AND (
            CONVERT(NVARCHAR(30), contract.id) = @exactQuery
            OR contract.title LIKE @containsQuery ESCAPE '\\'
            OR contract.contract_number LIKE @containsQuery ESCAPE '\\'
            OR contract.notes LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) LIKE @containsQuery ESCAPE '\\'
          )

        UNION ALL

        SELECT
          CAST('SUPPLIER' AS VARCHAR(20)) AS resultType,
          CONVERT(BIGINT, supplier.SUPPLIER_ID) AS entityId,
          COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME))), N''), N'—') AS title,
          CASE
            WHEN NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME_S))), N'') IS NOT NULL
              THEN CONCAT(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE), N' · ', CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME_S))
            ELSE CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE)
          END AS subtitle,
          NULL AS listId,
          NULL AS cycleId,
          NULL AS instanceId,
          NULL AS taskId,
          CAST(0 AS BIT) AS isCurrentContext,
          CASE
            WHEN CONVERT(NVARCHAR(30), supplier.SUPPLIER_ID) = @exactQuery THEN 0
            WHEN CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) = @exactQuery THEN 0
            WHEN CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME) = @exactQuery THEN 1
            WHEN CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) LIKE @prefixQuery ESCAPE '\\' THEN 2
            WHEN CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME) LIKE @prefixQuery ESCAPE '\\' THEN 2
            WHEN CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) LIKE @containsQuery ESCAPE '\\'
              OR CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME) LIKE @containsQuery ESCAPE '\\' THEN 3
            ELSE 4
          END AS matchRank,
          9 AS typeRank
        FROM ${suppliersTable} AS supplier
        WHERE @includeSuppliers = 1
          AND CONVERT(BIGINT, supplier.SUPPLIER_ID) <> 0
          AND (
            CONVERT(NVARCHAR(30), supplier.SUPPLIER_ID) = @exactQuery
            OR CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME_S) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(100), supplier.MANUAL_FILE_NO) LIKE @containsQuery ESCAPE '\\'
          )

        UNION ALL

        SELECT
          CAST('ITEM' AS VARCHAR(20)) AS resultType,
          CONVERT(BIGINT, item.ITEM_NO) AS entityId,
          COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), item.ITEM_NAME))), N''), N'—') AS title,
          CASE
            WHEN NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(250), item.CATEGORY_NAME))), N'') IS NOT NULL
              THEN CONCAT(CONVERT(NVARCHAR(100), item.ITEM_CODE), N' · ', CONVERT(NVARCHAR(250), item.CATEGORY_NAME))
            ELSE CONVERT(NVARCHAR(100), item.ITEM_CODE)
          END AS subtitle,
          NULL AS listId,
          NULL AS cycleId,
          NULL AS instanceId,
          NULL AS taskId,
          CAST(0 AS BIT) AS isCurrentContext,
          CASE
            WHEN CONVERT(NVARCHAR(30), item.ITEM_NO) = @exactQuery THEN 0
            WHEN CONVERT(NVARCHAR(100), item.ITEM_CODE) = @exactQuery THEN 0
            WHEN CONVERT(NVARCHAR(500), item.ITEM_NAME) = @exactQuery THEN 1
            WHEN CONVERT(NVARCHAR(100), item.ITEM_CODE) LIKE @prefixQuery ESCAPE '\\' THEN 2
            WHEN CONVERT(NVARCHAR(500), item.ITEM_NAME) LIKE @prefixQuery ESCAPE '\\' THEN 2
            WHEN CONVERT(NVARCHAR(100), item.ITEM_CODE) LIKE @containsQuery ESCAPE '\\'
              OR CONVERT(NVARCHAR(500), item.ITEM_NAME) LIKE @containsQuery ESCAPE '\\' THEN 3
            ELSE 4
          END AS matchRank,
          10 AS typeRank
        FROM ${itemsTable} AS item
        WHERE @includeItems = 1
          AND CONVERT(BIGINT, item.ITEM_NO) <> 0
          AND (
            CONVERT(NVARCHAR(30), item.ITEM_NO) = @exactQuery
            OR CONVERT(NVARCHAR(100), item.ITEM_CODE) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(500), item.ITEM_NAME) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(500), item.ITEM_PARENT_NAME) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(250), item.CATEGORY_NAME) LIKE @containsQuery ESCAPE '\\'
          )

        UNION ALL

        SELECT
          CAST('PRICE_QUOTE' AS VARCHAR(20)) AS resultType,
          quote_row.id AS entityId,
          COALESCE(
            NULLIF(LTRIM(RTRIM(quote_row.quote_number)), N''),
            NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), item.ITEM_NAME))), N''),
            CONVERT(NVARCHAR(30), quote_row.id)
          ) AS title,
          CONCAT(
            COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), item.ITEM_NAME))), N''), N'—'),
            N' · ',
            COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), quote_supplier.SUPPLIER_NAME))), N''), N'—')
          ) AS subtitle,
          NULL AS listId,
          NULL AS cycleId,
          NULL AS instanceId,
          NULL AS taskId,
          CAST(0 AS BIT) AS isCurrentContext,
          CASE
            WHEN CONVERT(NVARCHAR(30), quote_row.id) = @exactQuery THEN 0
            WHEN quote_row.quote_number = @exactQuery THEN 0
            WHEN CONVERT(NVARCHAR(100), item.ITEM_CODE) = @exactQuery
              OR CONVERT(NVARCHAR(100), quote_supplier.SUPPLIER_CODE) = @exactQuery
              OR CONVERT(NVARCHAR(500), item.ITEM_NAME) = @exactQuery
              OR CONVERT(NVARCHAR(500), quote_supplier.SUPPLIER_NAME) = @exactQuery THEN 1
            WHEN quote_row.quote_number LIKE @prefixQuery ESCAPE '\\' THEN 2
            WHEN CONVERT(NVARCHAR(500), item.ITEM_NAME) LIKE @prefixQuery ESCAPE '\\'
              OR CONVERT(NVARCHAR(500), quote_supplier.SUPPLIER_NAME) LIKE @prefixQuery ESCAPE '\\' THEN 2
            WHEN quote_row.quote_number LIKE @containsQuery ESCAPE '\\'
              OR CONVERT(NVARCHAR(100), item.ITEM_CODE) LIKE @containsQuery ESCAPE '\\'
              OR CONVERT(NVARCHAR(100), quote_supplier.SUPPLIER_CODE) LIKE @containsQuery ESCAPE '\\'
              OR CONVERT(NVARCHAR(500), item.ITEM_NAME) LIKE @containsQuery ESCAPE '\\'
              OR CONVERT(NVARCHAR(500), quote_supplier.SUPPLIER_NAME) LIKE @containsQuery ESCAPE '\\' THEN 3
            ELSE 4
          END AS matchRank,
          11 AS typeRank
        FROM dbo.TM_price_quotes AS quote_row
        LEFT JOIN ${itemsTable} AS item
          ON CONVERT(BIGINT, item.ITEM_NO) = quote_row.item_id
        LEFT JOIN ${suppliersTable} AS quote_supplier
          ON CONVERT(BIGINT, quote_supplier.SUPPLIER_ID) = quote_row.supplier_id
        WHERE @includePriceQuotes = 1
          AND quote_row.owner_user_id = @ownerUserId
          AND (
            CONVERT(NVARCHAR(30), quote_row.id) = @exactQuery
            OR quote_row.quote_number LIKE @containsQuery ESCAPE '\\'
            OR quote_row.notes LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(100), item.ITEM_CODE) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(500), item.ITEM_NAME) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(100), quote_supplier.SUPPLIER_CODE) LIKE @containsQuery ESCAPE '\\'
            OR CONVERT(NVARCHAR(500), quote_supplier.SUPPLIER_NAME) LIKE @containsQuery ESCAPE '\\'
          )
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

