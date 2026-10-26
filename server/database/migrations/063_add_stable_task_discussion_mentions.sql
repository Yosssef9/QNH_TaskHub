USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_task_discussion_messages',N'U') IS NULL
    THROW 56301, 'Task Discussions migration 059 must be applied.', 1;
  IF OBJECT_ID(N'dbo.TM_task_discussion_mentions',N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TM_task_discussion_mentions (
      message_id BIGINT NOT NULL,
      mentioned_user_id INT NOT NULL,
      created_at_utc DATETIME2(3) NOT NULL
        CONSTRAINT DF_TM_discussion_mentions_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_TM_discussion_mentions PRIMARY KEY CLUSTERED(message_id,mentioned_user_id),
      CONSTRAINT FK_TM_discussion_mentions_message FOREIGN KEY(message_id)
        REFERENCES dbo.TM_task_discussion_messages(id),
      CONSTRAINT FK_TM_discussion_mentions_user FOREIGN KEY(mentioned_user_id)
        REFERENCES dbo.TM_user_access(portal_user_id)
    );
    CREATE INDEX IX_TM_discussion_mentions_user_message
      ON dbo.TM_task_discussion_mentions(mentioned_user_id,message_id);
  END;
  COMMIT TRANSACTION;
  PRINT 'Stable discussion mention identities installed. Legacy message bodies remain unchanged.';
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
