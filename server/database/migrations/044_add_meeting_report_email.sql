USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @lockResult INT;
    EXEC @lockResult = sys.sp_getapplock
        @Resource = N'TaskHub:Migration:044', @LockMode = 'Exclusive',
        @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @lockResult < 0
        THROW 54401, 'Could not acquire the Meeting report migration lock.', 1;

    IF OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_revisions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_email_outbox', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_email_preferences', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_settings', N'U') IS NULL
       OR COL_LENGTH(N'dbo.TM_meeting_attendees', N'attendance_status') IS NULL
    BEGIN
        THROW 54402, 'TaskHub migrations through 043 are required before migration 044.', 1;
    END;

    /* Email-only preference; there is no new in-app NotificationType. */
    IF EXISTS (SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_email_preferences')
          AND name = N'CK_TM_email_preferences_event')
        ALTER TABLE dbo.TM_email_preferences DROP CONSTRAINT CK_TM_email_preferences_event;

    ALTER TABLE dbo.TM_email_preferences WITH CHECK
        ADD CONSTRAINT CK_TM_email_preferences_event CHECK (event_type IN (
            'TASK_OVERDUE', 'TASK_DUE_TODAY', 'HIGH_PRIORITY_TASK_DUE_TOMORROW',
            'CURRENT_CYCLE_ENDING_SOON', 'CURRENT_CYCLE_PAST_END',
            'KPI_BELOW_TARGET', 'KPI_MEASUREMENT_DUE',
            'MEETING_REQUEST_SUBMITTED', 'MEETING_REQUEST_UPDATED',
            'MEETING_APPROVED', 'MEETING_REJECTED', 'MEETING_INVITED',
            'MEETING_RESCHEDULED', 'MEETING_RESCHEDULE_REQUEST_CANCELLED',
            'MEETING_CANCELLED', 'MEETING_SERIES_SCHEDULED',
            'MEETING_ACTION_ITEM_ASSIGNED', 'MEETING_ACTION_ITEM_COMPLETED',
            'MEETING_REPORT_AVAILABLE'
        ));
    ALTER TABLE dbo.TM_email_preferences WITH CHECK CHECK CONSTRAINT CK_TM_email_preferences_event;

    INSERT dbo.TM_email_preferences (owner_user_id, event_type, is_enabled)
    SELECT access.portal_user_id, 'MEETING_REPORT_AVAILABLE', CAST(1 AS BIT)
    FROM dbo.TM_user_access AS access
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.TM_email_preferences WITH (UPDLOCK, HOLDLOCK)
        WHERE owner_user_id = access.portal_user_id AND event_type = 'MEETING_REPORT_AVAILABLE'
    );
    /* Do not change any existing preference, destination, or master email switch. */

    /* Persist an unresolved report intent BEFORE generating its PDF. This permits real
       FAILED/CANCELED evidence even when the user has no valid email. Never store a
       fabricated address. Other templates and every SENT message still require an address. */
    IF EXISTS (SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_email_outbox')
          AND name = N'CK_TM_email_outbox_recipient')
        ALTER TABLE dbo.TM_email_outbox DROP CONSTRAINT CK_TM_email_outbox_recipient;

    IF EXISTS (SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.TM_email_outbox')
          AND name = N'recipient_email' AND is_nullable = 0)
        EXEC sys.sp_executesql N'ALTER TABLE dbo.TM_email_outbox ALTER COLUMN recipient_email NVARCHAR(320) NULL;';

    ALTER TABLE dbo.TM_email_outbox WITH CHECK
        ADD CONSTRAINT CK_TM_email_outbox_recipient CHECK (
            (recipient_email IS NOT NULL AND LEN(LTRIM(RTRIM(recipient_email))) > 3)
            OR
            (recipient_email IS NULL AND template_key = 'MEETING_REPORT_AVAILABLE'
                AND status IN ('PENDING', 'PROCESSING', 'CANCELED', 'FAILED'))
        );
    ALTER TABLE dbo.TM_email_outbox WITH CHECK CHECK CONSTRAINT CK_TM_email_outbox_recipient;

    /* A singleton activation setting, NOT another queue or PDF store.
       Separate compilation avoids the add-column/create-table batch issue in migration 043. */
    IF OBJECT_ID(N'dbo.TM_meeting_report_delivery_config', N'U') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            CREATE TABLE dbo.TM_meeting_report_delivery_config (
                id TINYINT NOT NULL CONSTRAINT PK_TM_meeting_report_delivery_config PRIMARY KEY,
                is_enabled BIT NOT NULL CONSTRAINT DF_TM_meeting_report_delivery_enabled DEFAULT (1),
                activated_at_utc DATETIME2(3) NOT NULL,
                last_scan_at_utc DATETIME2(3) NULL,
                CONSTRAINT CK_TM_meeting_report_delivery_singleton CHECK (id = 1)
            );
        ';
    END;
    EXEC sys.sp_executesql N'
        IF NOT EXISTS (SELECT 1 FROM dbo.TM_meeting_report_delivery_config WITH (UPDLOCK, HOLDLOCK) WHERE id = 1)
            INSERT dbo.TM_meeting_report_delivery_config (id, is_enabled, activated_at_utc)
            VALUES (1, 1, SYSUTCDATETIME());
    ';
    /* Rerunning this migration MUST NOT reset the cutoff or re-enable a paused sender. */

    IF NOT EXISTS (SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.TM_meeting_revisions')
          AND name = N'IX_TM_meeting_revisions_report_due')
    BEGIN
        CREATE INDEX IX_TM_meeting_revisions_report_due
            ON dbo.TM_meeting_revisions (end_at_utc, meeting_id, id)
            INCLUDE (start_at_utc)
            WHERE revision_status = 'APPROVED';
    END;

    COMMIT TRANSACTION;
    PRINT 'Meeting report email migration 044 completed. Existing ended Meetings before the activation cutoff will not be mailed.';
    EXEC sys.sp_executesql N'SELECT activated_at_utc, is_enabled FROM dbo.TM_meeting_report_delivery_config WHERE id = 1;';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
