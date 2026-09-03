USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_revisions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_attendees', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_user_permissions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_notifications', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_email_preferences', N'U') IS NULL
       OR COL_LENGTH(N'dbo.TM_notifications', N'email_processed_at_utc') IS NULL
       OR COL_LENGTH(N'dbo.TM_user_settings', N'email_notifications_enabled') IS NULL
    BEGIN
        THROW 52001, 'TaskHub Meetings Phase 1-4 and notification/email migrations must be applied first.', 1;
    END;

    IF COL_LENGTH(N'dbo.TM_notifications', N'meeting_id') IS NOT NULL
       OR COL_LENGTH(N'dbo.TM_user_settings', N'meeting_start_reminder_enabled') IS NOT NULL
    BEGIN
        THROW 52002, 'Meeting notification schema already exists. Migration was not applied.', 1;
    END;

    ALTER TABLE dbo.TM_notifications
        ADD meeting_id BIGINT NULL,
            meeting_revision_id BIGINT NULL;

    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_notifications
            ADD CONSTRAINT FK_TM_notifications_meeting
                FOREIGN KEY (meeting_id) REFERENCES dbo.TM_meetings (id),
                CONSTRAINT FK_TM_notifications_meeting_revision
                FOREIGN KEY (meeting_revision_id, meeting_id)
                REFERENCES dbo.TM_meeting_revisions (id, meeting_id);
    ';

    ALTER TABLE dbo.TM_user_settings
        ADD meeting_start_reminder_enabled BIT NOT NULL
            CONSTRAINT DF_TM_user_settings_meeting_start_reminder DEFAULT (1);

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_notifications')
          AND name = N'CK_TM_notifications_type'
    )
    BEGIN
        ALTER TABLE dbo.TM_notifications DROP CONSTRAINT CK_TM_notifications_type;
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
                'MEETING_APPROVED',
                'MEETING_REJECTED',
                'MEETING_INVITED',
                'MEETING_RESCHEDULED',
                'MEETING_CANCELLED',
                'MEETING_START_REMINDER'
            )
        );

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_email_preferences')
          AND name = N'CK_TM_email_preferences_event'
    )
    BEGIN
        ALTER TABLE dbo.TM_email_preferences DROP CONSTRAINT CK_TM_email_preferences_event;
    END;

    ALTER TABLE dbo.TM_email_preferences
        ADD CONSTRAINT CK_TM_email_preferences_event CHECK (
            event_type IN (
                'TASK_OVERDUE',
                'TASK_DUE_TODAY',
                'HIGH_PRIORITY_TASK_DUE_TOMORROW',
                'CURRENT_CYCLE_ENDING_SOON',
                'CURRENT_CYCLE_PAST_END',
                'KPI_BELOW_TARGET',
                'KPI_MEASUREMENT_DUE',
                'MEETING_REQUEST_SUBMITTED',
                'MEETING_APPROVED',
                'MEETING_REJECTED',
                'MEETING_INVITED',
                'MEETING_RESCHEDULED',
                'MEETING_CANCELLED'
            )
        );

    INSERT dbo.TM_email_preferences (owner_user_id, event_type, is_enabled)
    SELECT access.portal_user_id, event.event_type, CAST(1 AS BIT)
    FROM dbo.TM_user_access AS access
    CROSS JOIN (VALUES
        ('MEETING_REQUEST_SUBMITTED'),
        ('MEETING_APPROVED'),
        ('MEETING_REJECTED'),
        ('MEETING_INVITED'),
        ('MEETING_RESCHEDULED'),
        ('MEETING_CANCELLED')
    ) AS event(event_type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.TM_email_preferences AS preference
        WHERE preference.owner_user_id = access.portal_user_id
          AND preference.event_type = event.event_type
    );

    EXEC sys.sp_executesql N'
        CREATE INDEX IX_TM_notifications_owner_meeting_created
            ON dbo.TM_notifications (
                owner_user_id,
                meeting_id,
                created_at_utc DESC,
                id DESC
            )
            INCLUDE (
                meeting_revision_id,
                notification_type,
                dedupe_key,
                read_at_utc,
                email_processed_at_utc
            )
            WHERE meeting_id IS NOT NULL;
    ';

    COMMIT TRANSACTION;

    PRINT 'Meetings Phase 6 notification/email/reminder migration completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
