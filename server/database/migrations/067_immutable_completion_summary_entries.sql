-- Migration 067: Completion Summary author integrity (general & meeting tasks).
-- Requires migrations 065 and 066. Review and execute manually against QNHDB.
-- Existing TM_tasks.completion_summary values remain unchanged/read-only;
-- historical original authors cannot reliably be inferred after reassignment.
USE [QNHDB];
GO
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_task_completion_summary_entries', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TM_task_completion_summary_entries (
      id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_task_completion_summary_entries PRIMARY KEY,
      task_id BIGINT NOT NULL,
      owner_user_id INT NOT NULL,
      author_user_id INT NOT NULL,
      content NVARCHAR(MAX) NOT NULL,
      created_at_utc DATETIME2(3) NOT NULL
        CONSTRAINT DF_TM_task_completion_summary_entries_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_TM_task_completion_summary_entries_task FOREIGN KEY (task_id) REFERENCES dbo.TM_tasks(id),
      CONSTRAINT FK_TM_task_completion_summary_entries_author FOREIGN KEY (author_user_id) REFERENCES dbo.users(USER_ID),
      CONSTRAINT CK_TM_task_completion_summary_entries_content CHECK
        (LEN(LTRIM(RTRIM(content))) BETWEEN 1 AND 10000)
    );
    CREATE INDEX IX_TM_task_completion_summary_entries_task
      ON dbo.TM_task_completion_summary_entries(task_id, created_at_utc, id);
  END;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
