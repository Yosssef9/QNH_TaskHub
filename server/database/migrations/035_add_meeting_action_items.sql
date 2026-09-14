USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Prerequisites / duplicate protection
       ============================================================ */
    IF OBJECT_ID(N'dbo.TM_tasks', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_attachments', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_task_activity', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_attendees', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_agenda_items', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_notifications', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_access_permissions', N'U') IS NULL
    BEGIN
        THROW 53501,
              'TaskHub migrations through 034 are required before Meeting Action Items.',
              1;
    END;

    IF OBJECT_ID(N'dbo.TM_meeting_action_items', N'U') IS NOT NULL
       OR COL_LENGTH(N'dbo.TM_attachments', N'uploaded_by_user_id') IS NOT NULL
    BEGIN
        THROW 53502,
              'Meeting Action Item Phase 1 schema already exists. Migration was not applied.',
              1;
    END;

    /* ============================================================
       2. Meeting Action Item relationship

       TM_tasks remains the single task engine. This table only adds
       the Meeting source + executor relationship.
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_action_items (
        task_id BIGINT NOT NULL,
        meeting_id BIGINT NOT NULL,
        agenda_item_id BIGINT NULL,
        assignee_user_id INT NOT NULL,
        assigned_by_user_id INT NOT NULL,
        assigned_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_action_items_assigned_at DEFAULT (SYSUTCDATETIME()),
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_action_items
            PRIMARY KEY CLUSTERED (task_id),
        CONSTRAINT FK_TM_meeting_action_items_task
            FOREIGN KEY (task_id) REFERENCES dbo.TM_tasks (id),
        CONSTRAINT FK_TM_meeting_action_items_meeting
            FOREIGN KEY (meeting_id) REFERENCES dbo.TM_meetings (id),
        CONSTRAINT FK_TM_meeting_action_items_agenda
            FOREIGN KEY (agenda_item_id) REFERENCES dbo.TM_meeting_agenda_items (id),
        CONSTRAINT FK_TM_meeting_action_items_assignee
            FOREIGN KEY (assignee_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_meeting_action_items_assigned_by
            FOREIGN KEY (assigned_by_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_meeting_action_items_not_self_assigned
            CHECK (assignee_user_id <> assigned_by_user_id)
    );

    CREATE INDEX IX_TM_meeting_action_items_meeting_task
        ON dbo.TM_meeting_action_items (meeting_id, task_id)
        INCLUDE (agenda_item_id, assignee_user_id, assigned_by_user_id, assigned_at_utc);

    CREATE INDEX IX_TM_meeting_action_items_assignee_task
        ON dbo.TM_meeting_action_items (assignee_user_id, task_id)
        INCLUDE (meeting_id, agenda_item_id, assigned_by_user_id, assigned_at_utc);

    CREATE INDEX IX_TM_meeting_action_items_agenda_task
        ON dbo.TM_meeting_action_items (agenda_item_id, task_id)
        INCLUDE (meeting_id, assignee_user_id)
        WHERE agenda_item_id IS NOT NULL;

    /* ============================================================
       3. Task attachment real uploader

       Historical rows were owner-only, so owner_user_id is the
       correct backfill. New code must always write the real actor.
       ============================================================ */
    ALTER TABLE dbo.TM_attachments
        ADD uploaded_by_user_id INT NULL;

    /*
       SQL Server compiles a batch before execution. Because the column
       is added above in this same outer batch, statements that reference
       the new column are compiled dynamically after ALTER TABLE has run.
       This keeps the whole migration inside the existing TRY/transaction.
    */
    EXEC sys.sp_executesql N'
        UPDATE dbo.TM_attachments
        SET uploaded_by_user_id = owner_user_id
        WHERE uploaded_by_user_id IS NULL;

        IF EXISTS (
            SELECT 1
            FROM dbo.TM_attachments
            WHERE uploaded_by_user_id IS NULL
        )
        BEGIN
            THROW 53503,
                  ''Attachment uploader backfill did not complete.'',
                  1;
        END;

        ALTER TABLE dbo.TM_attachments
            ALTER COLUMN uploaded_by_user_id INT NOT NULL;

        ALTER TABLE dbo.TM_attachments
            ADD CONSTRAINT FK_TM_attachments_uploaded_by
                FOREIGN KEY (uploaded_by_user_id)
                REFERENCES dbo.TM_user_access (portal_user_id);

        CREATE INDEX IX_TM_attachments_uploader_active
            ON dbo.TM_attachments (uploaded_by_user_id, uploaded_at_utc DESC, id)
            INCLUDE (owner_user_id, task_id, subtask_id, original_file_name)
            WHERE deleted_at_utc IS NULL;
    ';

    /* ============================================================
       4. Task activity real actor

       Activity remains immutable. Authorization for a legitimate
       non-owner actor is enforced by the Task capability policy.
       ============================================================ */
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_task_activity')
          AND name = N'CK_TM_task_activity_private_actor'
    )
    BEGIN
        ALTER TABLE dbo.TM_task_activity
            DROP CONSTRAINT CK_TM_task_activity_private_actor;
    END;

    /* ============================================================
       5. In-app Action Item notification types

       Email is intentionally outside Phase 1. Application inserts
       these rows with email_processed_at_utc already populated.
       ============================================================ */
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_notifications')
          AND name = N'CK_TM_notifications_type'
    )
    BEGIN
        ALTER TABLE dbo.TM_notifications
            DROP CONSTRAINT CK_TM_notifications_type;
    END;

    ALTER TABLE dbo.TM_notifications
        ADD CONSTRAINT CK_TM_notifications_type CHECK (
            notification_type IN (
                'TASK_OVERDUE',
                'TASK_DUE_TODAY',
                'HIGH_PRIORITY_TASK_DUE_TOMORROW',
                'CURRENT_CYCLE_ENDING_SOON',
                'CURRENT_CYCLE_PAST_END',
                'KPI_BELOW_TARGET',
                'KPI_MEASUREMENT_DUE',
                'CONTRACT_EXPIRATION_REMINDER',
                'CONTRACT_NOTICE_DEADLINE_REMINDER',
                'MEETING_REQUEST_SUBMITTED',
                'MEETING_REQUEST_UPDATED',
                'MEETING_APPROVED',
                'MEETING_REJECTED',
                'MEETING_INVITED',
                'MEETING_RESCHEDULED',
                'MEETING_RESCHEDULE_REQUEST_CANCELLED',
                'MEETING_CANCELLED',
                'MEETING_START_REMINDER',
                'MEETING_ACTION_ITEM_ASSIGNED',
                'MEETING_ACTION_ITEM_COMPLETED'
            )
        );

    COMMIT TRANSACTION;
    PRINT 'Meeting Action Items Phase 1 migration 035 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
