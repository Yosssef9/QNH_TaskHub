USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_task_discussion_messages',N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_user_access',N'U') IS NULL
    THROW 56101,'Migration 059 and TaskHub access foundation are required.',1;
  IF OBJECT_ID(N'dbo.TM_task_discussion_reactions',N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TM_task_discussion_reactions (
      message_id BIGINT NOT NULL,
      user_id INT NOT NULL,
      emoji NVARCHAR(12) NOT NULL,
      created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_discussion_reaction_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_TM_discussion_reactions PRIMARY KEY (message_id,user_id,emoji),
      CONSTRAINT FK_TM_discussion_reactions_message FOREIGN KEY (message_id) REFERENCES dbo.TM_task_discussion_messages(id),
      CONSTRAINT FK_TM_discussion_reactions_user FOREIGN KEY (user_id) REFERENCES dbo.TM_user_access(portal_user_id)
    );
    CREATE INDEX IX_TM_discussion_reactions_message ON dbo.TM_task_discussion_reactions(message_id) INCLUDE(emoji,user_id);
  END;
  COMMIT TRANSACTION;
  PRINT 'Migration 061 task discussion reactions completed.';
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
