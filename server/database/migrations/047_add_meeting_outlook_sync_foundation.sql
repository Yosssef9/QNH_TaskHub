
USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @lockResult INT;
    EXEC @lockResult = sys.sp_getapplock
        @Resource = N'TaskHub:Migration:047',
        @LockMode = 'Exclusive',
        @LockOwner = 'Transaction',
        @LockTimeout = 10000;

    IF @lockResult < 0
        THROW 54701, 'Could not acquire the Outlook Calendar foundation migration lock.', 1;

    IF OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_revisions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.users', N'U') IS NULL
       OR COL_LENGTH(N'dbo.TM_meetings', N'cancelled_by_user_id') IS NULL
    BEGIN
        THROW 54702,
              'TaskHub migrations through 046 are required before Outlook Calendar synchronization.',
              1;
    END;

    IF OBJECT_ID(N'dbo.TM_meeting_outlook_sync_config', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_outlook_sync', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_outlook_sync_jobs', N'U') IS NOT NULL
    BEGIN
        THROW 54703,
              'Outlook Calendar synchronization foundation already exists. Migration 047 was not applied.',
              1;
    END;

    /* ============================================================
       1. Persisted integration activation/freshness state

       The environment flag remains the deployment kill switch.
       activated_at_utc intentionally starts NULL. Phase 2 will set it
       atomically on the first enabled worker run so old Meetings are
       not silently backfilled just because migration 047 was installed.
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_outlook_sync_config (
        id TINYINT NOT NULL
            CONSTRAINT PK_TM_meeting_outlook_sync_config PRIMARY KEY,
        is_enabled BIT NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_sync_config_enabled DEFAULT (1),
        activated_at_utc DATETIME2(3) NULL,
        last_worker_at_utc DATETIME2(3) NULL,
        last_poll_at_utc DATETIME2(3) NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_sync_config_created DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT CK_TM_meeting_outlook_sync_config_singleton CHECK (id = 1)
    );

    INSERT INTO dbo.TM_meeting_outlook_sync_config (id, is_enabled)
    VALUES (1, 1);

    /* ============================================================
       2. One authoritative Outlook mapping per TaskHub Meeting

       create_transaction_id is stable across retries of one Outlook
       event generation. Microsoft Graph event.transactionId can use it
       to reduce duplicate event creation after an uncertain POST result.

       event_generation/create_transaction_id are deliberately persisted
       separately from graph_event_id so a later approved RECREATE flow
       can generate a new transaction ID without losing historical state.
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_outlook_sync (
        meeting_id BIGINT NOT NULL,
        organizer_user_id INT NOT NULL,

        organizer_email_snapshot NVARCHAR(320) NULL,
        organizer_microsoft_user_id NVARCHAR(128) NULL,
        organizer_user_principal_name NVARCHAR(320) NULL,

        event_generation INT NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_sync_generation DEFAULT (1),
        create_transaction_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_sync_transaction DEFAULT (NEWID()),

        graph_event_id NVARCHAR(1024) NULL,
        graph_change_key NVARCHAR(512) NULL,
        graph_ical_uid NVARCHAR(512) NULL,
        graph_web_link NVARCHAR(2048) NULL,

        desired_revision_id BIGINT NULL,
        synced_revision_id BIGINT NULL,

        sync_status VARCHAR(30) NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_sync_status DEFAULT ('NOT_SYNCED'),

        missing_email_participant_count INT NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_sync_missing_email DEFAULT (0),

        last_synced_projection_json NVARCHAR(MAX) NULL,
        last_synced_projection_hash CHAR(64) NULL,
        last_observed_projection_json NVARCHAR(MAX) NULL,
        last_observed_projection_hash CHAR(64) NULL,

        outlook_last_modified_at_utc DATETIME2(3) NULL,
        external_change_detected_at_utc DATETIME2(3) NULL,
        outlook_deleted_at_utc DATETIME2(3) NULL,

        last_attempt_at_utc DATETIME2(3) NULL,
        last_synced_at_utc DATETIME2(3) NULL,
        last_checked_at_utc DATETIME2(3) NULL,

        last_error_code VARCHAR(120) NULL,
        last_error_message NVARCHAR(1000) NULL,

        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_sync_created DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_outlook_sync
            PRIMARY KEY CLUSTERED (meeting_id),

        CONSTRAINT FK_TM_meeting_outlook_sync_meeting
            FOREIGN KEY (meeting_id)
            REFERENCES dbo.TM_meetings (id),

        CONSTRAINT FK_TM_meeting_outlook_sync_organizer
            FOREIGN KEY (organizer_user_id)
            REFERENCES dbo.users (USER_ID),

        CONSTRAINT FK_TM_meeting_outlook_sync_desired_revision
            FOREIGN KEY (desired_revision_id, meeting_id)
            REFERENCES dbo.TM_meeting_revisions (id, meeting_id),

        CONSTRAINT FK_TM_meeting_outlook_sync_synced_revision
            FOREIGN KEY (synced_revision_id, meeting_id)
            REFERENCES dbo.TM_meeting_revisions (id, meeting_id),

        CONSTRAINT CK_TM_meeting_outlook_sync_generation
            CHECK (event_generation > 0),

        CONSTRAINT CK_TM_meeting_outlook_sync_status
            CHECK (
                sync_status IN (
                    'NOT_SYNCED',
                    'SYNCING',
                    'IN_SYNC',
                    'SYNCED_WITH_WARNINGS',
                    'OUTLOOK_CHANGED',
                    'OUTLOOK_DELETED',
                    'SYNC_FAILED'
                )
            ),

        CONSTRAINT CK_TM_meeting_outlook_sync_missing_email
            CHECK (missing_email_participant_count >= 0),

        CONSTRAINT CK_TM_meeting_outlook_sync_synced_event
            CHECK (
                sync_status NOT IN (
                    'IN_SYNC',
                    'SYNCED_WITH_WARNINGS',
                    'OUTLOOK_CHANGED',
                    'OUTLOOK_DELETED'
                )
                OR graph_event_id IS NOT NULL
            ),

        CONSTRAINT CK_TM_meeting_outlook_sync_synced_projection
            CHECK (
                (
                    last_synced_projection_json IS NULL
                    AND last_synced_projection_hash IS NULL
                )
                OR
                (
                    last_synced_projection_json IS NOT NULL
                    AND ISJSON(last_synced_projection_json) = 1
                    AND last_synced_projection_hash IS NOT NULL
                    AND LEN(last_synced_projection_hash) = 64
                    AND last_synced_projection_hash NOT LIKE '%[^0-9A-Fa-f]%'
                )
            ),

        CONSTRAINT CK_TM_meeting_outlook_sync_observed_projection
            CHECK (
                (
                    last_observed_projection_json IS NULL
                    AND last_observed_projection_hash IS NULL
                )
                OR
                (
                    last_observed_projection_json IS NOT NULL
                    AND ISJSON(last_observed_projection_json) = 1
                    AND last_observed_projection_hash IS NOT NULL
                    AND LEN(last_observed_projection_hash) = 64
                    AND last_observed_projection_hash NOT LIKE '%[^0-9A-Fa-f]%'
                )
            )
    );

    CREATE INDEX IX_TM_meeting_outlook_sync_status_checked
        ON dbo.TM_meeting_outlook_sync (
            sync_status,
            last_checked_at_utc,
            meeting_id
        )
        INCLUDE (
            organizer_user_id,
            desired_revision_id,
            synced_revision_id,
            missing_email_participant_count,
            last_synced_at_utc
        );

    CREATE INDEX IX_TM_meeting_outlook_sync_organizer
        ON dbo.TM_meeting_outlook_sync (
            organizer_user_id,
            sync_status,
            meeting_id
        )
        INCLUDE (
            organizer_email_snapshot,
            organizer_user_principal_name,
            last_synced_at_utc
        );

    /* ============================================================
       3. Durable asynchronous work queue/history

       Jobs persist only trusted identity/revision references. Meeting
       titles, attendee addresses, room names, Zoom URLs and other live
       content are rebuilt at processing time so retries do not send a
       stale snapshot.

       Lifecycle create/update/cancel operations use deterministic
       dedupe keys. Manual restore/recreate requests may use a unique
       request identifier in their dedupe key when Phase 3 is wired.
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_outlook_sync_jobs (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        meeting_id BIGINT NOT NULL,
        operation VARCHAR(20) NOT NULL,
        trigger_type VARCHAR(20) NOT NULL,
        target_revision_id BIGINT NULL,
        requested_by_user_id INT NULL,
        dedupe_key VARCHAR(250) NOT NULL,

        status VARCHAR(20) NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_jobs_status DEFAULT ('PENDING'),
        attempt_count SMALLINT NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_jobs_attempt DEFAULT (0),
        next_attempt_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_jobs_next_attempt DEFAULT (SYSUTCDATETIME()),

        locked_at_utc DATETIME2(3) NULL,
        locked_by VARCHAR(160) NULL,

        last_error_code VARCHAR(120) NULL,
        last_error_message NVARCHAR(1000) NULL,

        started_at_utc DATETIME2(3) NULL,
        completed_at_utc DATETIME2(3) NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_outlook_jobs_created DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_outlook_sync_jobs
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT UQ_TM_meeting_outlook_sync_jobs_dedupe
            UNIQUE (dedupe_key),

        CONSTRAINT FK_TM_meeting_outlook_jobs_meeting
            FOREIGN KEY (meeting_id)
            REFERENCES dbo.TM_meetings (id),

        CONSTRAINT FK_TM_meeting_outlook_jobs_revision
            FOREIGN KEY (target_revision_id, meeting_id)
            REFERENCES dbo.TM_meeting_revisions (id, meeting_id),

        CONSTRAINT FK_TM_meeting_outlook_jobs_requested_by
            FOREIGN KEY (requested_by_user_id)
            REFERENCES dbo.users (USER_ID),

        CONSTRAINT CK_TM_meeting_outlook_jobs_operation
            CHECK (
                operation IN (
                    'CREATE',
                    'UPDATE',
                    'CANCEL',
                    'RESTORE',
                    'RECREATE'
                )
            ),

        CONSTRAINT CK_TM_meeting_outlook_jobs_trigger
            CHECK (
                trigger_type IN (
                    'LIFECYCLE',
                    'MANUAL',
                    'RECOVERY'
                )
            ),

        CONSTRAINT CK_TM_meeting_outlook_jobs_status
            CHECK (
                status IN (
                    'PENDING',
                    'PROCESSING',
                    'SUCCEEDED',
                    'FAILED',
                    'CANCELED'
                )
            ),

        CONSTRAINT CK_TM_meeting_outlook_jobs_attempt
            CHECK (attempt_count >= 0),

        CONSTRAINT CK_TM_meeting_outlook_jobs_lock_state
            CHECK (
                (
                    status = 'PROCESSING'
                    AND locked_at_utc IS NOT NULL
                    AND locked_by IS NOT NULL
                )
                OR
                (
                    status <> 'PROCESSING'
                    AND locked_at_utc IS NULL
                    AND locked_by IS NULL
                )
            ),

        CONSTRAINT CK_TM_meeting_outlook_jobs_completion
            CHECK (
                (
                    status IN ('PENDING', 'PROCESSING')
                    AND completed_at_utc IS NULL
                )
                OR
                (
                    status IN ('SUCCEEDED', 'FAILED', 'CANCELED')
                    AND completed_at_utc IS NOT NULL
                )
            ),

        CONSTRAINT CK_TM_meeting_outlook_jobs_error
            CHECK (
                status <> 'FAILED'
                OR last_error_code IS NOT NULL
            )
    );

    CREATE INDEX IX_TM_meeting_outlook_jobs_worker
        ON dbo.TM_meeting_outlook_sync_jobs (
            status,
            next_attempt_at_utc,
            id
        )
        INCLUDE (
            meeting_id,
            operation,
            trigger_type,
            target_revision_id,
            attempt_count,
            locked_at_utc,
            locked_by
        );

    CREATE INDEX IX_TM_meeting_outlook_jobs_meeting_created
        ON dbo.TM_meeting_outlook_sync_jobs (
            meeting_id,
            created_at_utc DESC,
            id DESC
        )
        INCLUDE (
            operation,
            trigger_type,
            status,
            attempt_count,
            target_revision_id,
            completed_at_utc
        );

    COMMIT TRANSACTION;

    PRINT 'Outlook Calendar synchronization foundation migration 047 completed successfully.';
    PRINT 'The integration remains inactive until OUTLOOK_CALENDAR_SYNC_ENABLED=true and Phase 2 lifecycle dispatch is deployed.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
