-- QNH TaskHub: author-attributed, append-only Work Notes on legacy single-assignee subtasks.
-- Apply manually to QNHDB after migration 065. Does not overwrite existing work_notes.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.TM_subtask_work_note_entries', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TM_subtask_work_note_entries (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_subtask_work_note_entries PRIMARY KEY,
    task_id BIGINT NOT NULL,
    subtask_id BIGINT NOT NULL,
    owner_user_id INT NOT NULL,
    author_user_id INT NOT NULL,
    content NVARCHAR(4000) NOT NULL,
    created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_subtask_work_note_entries_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_TM_subtask_work_note_entries_subtask FOREIGN KEY (subtask_id) REFERENCES dbo.TM_subtasks(id),
    CONSTRAINT FK_TM_subtask_work_note_entries_author FOREIGN KEY (author_user_id) REFERENCES dbo.users(USER_ID),
    CONSTRAINT CK_TM_subtask_work_note_entries_content CHECK (LEN(LTRIM(RTRIM(content))) > 0)
  );
  CREATE INDEX IX_TM_subtask_work_note_entries_subtask
    ON dbo.TM_subtask_work_note_entries(subtask_id, created_at_utc, id);
END;
COMMIT TRANSACTION;
GO
-- Existing TM_subtasks.work_notes stays untouched and is displayed read-only as
-- a legacy note with unknown author: historical actor attribution is not reliable.
