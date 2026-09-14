import { getDatabasePool, sql } from "../../database/sql.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
import type { NotificationType } from "./notifications.types.js";

export interface NotificationRecord {
  id: number | string;
  notificationType: NotificationType;
  subjectTitle: string;
  contextTitle: string | null;
  taskId: number | string | null;
  listId: number | string | null;
  cycleId: number | string | null;
  kpiInstanceId: number | string | null;
  contractId: number | string | null;
  meetingId: number | string | null;
  meetingRevisionId: number | string | null;
  eventDate: Date | null;
  actualValue: number | null;
  targetValue: number | null;
  measurementUnit: "PERCENT" | "NUMBER" | null;
  readAtUtc: Date | null;
  createdAtUtc: Date;
}

export interface NotificationEmailCandidate extends NotificationRecord {
  ownerUserId: number;
  dedupeKey: string;
}

export interface TaskEmailState {
  status: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: Date | null;
  deletedAtUtc: Date | null;
  listId: number | string | null;
  listArchivedAtUtc: Date | null;
  kpiInstanceId: number | string | null;
  cycleId: number | string | null;
  cycleClosedAtUtc: Date | null;
  cycleArchivedAtUtc: Date | null;
}

export interface MeetingActionItemNotificationInput {
  type: "MEETING_ACTION_ITEM_ASSIGNED" | "MEETING_ACTION_ITEM_COMPLETED";
  dedupeKey: string;
  subjectTitle: string;
  contextTitle: string;
  taskId: number;
  listId?: number | null;
  meetingId: number;
}

export interface KpiNotificationInput {
  type: "KPI_BELOW_TARGET" | "KPI_MEASUREMENT_DUE";
  dedupeKey: string;
  subjectTitle: string;
  contextTitle: string;
  cycleId: number;
  kpiInstanceId: number;
  eventDate: string;
  actualValue: number | null;
  targetValue: number | null;
  measurementUnit: "PERCENT" | "NUMBER";
}

const taskContext = `CASE
  WHEN task.list_id IS NOT NULL THEN list.name
  ELSE CONCAT(cycle.title, N' · ', instance.name_snapshot)
END`;

const activeTaskContainer = `(
  (task.list_id IS NOT NULL AND list.archived_at_utc IS NULL)
  OR
  (task.kpi_instance_id IS NOT NULL AND cycle.closed_at_utc IS NULL AND cycle.archived_at_utc IS NULL)
)`;

export const notificationsRepository = {
  async ensureMeetingActionItemNotification(
    owner: number,
    input: MeetingActionItemNotificationInput,
    transaction?: DatabaseTransaction,
  ): Promise<void> {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    await request
      .input("owner", sql.Int, owner)
      .input("type", sql.VarChar(40), input.type)
      .input("dedupeKey", sql.VarChar(220), input.dedupeKey)
      .input("subjectTitle", sql.NVarChar(250), input.subjectTitle)
      .input("contextTitle", sql.NVarChar(500), input.contextTitle)
      .input("taskId", sql.BigInt, input.taskId)
      .input("listId", sql.BigInt, input.listId ?? null)
      .input("meetingId", sql.BigInt, input.meetingId)
      .query(`
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.TM_notifications WITH (UPDLOCK, HOLDLOCK)
          WHERE owner_user_id = @owner AND dedupe_key = @dedupeKey
        )
        BEGIN
          INSERT INTO dbo.TM_notifications (
            owner_user_id,
            notification_type,
            dedupe_key,
            subject_title,
            context_title,
            task_id,
            list_id,
            meeting_id,
            email_processed_at_utc
          )
          VALUES (
            @owner,
            @type,
            @dedupeKey,
            @subjectTitle,
            @contextTitle,
            @taskId,
            @listId,
            @meetingId,
            SYSUTCDATETIME()
          );
        END;
      `);
  },

  async listActiveOwners(): Promise<number[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().query<{ ownerUserId: number | string }>(`
      SELECT access.portal_user_id AS ownerUserId
      FROM dbo.TM_user_access AS access
      INNER JOIN dbo.users AS portal ON portal.USER_ID = access.portal_user_id
      WHERE access.is_active = 1
        AND portal.IS_ACTIVE = 1
      ORDER BY access.portal_user_id;
    `);
    return result.recordset.map((row) => Number(row.ownerUserId));
  },

  async listUnprocessedEmailCandidates(limit: number, today: string): Promise<NotificationEmailCandidate[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("limit", sql.Int, limit).input("today", sql.Date, today)
      .query<NotificationEmailCandidate>(`
      SELECT TOP (@limit)
        id,
        owner_user_id AS ownerUserId,
        notification_type AS notificationType,
        dedupe_key AS dedupeKey,
        subject_title AS subjectTitle,
        context_title AS contextTitle,
        task_id AS taskId,
        list_id AS listId,
        cycle_id AS cycleId,
        kpi_instance_id AS kpiInstanceId,
        contract_id AS contractId,
        meeting_id AS meetingId,
        meeting_revision_id AS meetingRevisionId,
        event_date AS eventDate,
        actual_value AS actualValue,
        target_value AS targetValue,
        measurement_unit AS measurementUnit,
        read_at_utc AS readAtUtc,
        created_at_utc AS createdAtUtc
      FROM dbo.TM_notifications AS notification WITH (READPAST)
      WHERE notification.email_processed_at_utc IS NULL
        AND (
          notification.notification_type NOT IN ('CONTRACT_EXPIRATION_REMINDER', 'CONTRACT_NOTICE_DEADLINE_REMINDER')
          OR (
            notification.event_date >= @today
            AND EXISTS (
              SELECT 1
              FROM dbo.TM_contract_user_settings AS contract_settings
              INNER JOIN dbo.TM_user_access AS access
                ON access.portal_user_id = contract_settings.owner_user_id
              INNER JOIN dbo.TM_user_settings AS user_settings
                ON user_settings.portal_user_id = contract_settings.owner_user_id
              WHERE contract_settings.owner_user_id = notification.owner_user_id
                AND access.is_active = 1
                AND EXISTS (
                  SELECT 1
                  FROM dbo.TM_access_permissions AS contract_permission
                  WHERE contract_permission.grantee_user_id = access.portal_user_id
                    AND contract_permission.module_code = 'PROCUREMENT'
                    AND contract_permission.entity_code = 'CONTRACTS'
                    AND contract_permission.permission_code = 'ACCESS'
                    AND contract_permission.resource_owner_user_id IS NULL
                    AND contract_permission.is_active = 1
                )
                AND user_settings.email_notifications_enabled = 1
                AND (
                  (notification.notification_type = 'CONTRACT_EXPIRATION_REMINDER'
                    AND contract_settings.expiration_email_enabled = 1
                    AND @today >= DATEADD(DAY, -contract_settings.expiration_reminder_lead_days, notification.event_date))
                  OR
                  (notification.notification_type = 'CONTRACT_NOTICE_DEADLINE_REMINDER'
                    AND contract_settings.notice_email_enabled = 1
                    AND @today >= DATEADD(DAY, -contract_settings.notice_reminder_lead_days, notification.event_date))
                )
            )
          )
        )
      ORDER BY notification.id;
    `);
    return result.recordset.map((row) => ({ ...row, ownerUserId: Number(row.ownerUserId) }));
  },

  async markEmailProcessed(notificationId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("notificationId", sql.BigInt, notificationId).query(`
      UPDATE dbo.TM_notifications
      SET email_processed_at_utc = COALESCE(email_processed_at_utc, SYSUTCDATETIME())
      WHERE id = @notificationId;
    `);
  },

  async getTaskEmailState(owner: number, taskId: number): Promise<TaskEmailState | null> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("taskId", sql.BigInt, taskId).query<TaskEmailState>(`
        SELECT TOP (1)
          task.status,
          task.priority,
          task.due_date AS dueDate,
          task.deleted_at_utc AS deletedAtUtc,
          task.list_id AS listId,
          list.archived_at_utc AS listArchivedAtUtc,
          task.kpi_instance_id AS kpiInstanceId,
          instance.cycle_id AS cycleId,
          cycle.closed_at_utc AS cycleClosedAtUtc,
          cycle.archived_at_utc AS cycleArchivedAtUtc
        FROM dbo.TM_tasks AS task
        LEFT JOIN dbo.TM_lists AS list
          ON list.id = task.list_id AND list.owner_user_id = task.owner_user_id
        LEFT JOIN dbo.TM_kpi_instances AS instance
          ON instance.id = task.kpi_instance_id AND instance.owner_user_id = task.owner_user_id
        LEFT JOIN dbo.TM_work_cycles AS cycle
          ON cycle.id = instance.cycle_id AND cycle.owner_user_id = instance.owner_user_id
        WHERE task.owner_user_id = @owner
          AND task.id = @taskId;
      `);
    return result.recordset[0] ?? null;
  },
  async syncTimeBased(
    owner: number,
    today: string,
    tomorrow: string,
    includeKpiWorkCycles = true,
  ): Promise<void> {
    const pool = await getDatabasePool();
    await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("today", sql.Date, today)
      .input("tomorrow", sql.Date, tomorrow)
      .input("includeKpiWorkCycles", sql.Bit, includeKpiWorkCycles).query(`
        MERGE dbo.TM_notifications WITH (HOLDLOCK) AS target
        USING (
          SELECT
            CAST('TASK_OVERDUE' AS VARCHAR(40)) AS notificationType,
            CONVERT(VARCHAR(220), CONCAT('TASK_OVERDUE:', task.id, ':', CONVERT(VARCHAR(10), task.due_date, 23))) AS dedupeKey,
            task.title AS subjectTitle,
            ${taskContext} AS contextTitle,
            task.id AS taskId,
            task.list_id AS listId,
            instance.cycle_id AS cycleId,
            task.kpi_instance_id AS kpiInstanceId,
            task.due_date AS eventDate,
            CAST(NULL AS DECIMAL(19,4)) AS actualValue,
            CAST(NULL AS DECIMAL(19,4)) AS targetValue,
            CAST(NULL AS VARCHAR(10)) AS measurementUnit
          FROM dbo.TM_tasks task
          LEFT JOIN dbo.TM_lists list
            ON list.id=task.list_id AND list.owner_user_id=task.owner_user_id
          LEFT JOIN dbo.TM_kpi_instances instance
            ON instance.id=task.kpi_instance_id AND instance.owner_user_id=task.owner_user_id
          LEFT JOIN dbo.TM_work_cycles cycle
            ON cycle.id=instance.cycle_id AND cycle.owner_user_id=instance.owner_user_id
          WHERE task.owner_user_id=@owner
            AND task.deleted_at_utc IS NULL
            AND (task.kpi_instance_id IS NULL OR @includeKpiWorkCycles = 1)
            AND task.status NOT IN ('DONE','CANCELLED')
            AND task.due_date<@today
            AND ${activeTaskContainer}

          UNION ALL

          SELECT
            CAST('TASK_DUE_TODAY' AS VARCHAR(40)),
            CONVERT(VARCHAR(220), CONCAT('TASK_DUE_TODAY:', task.id, ':', CONVERT(VARCHAR(10), task.due_date, 23))),
            task.title,
            ${taskContext},
            task.id,
            task.list_id,
            instance.cycle_id,
            task.kpi_instance_id,
            task.due_date,
            CAST(NULL AS DECIMAL(19,4)),
            CAST(NULL AS DECIMAL(19,4)),
            CAST(NULL AS VARCHAR(10))
          FROM dbo.TM_tasks task
          LEFT JOIN dbo.TM_lists list
            ON list.id=task.list_id AND list.owner_user_id=task.owner_user_id
          LEFT JOIN dbo.TM_kpi_instances instance
            ON instance.id=task.kpi_instance_id AND instance.owner_user_id=task.owner_user_id
          LEFT JOIN dbo.TM_work_cycles cycle
            ON cycle.id=instance.cycle_id AND cycle.owner_user_id=instance.owner_user_id
          WHERE task.owner_user_id=@owner
            AND task.deleted_at_utc IS NULL
            AND (task.kpi_instance_id IS NULL OR @includeKpiWorkCycles = 1)
            AND task.status NOT IN ('DONE','CANCELLED')
            AND task.due_date=@today
            AND ${activeTaskContainer}

          UNION ALL

          SELECT
            CAST('HIGH_PRIORITY_TASK_DUE_TOMORROW' AS VARCHAR(40)),
            CONVERT(VARCHAR(220), CONCAT('HIGH_PRIORITY_TASK_DUE_TOMORROW:', task.id, ':', CONVERT(VARCHAR(10), task.due_date, 23))),
            task.title,
            ${taskContext},
            task.id,
            task.list_id,
            instance.cycle_id,
            task.kpi_instance_id,
            task.due_date,
            CAST(NULL AS DECIMAL(19,4)),
            CAST(NULL AS DECIMAL(19,4)),
            CAST(NULL AS VARCHAR(10))
          FROM dbo.TM_tasks task
          LEFT JOIN dbo.TM_lists list
            ON list.id=task.list_id AND list.owner_user_id=task.owner_user_id
          LEFT JOIN dbo.TM_kpi_instances instance
            ON instance.id=task.kpi_instance_id AND instance.owner_user_id=task.owner_user_id
          LEFT JOIN dbo.TM_work_cycles cycle
            ON cycle.id=instance.cycle_id AND cycle.owner_user_id=instance.owner_user_id
          WHERE task.owner_user_id=@owner
            AND task.deleted_at_utc IS NULL
            AND (task.kpi_instance_id IS NULL OR @includeKpiWorkCycles = 1)
            AND task.status NOT IN ('DONE','CANCELLED')
            AND task.priority='HIGH'
            AND task.due_date=@tomorrow
            AND ${activeTaskContainer}

          UNION ALL

          SELECT
            CAST('CURRENT_CYCLE_ENDING_SOON' AS VARCHAR(40)),
            CONVERT(VARCHAR(220), CONCAT('CURRENT_CYCLE_ENDING_SOON:', cycle.id, ':', CONVERT(VARCHAR(10), cycle.end_date, 23))),
            cycle.title,
            CAST(NULL AS NVARCHAR(500)),
            CAST(NULL AS BIGINT),
            CAST(NULL AS BIGINT),
            cycle.id,
            CAST(NULL AS BIGINT),
            cycle.end_date,
            CAST(NULL AS DECIMAL(19,4)),
            CAST(NULL AS DECIMAL(19,4)),
            CAST(NULL AS VARCHAR(10))
          FROM dbo.TM_user_settings settings
          INNER JOIN dbo.TM_work_cycles cycle
            ON cycle.id=settings.current_work_cycle_id
            AND cycle.owner_user_id=settings.portal_user_id
          WHERE settings.portal_user_id=@owner
            AND @includeKpiWorkCycles = 1
            AND cycle.closed_at_utc IS NULL
            AND cycle.archived_at_utc IS NULL
            AND cycle.end_date BETWEEN @today AND DATEADD(DAY, 3, @today)

          UNION ALL

          SELECT
            CAST('CURRENT_CYCLE_PAST_END' AS VARCHAR(40)),
            CONVERT(VARCHAR(220), CONCAT('CURRENT_CYCLE_PAST_END:', cycle.id, ':', CONVERT(VARCHAR(10), cycle.end_date, 23))),
            cycle.title,
            CAST(NULL AS NVARCHAR(500)),
            CAST(NULL AS BIGINT),
            CAST(NULL AS BIGINT),
            cycle.id,
            CAST(NULL AS BIGINT),
            cycle.end_date,
            CAST(NULL AS DECIMAL(19,4)),
            CAST(NULL AS DECIMAL(19,4)),
            CAST(NULL AS VARCHAR(10))
          FROM dbo.TM_user_settings settings
          INNER JOIN dbo.TM_work_cycles cycle
            ON cycle.id=settings.current_work_cycle_id
            AND cycle.owner_user_id=settings.portal_user_id
          WHERE settings.portal_user_id=@owner
            AND @includeKpiWorkCycles = 1
            AND cycle.closed_at_utc IS NULL
            AND cycle.archived_at_utc IS NULL
            AND cycle.end_date<@today
        ) AS source
          ON target.owner_user_id=@owner AND target.dedupe_key=source.dedupeKey
        WHEN NOT MATCHED THEN
          INSERT (
            owner_user_id,
            notification_type,
            dedupe_key,
            subject_title,
            context_title,
            task_id,
            list_id,
            cycle_id,
            kpi_instance_id,
            event_date,
            actual_value,
            target_value,
            measurement_unit
          )
          VALUES (
            @owner,
            source.notificationType,
            source.dedupeKey,
            source.subjectTitle,
            source.contextTitle,
            source.taskId,
            source.listId,
            source.cycleId,
            source.kpiInstanceId,
            source.eventDate,
            source.actualValue,
            source.targetValue,
            source.measurementUnit
          );
      `);
  },

  async syncContractNotifications(owner: number, today: string): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("owner", sql.Int, owner).input("today", sql.Date, today).query(`
      MERGE dbo.TM_notifications WITH (HOLDLOCK) AS target
      USING (
        SELECT
          CAST('CONTRACT_EXPIRATION_REMINDER' AS VARCHAR(40)) AS notificationType,
          CONVERT(VARCHAR(220), CONCAT('CONTRACT_EXPIRATION_REMINDER:', contract.id, ':', CONVERT(VARCHAR(10), contract.end_date, 23))) AS dedupeKey,
          contract.title AS subjectTitle,
          CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME) AS contextTitle,
          contract.id AS contractId,
          contract.end_date AS eventDate
        FROM dbo.TM_contracts AS contract
        INNER JOIN ${PROCUREMENT_DB_OBJECTS.suppliersTable} AS supplier
          ON CONVERT(BIGINT, supplier.SUPPLIER_ID) = contract.supplier_id
        INNER JOIN dbo.TM_contract_user_settings AS settings
          ON settings.owner_user_id = contract.owner_user_id
        INNER JOIN dbo.TM_user_access AS access
          ON access.portal_user_id = contract.owner_user_id
        WHERE contract.owner_user_id = @owner
          AND access.is_active = 1
          AND EXISTS (
            SELECT 1
            FROM dbo.TM_access_permissions AS contract_permission
            WHERE contract_permission.grantee_user_id = access.portal_user_id
              AND contract_permission.module_code = 'PROCUREMENT'
              AND contract_permission.entity_code = 'CONTRACTS'
              AND contract_permission.permission_code = 'ACCESS'
              AND contract_permission.resource_owner_user_id IS NULL
              AND contract_permission.is_active = 1
          )
          AND contract.is_active = 1
          AND contract.end_date IS NOT NULL
          AND @today BETWEEN DATEADD(DAY, -settings.expiration_reminder_lead_days, contract.end_date) AND contract.end_date

        UNION ALL

        SELECT
          CAST('CONTRACT_NOTICE_DEADLINE_REMINDER' AS VARCHAR(40)),
          CONVERT(VARCHAR(220), CONCAT('CONTRACT_NOTICE_DEADLINE_REMINDER:', contract.id, ':', CONVERT(VARCHAR(10), DATEADD(DAY, -contract.notice_period_days, contract.end_date), 23))),
          contract.title,
          CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME),
          contract.id,
          DATEADD(DAY, -contract.notice_period_days, contract.end_date)
        FROM dbo.TM_contracts AS contract
        INNER JOIN ${PROCUREMENT_DB_OBJECTS.suppliersTable} AS supplier
          ON CONVERT(BIGINT, supplier.SUPPLIER_ID) = contract.supplier_id
        INNER JOIN dbo.TM_contract_user_settings AS settings
          ON settings.owner_user_id = contract.owner_user_id
        INNER JOIN dbo.TM_user_access AS access
          ON access.portal_user_id = contract.owner_user_id
        WHERE contract.owner_user_id = @owner
          AND access.is_active = 1
          AND EXISTS (
            SELECT 1
            FROM dbo.TM_access_permissions AS contract_permission
            WHERE contract_permission.grantee_user_id = access.portal_user_id
              AND contract_permission.module_code = 'PROCUREMENT'
              AND contract_permission.entity_code = 'CONTRACTS'
              AND contract_permission.permission_code = 'ACCESS'
              AND contract_permission.resource_owner_user_id IS NULL
              AND contract_permission.is_active = 1
          )
          AND contract.is_active = 1
          AND contract.is_auto_renewal = 1
          AND contract.end_date IS NOT NULL
          AND contract.notice_period_days IS NOT NULL
          AND @today BETWEEN
              DATEADD(DAY, -settings.notice_reminder_lead_days, DATEADD(DAY, -contract.notice_period_days, contract.end_date))
              AND DATEADD(DAY, -contract.notice_period_days, contract.end_date)
      ) AS source
        ON target.owner_user_id = @owner AND target.dedupe_key = source.dedupeKey
      WHEN NOT MATCHED THEN
        INSERT (
          owner_user_id, notification_type, dedupe_key, subject_title, context_title,
          contract_id, event_date, actual_value, target_value, measurement_unit
        )
        VALUES (
          @owner, source.notificationType, source.dedupeKey, source.subjectTitle, source.contextTitle,
          source.contractId, source.eventDate, NULL, NULL, NULL
        );
    `);
  },

  async ensureKpiNotification(owner: number, input: KpiNotificationInput): Promise<void> {
    const pool = await getDatabasePool();
    await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("type", sql.VarChar(40), input.type)
      .input("dedupe", sql.VarChar(220), input.dedupeKey)
      .input("subject", sql.NVarChar(1000), input.subjectTitle)
      .input("context", sql.NVarChar(1000), input.contextTitle)
      .input("cycleId", sql.BigInt, input.cycleId)
      .input("instanceId", sql.BigInt, input.kpiInstanceId)
      .input("eventDate", sql.Date, input.eventDate)
      .input("actual", sql.Decimal(19, 4), input.actualValue)
      .input("targetValue", sql.Decimal(19, 4), input.targetValue)
      .input("unit", sql.VarChar(10), input.measurementUnit).query(`
        MERGE dbo.TM_notifications WITH (HOLDLOCK) AS target
        USING (SELECT @owner AS ownerUserId, @dedupe AS dedupeKey) AS source
          ON target.owner_user_id=source.ownerUserId AND target.dedupe_key=source.dedupeKey
        WHEN NOT MATCHED THEN
          INSERT (
            owner_user_id,
            notification_type,
            dedupe_key,
            subject_title,
            context_title,
            cycle_id,
            kpi_instance_id,
            event_date,
            actual_value,
            target_value,
            measurement_unit
          )
          VALUES (
            @owner,
            @type,
            @dedupe,
            @subject,
            @context,
            @cycleId,
            @instanceId,
            @eventDate,
            @actual,
            @targetValue,
            @unit
          );
      `);
  },

  async list(
    owner: number,
    limit: number,
    includeKpiWorkCycles = true,
  ): Promise<NotificationRecord[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("limit", sql.Int, limit)
      .input("includeKpiWorkCycles", sql.Bit, includeKpiWorkCycles).query<NotificationRecord>(`
        SELECT TOP (@limit)
          id,
          notification_type AS notificationType,
          subject_title AS subjectTitle,
          context_title AS contextTitle,
          task_id AS taskId,
          list_id AS listId,
          cycle_id AS cycleId,
          kpi_instance_id AS kpiInstanceId,
          contract_id AS contractId,
          meeting_id AS meetingId,
          meeting_revision_id AS meetingRevisionId,
          event_date AS eventDate,
          actual_value AS actualValue,
          target_value AS targetValue,
          measurement_unit AS measurementUnit,
          read_at_utc AS readAtUtc,
          created_at_utc AS createdAtUtc
        FROM dbo.TM_notifications
        WHERE owner_user_id=@owner
          AND (
            @includeKpiWorkCycles = 1
            OR (
              kpi_instance_id IS NULL
              AND notification_type NOT IN (
                'CURRENT_CYCLE_ENDING_SOON',
                'CURRENT_CYCLE_PAST_END',
                'KPI_BELOW_TARGET',
                'KPI_MEASUREMENT_DUE'
              )
            )
          )
        ORDER BY
          CASE WHEN read_at_utc IS NULL THEN 0 ELSE 1 END,
          created_at_utc DESC,
          id DESC;
      `);
    return result.recordset;
  },

  async unreadCount(owner: number, includeKpiWorkCycles = true): Promise<number> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("includeKpiWorkCycles", sql.Bit, includeKpiWorkCycles).query<{
      total: number | string;
    }>(`
        SELECT COUNT_BIG(*) AS total
        FROM dbo.TM_notifications
        WHERE owner_user_id=@owner
          AND read_at_utc IS NULL
          AND (
            @includeKpiWorkCycles = 1
            OR (
              kpi_instance_id IS NULL
              AND notification_type NOT IN (
                'CURRENT_CYCLE_ENDING_SOON',
                'CURRENT_CYCLE_PAST_END',
                'KPI_BELOW_TARGET',
                'KPI_MEASUREMENT_DUE'
              )
            )
          );
      `);
    return Number(result.recordset[0]?.total ?? 0);
  },

  async markRead(
    owner: number,
    notificationId: number,
    includeKpiWorkCycles = true,
  ): Promise<boolean> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("notificationId", sql.BigInt, notificationId)
      .input("includeKpiWorkCycles", sql.Bit, includeKpiWorkCycles).query(`
        UPDATE dbo.TM_notifications
        SET read_at_utc=COALESCE(read_at_utc,SYSUTCDATETIME())
        WHERE id=@notificationId
          AND owner_user_id=@owner
          AND (
            @includeKpiWorkCycles = 1
            OR (
              kpi_instance_id IS NULL
              AND notification_type NOT IN (
                'CURRENT_CYCLE_ENDING_SOON',
                'CURRENT_CYCLE_PAST_END',
                'KPI_BELOW_TARGET',
                'KPI_MEASUREMENT_DUE'
              )
            )
          );
      `);
    return result.rowsAffected[0] === 1;
  },

  async markAllRead(owner: number, includeKpiWorkCycles = true): Promise<number> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("includeKpiWorkCycles", sql.Bit, includeKpiWorkCycles).query(`
        UPDATE dbo.TM_notifications
        SET read_at_utc=SYSUTCDATETIME()
        WHERE owner_user_id=@owner
          AND read_at_utc IS NULL
          AND (
            @includeKpiWorkCycles = 1
            OR (
              kpi_instance_id IS NULL
              AND notification_type NOT IN (
                'CURRENT_CYCLE_ENDING_SOON',
                'CURRENT_CYCLE_PAST_END',
                'KPI_BELOW_TARGET',
                'KPI_MEASUREMENT_DUE'
              )
            )
          );
      `);
    return result.rowsAffected[0] ?? 0;
  },
};





