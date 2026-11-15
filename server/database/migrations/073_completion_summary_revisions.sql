-- TaskHub 073: author-only Completion Summary corrections.
-- Apply manually to QNHDB after migrations 067 and 072; back up first.
USE [QNHDB];
GO
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_task_completion_summary_entries', N'U') IS NULL
    THROW 50730, 'Migration 067 (Completion Summary entries) is required.', 1;
  IF COL_LENGTH(N'dbo.TM_task_completion_summary_entries', N'edit_version') IS NULL
    ALTER TABLE dbo.TM_task_completion_summary_entries ADD edit_version INT NOT NULL CONSTRAINT DF_TM_completion_summary_edit_version DEFAULT (0);
  IF COL_LENGTH(N'dbo.TM_task_completion_summary_entries', N'edited_at_utc') IS NULL
    ALTER TABLE dbo.TM_task_completion_summary_entries ADD edited_at_utc DATETIME2(3) NULL;
  IF COL_LENGTH(N'dbo.TM_task_completion_summary_entries', N'deleted_at_utc') IS NULL
    ALTER TABLE dbo.TM_task_completion_summary_entries ADD deleted_at_utc DATETIME2(3) NULL;
  IF OBJECT_ID(N'dbo.TM_completion_summary_revisions', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TM_completion_summary_revisions (
      id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_completion_summary_revisions PRIMARY KEY,
      entry_id BIGINT NOT NULL,
      task_id BIGINT NOT NULL,
      actor_user_id INT NOT NULL,
      action_type VARCHAR(10) NOT NULL,
      previous_content NVARCHAR(MAX) NOT NULL,
      new_content NVARCHAR(MAX) NULL,
      changed_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_completion_summary_revision_date DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_TM_completion_summary_revision_action CHECK (action_type IN ('EDIT','DELETE')),
      CONSTRAINT FK_TM_completion_summary_revision_entry FOREIGN KEY (entry_id) REFERENCES dbo.TM_task_completion_summary_entries(id),
      CONSTRAINT FK_TM_completion_summary_revision_task FOREIGN KEY (task_id) REFERENCES dbo.TM_tasks(id),
      CONSTRAINT FK_TM_completion_summary_revision_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.TM_user_access(portal_user_id)
    );
    CREATE INDEX IX_TM_completion_summary_revision_entry ON dbo.TM_completion_summary_revisions(entry_id,changed_at_utc,id);
  END;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
