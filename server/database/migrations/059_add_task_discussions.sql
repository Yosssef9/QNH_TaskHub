USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
/* Task Discussions — additive, non-destructive. Run manually after migration 058. */
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_tasks',N'U') IS NULL OR OBJECT_ID(N'dbo.TM_subtasks',N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_user_access',N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_collaboration_assignments',N'U') IS NULL
    THROW 55901, 'TaskHub migration 058 and earlier foundations are required.', 1;
  IF OBJECT_ID(N'dbo.TM_task_discussion_messages',N'U') IS NOT NULL
    THROW 55902, 'Task discussion schema already exists; nothing was changed.', 1;

  CREATE TABLE dbo.TM_task_discussion_messages (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_task_discussion_messages PRIMARY KEY,
    task_id BIGINT NOT NULL,
    subtask_id BIGINT NULL,
    author_user_id INT NOT NULL,
    body NVARCHAR(4000) NOT NULL,
    reply_to_message_id BIGINT NULL,
    client_request_id UNIQUEIDENTIFIER NOT NULL,
    created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_discussions_created DEFAULT SYSUTCDATETIME(),
    edited_at_utc DATETIME2(3) NULL,
    deleted_at_utc DATETIME2(3) NULL,
    row_version ROWVERSION NOT NULL,
    CONSTRAINT FK_TM_discussions_task FOREIGN KEY(task_id) REFERENCES dbo.TM_tasks(id),
    CONSTRAINT FK_TM_discussions_subtask FOREIGN KEY(subtask_id,task_id) REFERENCES dbo.TM_subtasks(id,task_id),
    CONSTRAINT FK_TM_discussions_author FOREIGN KEY(author_user_id) REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT FK_TM_discussions_reply FOREIGN KEY(reply_to_message_id) REFERENCES dbo.TM_task_discussion_messages(id),
    CONSTRAINT CK_TM_discussions_body CHECK(LEN(LTRIM(RTRIM(body))) > 0),
    CONSTRAINT UQ_TM_discussions_request UNIQUE(author_user_id,client_request_id)
  );
  CREATE INDEX IX_TM_discussions_scope ON dbo.TM_task_discussion_messages(task_id,subtask_id,id DESC)
    INCLUDE(author_user_id,created_at_utc,edited_at_utc,deleted_at_utc);

  /* Preserve prior message versions for audit without exposing them to ordinary participants. */
  CREATE TABLE dbo.TM_task_discussion_message_revisions (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_discussion_revisions PRIMARY KEY,
    message_id BIGINT NOT NULL,
    actor_user_id INT NOT NULL,
    previous_body NVARCHAR(4000) NOT NULL,
    revision_kind VARCHAR(10) NOT NULL,
    created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_discussion_revision_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_TM_discussion_revision_message FOREIGN KEY(message_id) REFERENCES dbo.TM_task_discussion_messages(id),
    CONSTRAINT FK_TM_discussion_revision_actor FOREIGN KEY(actor_user_id) REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT CK_TM_discussion_revision_kind CHECK (revision_kind IN ('EDIT','DELETE'))
  );
  CREATE INDEX IX_TM_discussion_revisions_message ON dbo.TM_task_discussion_message_revisions(message_id,id DESC);

  CREATE TABLE dbo.TM_task_discussion_read_state (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_discussion_read_state PRIMARY KEY,
    task_id BIGINT NOT NULL,
    subtask_id BIGINT NULL,
    user_id INT NOT NULL,
    last_read_message_id BIGINT NOT NULL CONSTRAINT DF_TM_discussion_read DEFAULT 0,
    updated_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_discussion_read_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_TM_discussion_read_task FOREIGN KEY(task_id) REFERENCES dbo.TM_tasks(id),
    CONSTRAINT FK_TM_discussion_read_subtask FOREIGN KEY(subtask_id,task_id) REFERENCES dbo.TM_subtasks(id,task_id),
    CONSTRAINT FK_TM_discussion_read_user FOREIGN KEY(user_id) REFERENCES dbo.TM_user_access(portal_user_id)
  );
  CREATE UNIQUE INDEX UX_TM_discussion_read_main ON dbo.TM_task_discussion_read_state(task_id,user_id)
    WHERE subtask_id IS NULL;
  CREATE UNIQUE INDEX UX_TM_discussion_read_child ON dbo.TM_task_discussion_read_state(task_id,subtask_id,user_id)
    WHERE subtask_id IS NOT NULL;

  CREATE TABLE dbo.TM_task_discussion_files (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TM_discussion_file_id DEFAULT NEWSEQUENTIALID(),
    message_id BIGINT NOT NULL,
    storage_key NVARCHAR(200) NOT NULL,
    original_file_name NVARCHAR(260) NOT NULL,
    mime_type NVARCHAR(150) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_discussion_file_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TM_discussion_files PRIMARY KEY(id),
    CONSTRAINT FK_TM_discussion_files_message FOREIGN KEY(message_id) REFERENCES dbo.TM_task_discussion_messages(id),
    CONSTRAINT CK_TM_discussion_file_size CHECK(size_bytes > 0 AND size_bytes <= 10485760)
  );
  CREATE INDEX IX_TM_discussion_files_message ON dbo.TM_task_discussion_files(message_id);

  /* Extend the existing allowed-event constraints without weakening or replacing
     other event types added by earlier migrations. */
  DECLARE @notificationRule NVARCHAR(MAX), @emailRule NVARCHAR(MAX);
  SELECT @notificationRule = definition FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.TM_notifications') AND name=N'CK_TM_notifications_type';
  SELECT @emailRule = definition FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.TM_email_preferences') AND name=N'CK_TM_email_preferences_event';
  IF @notificationRule IS NULL OR @emailRule IS NULL
    THROW 55903, 'Expected existing notification/email constraints were not found.', 1;
  ALTER TABLE dbo.TM_notifications DROP CONSTRAINT CK_TM_notifications_type;
  EXEC(N'ALTER TABLE dbo.TM_notifications WITH CHECK ADD CONSTRAINT CK_TM_notifications_type CHECK ('
    + @notificationRule + N' OR [notification_type] IN (''TASK_DISCUSSION_MESSAGE'',''TASK_DISCUSSION_MENTION''))');
  ALTER TABLE dbo.TM_email_preferences DROP CONSTRAINT CK_TM_email_preferences_event;
  EXEC(N'ALTER TABLE dbo.TM_email_preferences WITH CHECK ADD CONSTRAINT CK_TM_email_preferences_event CHECK ('
    + @emailRule + N' OR [event_type] IN (''TASK_DISCUSSION_MESSAGE'',''TASK_DISCUSSION_MENTION''))');
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
