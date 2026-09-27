USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Validate migrations through 041
       ============================================================ */
    IF OBJECT_ID(N'dbo.TM_email_preferences', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_notifications', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.users', N'U') IS NULL
       OR COL_LENGTH(N'dbo.TM_notifications', N'meeting_series_id') IS NULL
    BEGIN
        THROW 54201,
              'TaskHub migrations through 041 are required before Meeting Action Item email preferences.',
              1;
    END;

    /* ============================================================
       2. Extend the operational-email preference constraint

       Migration 035 introduced Action Item notification types.
       Runtime email support was added later, but migration 041 still
       omitted the two Action Item events from TM_email_preferences.
       Keep the existing preference model and add only those events.
       ============================================================ */
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_email_preferences')
          AND name = N'CK_TM_email_preferences_event'
    )
    BEGIN
        ALTER TABLE dbo.TM_email_preferences
            DROP CONSTRAINT CK_TM_email_preferences_event;
    END;

    ALTER TABLE dbo.TM_email_preferences WITH CHECK
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
                'MEETING_CANCELLED',
                'MEETING_SERIES_SCHEDULED',
                'MEETING_ACTION_ITEM_ASSIGNED',
                'MEETING_ACTION_ITEM_COMPLETED'
            )
        );

    ALTER TABLE dbo.TM_email_preferences
        CHECK CONSTRAINT CK_TM_email_preferences_event;

    /* ============================================================
       3. Seed the new preferences for existing active users

       Runtime defaults already enable both events. Seeding here keeps
       existing installations aligned immediately after the migration.
       ============================================================ */
    INSERT dbo.TM_email_preferences (
        owner_user_id,
        event_type,
        is_enabled
    )
    SELECT
        access.portal_user_id,
        event.event_type,
        CAST(1 AS BIT)
    FROM dbo.TM_user_access AS access
    INNER JOIN dbo.users AS portal
        ON portal.USER_ID = access.portal_user_id
       AND portal.IS_ACTIVE = 1
    CROSS JOIN (VALUES
        ('MEETING_ACTION_ITEM_ASSIGNED'),
        ('MEETING_ACTION_ITEM_COMPLETED')
    ) AS event(event_type)
    WHERE access.is_active = 1
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.TM_email_preferences AS preference
          WHERE preference.owner_user_id = access.portal_user_id
            AND preference.event_type = event.event_type
      );

    COMMIT TRANSACTION;

    PRINT 'Meeting Action Item email preference migration 042 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
