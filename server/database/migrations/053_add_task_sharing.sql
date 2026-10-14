USE [QNHDB];
GO
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'dbo.TM_tasks',N'U') IS NULL OR OBJECT_ID(N'dbo.TM_user_access',N'U') IS NULL
   OR OBJECT_ID(N'dbo.TM_meeting_action_items',N'U') IS NULL OR OBJECT_ID(N'dbo.TM_meeting_attendees',N'U') IS NULL
   OR OBJECT_ID(N'dbo.TM_task_tags',N'U') IS NULL OR OBJECT_ID(N'dbo.TM_tags',N'U') IS NULL
   OR OBJECT_ID(N'dbo.TM_notifications',N'U') IS NULL OR OBJECT_ID(N'dbo.TM_email_preferences',N'U') IS NULL
   THROW 55301,'TaskHub core tables are required.',1;
 IF OBJECT_ID(N'dbo.TM_task_shares',N'U') IS NOT NULL
   THROW 55302,'Task Sharing migration has already been applied.',1;
 CREATE TABLE dbo.TM_task_shares (
   task_id BIGINT NOT NULL,
   recipient_user_id INT NOT NULL,
   permission_code VARCHAR(8) NOT NULL,
   shared_by_user_id INT NOT NULL,
   created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_task_shares_created DEFAULT SYSUTCDATETIME(),
   updated_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_task_shares_updated DEFAULT SYSUTCDATETIME(),
   revoked_at_utc DATETIME2(3) NULL,
   revoked_by_user_id INT NULL,
   CONSTRAINT PK_TM_task_shares PRIMARY KEY(task_id,recipient_user_id),
   CONSTRAINT FK_TM_task_shares_task FOREIGN KEY(task_id) REFERENCES dbo.TM_tasks(id),
   CONSTRAINT FK_TM_task_shares_recipient FOREIGN KEY(recipient_user_id) REFERENCES dbo.TM_user_access(portal_user_id),
   CONSTRAINT FK_TM_task_shares_sharer FOREIGN KEY(shared_by_user_id) REFERENCES dbo.TM_user_access(portal_user_id),
   CONSTRAINT FK_TM_task_shares_revoker FOREIGN KEY(revoked_by_user_id) REFERENCES dbo.TM_user_access(portal_user_id),
   CONSTRAINT CK_TM_task_shares_permission CHECK(permission_code IN('VIEW','EDIT')),
   CONSTRAINT CK_TM_task_shares_revoke CHECK ((revoked_at_utc IS NULL AND revoked_by_user_id IS NULL) OR (revoked_at_utc IS NOT NULL AND revoked_by_user_id IS NOT NULL))
 );
 CREATE INDEX IX_TM_task_shares_recipient_active ON dbo.TM_task_shares(recipient_user_id,revoked_at_utc,updated_at_utc DESC) INCLUDE(task_id,permission_code);
 CREATE INDEX IX_TM_task_shares_task_active ON dbo.TM_task_shares(task_id,revoked_at_utc) INCLUDE(recipient_user_id,permission_code);
 IF EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TM_notifications') AND name=N'CK_TM_notifications_type')
   ALTER TABLE dbo.TM_notifications DROP CONSTRAINT CK_TM_notifications_type;
 ALTER TABLE dbo.TM_notifications WITH CHECK ADD CONSTRAINT CK_TM_notifications_type CHECK(notification_type IN(
  'TASK_OVERDUE','TASK_DUE_TODAY','HIGH_PRIORITY_TASK_DUE_TOMORROW','CURRENT_CYCLE_ENDING_SOON','CURRENT_CYCLE_PAST_END',
  'KPI_BELOW_TARGET','KPI_MEASUREMENT_DUE','CONTRACT_EXPIRATION_REMINDER','CONTRACT_NOTICE_DEADLINE_REMINDER',
  'MEETING_REQUEST_SUBMITTED','MEETING_REQUEST_UPDATED','MEETING_APPROVED','MEETING_REJECTED','MEETING_INVITED',
  'MEETING_RESCHEDULED','MEETING_RESCHEDULE_REQUEST_CANCELLED','MEETING_CANCELLED','MEETING_SERIES_SCHEDULED','MEETING_START_REMINDER',
  'MEETING_ACTION_ITEM_ASSIGNED','MEETING_ACTION_ITEM_COMPLETED','GENERAL_TASK_ASSIGNED','GENERAL_SUBTASK_ASSIGNED',
  'GENERAL_TASK_COMPLETED','GENERAL_ASSIGNMENT_REMOVED','GENERAL_TASK_DUE_CHANGED','GENERAL_SUBTASK_DUE_CHANGED',
  'GENERAL_TASK_REOPENED','GENERAL_SUBTASK_COMPLETED','TASK_SHARED','TASK_SHARE_UPDATED','TASK_SHARE_REVOKED'
 ));
 IF EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TM_email_preferences') AND name=N'CK_TM_email_preferences_event')
   ALTER TABLE dbo.TM_email_preferences DROP CONSTRAINT CK_TM_email_preferences_event;
 ALTER TABLE dbo.TM_email_preferences WITH CHECK ADD CONSTRAINT CK_TM_email_preferences_event CHECK(event_type IN(
  'TASK_OVERDUE','TASK_DUE_TODAY','HIGH_PRIORITY_TASK_DUE_TOMORROW','CURRENT_CYCLE_ENDING_SOON','CURRENT_CYCLE_PAST_END',
  'KPI_BELOW_TARGET','KPI_MEASUREMENT_DUE','MEETING_REQUEST_SUBMITTED','MEETING_REQUEST_UPDATED','MEETING_APPROVED','MEETING_REJECTED',
  'MEETING_INVITED','MEETING_RESCHEDULED','MEETING_RESCHEDULE_REQUEST_CANCELLED','MEETING_CANCELLED','MEETING_SERIES_SCHEDULED',
  'MEETING_ACTION_ITEM_ASSIGNED','MEETING_ACTION_ITEM_COMPLETED','MEETING_REPORT_AVAILABLE','GENERAL_TASK_ASSIGNED','GENERAL_SUBTASK_ASSIGNED',
  'GENERAL_ASSIGNMENT_REMOVED','GENERAL_TASK_DUE_CHANGED','GENERAL_SUBTASK_DUE_CHANGED','GENERAL_TASK_COMPLETED','GENERAL_TASK_REOPENED',
  'TASK_SHARED','TASK_SHARE_UPDATED','TASK_SHARE_REVOKED'
 ));
 INSERT dbo.TM_email_preferences(owner_user_id,event_type,is_enabled)
 SELECT a.portal_user_id,e.event_type,CAST(1 AS BIT) FROM dbo.TM_user_access a
 CROSS JOIN (VALUES('TASK_SHARED'),('TASK_SHARE_UPDATED'),('TASK_SHARE_REVOKED')) e(event_type)
 WHERE NOT EXISTS(SELECT 1 FROM dbo.TM_email_preferences p WHERE p.owner_user_id=a.portal_user_id AND p.event_type=e.event_type);
 COMMIT TRANSACTION;
 PRINT 'Task Sharing migration 053 completed.';
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
GO
