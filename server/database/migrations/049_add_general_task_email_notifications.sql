USE [QNHDB];
GO
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_general_task_assignments',N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_notifications',N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_email_preferences',N'U') IS NULL
     OR COL_LENGTH(N'dbo.TM_subtasks',N'assignee_user_id') IS NULL
    THROW 54901, 'Migration 048 and the email system must exist first.', 1;
  IF COL_LENGTH(N'dbo.TM_notifications',N'subtask_id') IS NOT NULL
     OR COL_LENGTH(N'dbo.TM_subtasks',N'assignment_changed_at_utc') IS NOT NULL
    THROW 54902, 'Migration 049 already installed; no changes made.', 1;

  ALTER TABLE dbo.TM_notifications ADD subtask_id BIGINT NULL;
  ALTER TABLE dbo.TM_subtasks ADD assignment_changed_at_utc DATETIME2(3) NULL;
  EXEC sys.sp_executesql N'
    ALTER TABLE dbo.TM_notifications WITH CHECK ADD CONSTRAINT FK_TM_notifications_general_subtask
      FOREIGN KEY(subtask_id) REFERENCES dbo.TM_subtasks(id);';
  EXEC sys.sp_executesql N'
    CREATE INDEX IX_TM_notifications_general_subtask
      ON dbo.TM_notifications(subtask_id,created_at_utc DESC)
      WHERE subtask_id IS NOT NULL;';

  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.TM_notifications') AND name=N'CK_TM_notifications_type')
    THROW 54903, 'Expected notification type constraint is missing.', 1;
  ALTER TABLE dbo.TM_notifications DROP CONSTRAINT CK_TM_notifications_type;
  ALTER TABLE dbo.TM_notifications WITH CHECK ADD CONSTRAINT CK_TM_notifications_type
    CHECK (notification_type IN (
            'TASK_OVERDUE', 'TASK_DUE_TODAY', 'HIGH_PRIORITY_TASK_DUE_TOMORROW', 'CURRENT_CYCLE_ENDING_SOON', 'CURRENT_CYCLE_PAST_END',
            'KPI_BELOW_TARGET', 'KPI_MEASUREMENT_DUE', 'CONTRACT_EXPIRATION_REMINDER', 'CONTRACT_NOTICE_DEADLINE_REMINDER', 'MEETING_REQUEST_SUBMITTED',
            'MEETING_REQUEST_UPDATED', 'MEETING_APPROVED', 'MEETING_REJECTED', 'MEETING_INVITED', 'MEETING_RESCHEDULED',
            'MEETING_RESCHEDULE_REQUEST_CANCELLED', 'MEETING_CANCELLED', 'MEETING_SERIES_SCHEDULED', 'MEETING_START_REMINDER', 'MEETING_ACTION_ITEM_ASSIGNED',
            'MEETING_ACTION_ITEM_COMPLETED', 'GENERAL_TASK_ASSIGNED', 'GENERAL_SUBTASK_ASSIGNED', 'GENERAL_TASK_COMPLETED', 'GENERAL_ASSIGNMENT_REMOVED',
            'GENERAL_TASK_DUE_CHANGED', 'GENERAL_SUBTASK_DUE_CHANGED', 'GENERAL_TASK_REOPENED', 'GENERAL_SUBTASK_COMPLETED'
    ));
  ALTER TABLE dbo.TM_notifications WITH CHECK CHECK CONSTRAINT CK_TM_notifications_type;

  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.TM_email_preferences') AND name=N'CK_TM_email_preferences_event')
    THROW 54904, 'Expected email preference constraint is missing.', 1;
  ALTER TABLE dbo.TM_email_preferences DROP CONSTRAINT CK_TM_email_preferences_event;
  ALTER TABLE dbo.TM_email_preferences WITH CHECK ADD CONSTRAINT CK_TM_email_preferences_event
    CHECK(event_type IN (
            'TASK_OVERDUE', 'TASK_DUE_TODAY', 'HIGH_PRIORITY_TASK_DUE_TOMORROW', 'CURRENT_CYCLE_ENDING_SOON', 'CURRENT_CYCLE_PAST_END',
            'KPI_BELOW_TARGET', 'KPI_MEASUREMENT_DUE', 'MEETING_REQUEST_SUBMITTED', 'MEETING_REQUEST_UPDATED', 'MEETING_APPROVED',
            'MEETING_REJECTED', 'MEETING_INVITED', 'MEETING_RESCHEDULED', 'MEETING_RESCHEDULE_REQUEST_CANCELLED', 'MEETING_CANCELLED',
            'MEETING_SERIES_SCHEDULED', 'MEETING_ACTION_ITEM_ASSIGNED', 'MEETING_ACTION_ITEM_COMPLETED', 'MEETING_REPORT_AVAILABLE', 'GENERAL_TASK_ASSIGNED',
            'GENERAL_SUBTASK_ASSIGNED', 'GENERAL_ASSIGNMENT_REMOVED', 'GENERAL_TASK_DUE_CHANGED', 'GENERAL_SUBTASK_DUE_CHANGED', 'GENERAL_TASK_COMPLETED',
            'GENERAL_TASK_REOPENED'
    ));
  ALTER TABLE dbo.TM_email_preferences WITH CHECK CHECK CONSTRAINT CK_TM_email_preferences_event;

  -- Add new preferences without changing any existing user decisions.
  INSERT dbo.TM_email_preferences(owner_user_id,event_type,is_enabled)
  SELECT access.portal_user_id, defaults.event_type,CAST(1 AS BIT)
  FROM dbo.TM_user_access AS access
  JOIN dbo.users AS portal ON portal.USER_ID=access.portal_user_id AND portal.IS_ACTIVE=1
  CROSS JOIN (VALUES ('GENERAL_TASK_ASSIGNED'),('GENERAL_SUBTASK_ASSIGNED'),('GENERAL_ASSIGNMENT_REMOVED'),('GENERAL_TASK_DUE_CHANGED'),('GENERAL_SUBTASK_DUE_CHANGED'),('GENERAL_TASK_COMPLETED'),('GENERAL_TASK_REOPENED')) AS defaults(event_type)
  WHERE access.is_active=1
    AND NOT EXISTS (SELECT 1 FROM dbo.TM_email_preferences pref WITH(UPDLOCK,HOLDLOCK)
      WHERE pref.owner_user_id=access.portal_user_id AND pref.event_type=defaults.event_type);

  -- Historical General Task notifications were in-app only and retain their existing
  -- email_processed_at_utc values; no catch-up mailing or historical email flood.
  COMMIT TRANSACTION;
  PRINT 'Migration 049 complete: General Task email notifications enabled.';
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
