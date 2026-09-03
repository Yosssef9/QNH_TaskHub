USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_notifications', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_email_preferences', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_revisions', N'U') IS NULL
    BEGIN
        THROW 50022, 'Meeting notification prerequisites are missing. Apply migrations through 021 first.', 1;
    END;

    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
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
                'MEETING_REQUEST_UPDATED',
                'MEETING_APPROVED',
                'MEETING_REJECTED',
                'MEETING_INVITED',
                'MEETING_RESCHEDULED',
                'MEETING_RESCHEDULE_REQUEST_CANCELLED',
                'MEETING_CANCELLED',
                'MEETING_START_REMINDER'
            )
        );

    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
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
                'MEETING_REQUEST_UPDATED',
                'MEETING_APPROVED',
                'MEETING_REJECTED',
                'MEETING_INVITED',
                'MEETING_RESCHEDULED',
                'MEETING_RESCHEDULE_REQUEST_CANCELLED',
                'MEETING_CANCELLED'
            )
        );

    INSERT dbo.TM_email_preferences (owner_user_id, event_type, is_enabled)
    SELECT access.portal_user_id, event.event_type, CAST(1 AS BIT)
    FROM dbo.TM_user_access AS access
    CROSS JOIN (VALUES
        ('MEETING_REQUEST_UPDATED'),
        ('MEETING_RESCHEDULE_REQUEST_CANCELLED')
    ) AS event(event_type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.TM_email_preferences AS preference
        WHERE preference.owner_user_id = access.portal_user_id
          AND preference.event_type = event.event_type
    );

    COMMIT TRANSACTION;
    PRINT 'Meeting reschedule authority/notification migration completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
