USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_notifications',N'U') IS NULL
    OR OBJECT_ID(N'dbo.TM_email_preferences',N'U') IS NULL
    OR OBJECT_ID(N'dbo.TM_user_access',N'U') IS NULL
    THROW 56501,'Required TaskHub tables missing. Apply prior migrations first.',1;

  DECLARE @notificationsRule NVARCHAR(MAX), @preferencesRule NVARCHAR(MAX);
  SELECT @notificationsRule=definition FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.TM_notifications') AND name=N'CK_TM_notifications_type';
  SELECT @preferencesRule=definition FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.TM_email_preferences') AND name=N'CK_TM_email_preferences_event';
  IF @notificationsRule IS NULL OR @preferencesRule IS NULL
    THROW 56502,'Expected event constraints missing; do not overwrite schema blindly.',1;

  ALTER TABLE dbo.TM_notifications DROP CONSTRAINT CK_TM_notifications_type;
  EXEC(N'ALTER TABLE dbo.TM_notifications WITH CHECK ADD CONSTRAINT CK_TM_notifications_type CHECK ('
    + @notificationsRule + N' OR [notification_type] IN (''TASK_WORK_NOTE_ADDED'',''TASK_ATTACHMENT_ADDED''))');
  ALTER TABLE dbo.TM_email_preferences DROP CONSTRAINT CK_TM_email_preferences_event;
  EXEC(N'ALTER TABLE dbo.TM_email_preferences WITH CHECK ADD CONSTRAINT CK_TM_email_preferences_event CHECK ('
    + @preferencesRule + N' OR [event_type] IN (''TASK_WORK_NOTE_ADDED'',''TASK_ATTACHMENT_ADDED''))');

  -- New preferences are ON even for existing users. Never overwrite an explicit choice.
  INSERT dbo.TM_email_preferences(owner_user_id,event_type,is_enabled)
  SELECT access.portal_user_id, event.event_type, CAST(1 AS bit)
  FROM dbo.TM_user_access AS access
  CROSS JOIN (VALUES ('TASK_WORK_NOTE_ADDED'),('TASK_ATTACHMENT_ADDED')) AS event(event_type)
  WHERE NOT EXISTS (SELECT 1 FROM dbo.TM_email_preferences AS saved WITH (UPDLOCK,HOLDLOCK)
    WHERE saved.owner_user_id=access.portal_user_id AND saved.event_type=event.event_type);

  COMMIT TRANSACTION;
  PRINT 'Task work note and attachment email events enabled by default.';
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
