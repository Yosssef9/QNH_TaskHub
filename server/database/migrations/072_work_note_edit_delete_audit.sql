-- QNH TaskHub: author-only Work Note corrections with soft deletion and immutable revisions.
-- Backup QNHDB first. Apply after 071. Existing note content is preserved.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.TM_subtask_work_note_entries', N'U') IS NULL
    THROW 50720, 'Missing dbo.TM_subtask_work_note_entries. Apply migration 066 first.', 1;
IF OBJECT_ID(N'dbo.TM_collaboration_work_entries', N'U') IS NULL
    THROW 50721, 'Missing dbo.TM_collaboration_work_entries. Apply migration 050 first.', 1;
IF COL_LENGTH(N'dbo.TM_subtask_work_note_entries', N'edit_version') IS NULL
    ALTER TABLE dbo.TM_subtask_work_note_entries ADD edit_version INT NOT NULL CONSTRAINT DF_TM_subtask_note_edit_version DEFAULT (0);
IF COL_LENGTH(N'dbo.TM_subtask_work_note_entries', N'edited_at_utc') IS NULL
    ALTER TABLE dbo.TM_subtask_work_note_entries ADD edited_at_utc DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.TM_subtask_work_note_entries', N'deleted_at_utc') IS NULL
    ALTER TABLE dbo.TM_subtask_work_note_entries ADD deleted_at_utc DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.TM_collaboration_work_entries', N'edit_version') IS NULL
    ALTER TABLE dbo.TM_collaboration_work_entries ADD edit_version INT NOT NULL CONSTRAINT DF_TM_collab_note_edit_version DEFAULT (0);
IF COL_LENGTH(N'dbo.TM_collaboration_work_entries', N'edited_at_utc') IS NULL
    ALTER TABLE dbo.TM_collaboration_work_entries ADD edited_at_utc DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.TM_collaboration_work_entries', N'deleted_at_utc') IS NULL
    ALTER TABLE dbo.TM_collaboration_work_entries ADD deleted_at_utc DATETIME2(3) NULL;
IF OBJECT_ID(N'dbo.TM_work_note_revisions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TM_work_note_revisions (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_work_note_revisions PRIMARY KEY,
        source_type VARCHAR(16) NOT NULL,
        note_id BIGINT NOT NULL,
        task_id BIGINT NOT NULL,
        subtask_id BIGINT NULL,
        actor_user_id INT NOT NULL,
        action_type VARCHAR(10) NOT NULL,
        previous_content NVARCHAR(4000) NOT NULL,
        new_content NVARCHAR(4000) NULL,
        changed_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_work_note_revisions_date DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_TM_work_note_revisions_source CHECK (source_type IN ('SUBTASK','COLLABORATIVE')),
        CONSTRAINT CK_TM_work_note_revisions_action CHECK (action_type IN ('EDIT','DELETE')),
        CONSTRAINT FK_TM_work_note_revisions_task FOREIGN KEY (task_id) REFERENCES dbo.TM_tasks(id),
        CONSTRAINT FK_TM_work_note_revisions_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.TM_user_access(portal_user_id)
    );
    CREATE INDEX IX_TM_work_note_revisions_note ON dbo.TM_work_note_revisions(source_type,note_id,changed_at_utc,id);
END;
-- Collaboration events use an allow-list; extend it for authored note corrections.
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID(N'dbo.TM_collaboration_events')
             AND name=N'CK_TM_collaboration_event_type')
BEGIN
    ALTER TABLE dbo.TM_collaboration_events DROP CONSTRAINT CK_TM_collaboration_event_type;
END;
ALTER TABLE dbo.TM_collaboration_events WITH CHECK ADD CONSTRAINT CK_TM_collaboration_event_type
    CHECK (event_type IN ('ASSIGNED','REMOVED','STARTED','COMPLETED','REOPENED',
                         'NOTE_ADDED','NOTE_EDITED','NOTE_DELETED','FILE_ADDED','FILE_REMOVED'));
COMMIT TRANSACTION;
GO
