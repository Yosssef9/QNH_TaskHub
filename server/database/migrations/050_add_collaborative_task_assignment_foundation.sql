USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
/*
  Unified Collaborative Task Assignment schema migration (part of the final ZIP).
  Migration 050 creates the new relational tables. It does not activate or mutate
  existing single-user tasks; new collaborative tasks and explicit conversion are
  handled by the upgraded server. Execute manually after QNHDB backup and before
  starting the upgraded backend and its background workers.
*/
BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.TM_tasks', N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_subtasks', N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_general_task_assignments', N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_meeting_action_items', N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_task_activity', N'U') IS NULL
     THROW 55001, 'TaskHub migrations 001-049 are required before collaborative assignments.', 1;

  IF OBJECT_ID(N'dbo.TM_collaboration_tasks', N'U') IS NOT NULL
     OR OBJECT_ID(N'dbo.TM_collaboration_assignments', N'U') IS NOT NULL
     OR OBJECT_ID(N'dbo.TM_collaboration_subtask_modes', N'U') IS NOT NULL
     OR OBJECT_ID(N'dbo.TM_collaboration_work_entries', N'U') IS NOT NULL
     OR OBJECT_ID(N'dbo.TM_collaboration_files', N'U') IS NOT NULL
     OR OBJECT_ID(N'dbo.TM_collaboration_events', N'U') IS NOT NULL
     THROW 55002, 'Collaborative assignment schema already exists; no changes applied.', 1;

  /* Add a composite key so an assignment cannot claim a subtask from a
     different parent task. The existing subtask IDs are already unique. */
  IF NOT EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.TM_subtasks')
      AND name = N'UQ_TM_subtasks_id_task_for_collaboration'
  )
    ALTER TABLE dbo.TM_subtasks ADD CONSTRAINT UQ_TM_subtasks_id_task_for_collaboration
      UNIQUE NONCLUSTERED (id, task_id);

  /* A row is an explicit opt-in marker for the new completion/visibility model.
     Do not create rows automatically for legacy or KPI tasks. */
  CREATE TABLE dbo.TM_collaboration_tasks (
    task_id BIGINT NOT NULL,
    owner_user_id INT NOT NULL,
    activated_by_user_id INT NOT NULL,
    activated_at_utc DATETIME2(3) NOT NULL
      CONSTRAINT DF_TM_collaboration_tasks_activated DEFAULT SYSUTCDATETIME(),
    row_version ROWVERSION NOT NULL,
    CONSTRAINT PK_TM_collaboration_tasks PRIMARY KEY CLUSTERED (task_id),
    CONSTRAINT FK_TM_collaboration_tasks_owner FOREIGN KEY (task_id, owner_user_id)
      REFERENCES dbo.TM_tasks(id, owner_user_id),
    CONSTRAINT FK_TM_collaboration_tasks_actor FOREIGN KEY (activated_by_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id)
  );

  /* Each subtask chooses inherited parent team or its own custom team. */
  CREATE TABLE dbo.TM_collaboration_subtask_modes (
    subtask_id BIGINT NOT NULL,
    task_id BIGINT NOT NULL,
    assignment_mode VARCHAR(12) NOT NULL
      CONSTRAINT DF_TM_collaboration_subtask_mode DEFAULT 'INHERIT',
    changed_by_user_id INT NOT NULL,
    changed_at_utc DATETIME2(3) NOT NULL
      CONSTRAINT DF_TM_collaboration_subtask_changed DEFAULT SYSUTCDATETIME(),
    row_version ROWVERSION NOT NULL,
    CONSTRAINT PK_TM_collaboration_subtask_modes PRIMARY KEY CLUSTERED (subtask_id),
    CONSTRAINT UQ_TM_collaboration_subtask_id_task UNIQUE NONCLUSTERED (subtask_id, task_id),
    CONSTRAINT FK_TM_collaboration_subtask_task FOREIGN KEY (task_id)
      REFERENCES dbo.TM_collaboration_tasks(task_id),
    CONSTRAINT FK_TM_collaboration_subtask_pair FOREIGN KEY (subtask_id, task_id)
      REFERENCES dbo.TM_subtasks(id, task_id),
    CONSTRAINT FK_TM_collaboration_subtask_actor FOREIGN KEY (changed_by_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT CK_TM_collaboration_subtask_mode CHECK (assignment_mode IN ('INHERIT','CUSTOM'))
  );

  /* Assignment history is soft-revoked. A re-added user gets a new record,
     not ownership of the prior submission or a revived completion flag. */
  CREATE TABLE dbo.TM_collaboration_assignments (
    id BIGINT IDENTITY(1,1) NOT NULL,
    task_id BIGINT NOT NULL,
    subtask_id BIGINT NULL,
    assignee_user_id INT NOT NULL,
    assignment_origin VARCHAR(12) NOT NULL,
    state VARCHAR(15) NOT NULL CONSTRAINT DF_TM_collaboration_state DEFAULT 'TODO',
    assigned_by_user_id INT NOT NULL,
    assigned_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_collaboration_assigned DEFAULT SYSUTCDATETIME(),
    completed_at_utc DATETIME2(3) NULL,
    reopened_at_utc DATETIME2(3) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_TM_collaboration_active DEFAULT (1),
    revoked_at_utc DATETIME2(3) NULL,
    revoked_by_user_id INT NULL,
    row_version ROWVERSION NOT NULL,
    CONSTRAINT PK_TM_collaboration_assignments PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_TM_collaboration_assignment_task FOREIGN KEY (task_id)
      REFERENCES dbo.TM_collaboration_tasks(task_id),
    CONSTRAINT FK_TM_collaboration_assignment_child FOREIGN KEY (subtask_id, task_id)
      REFERENCES dbo.TM_collaboration_subtask_modes(subtask_id, task_id),
    CONSTRAINT FK_TM_collaboration_assignment_assignee FOREIGN KEY (assignee_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT FK_TM_collaboration_assignment_actor FOREIGN KEY (assigned_by_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT FK_TM_collaboration_assignment_revoker FOREIGN KEY (revoked_by_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT CK_TM_collaboration_assignment_origin CHECK (assignment_origin IN ('EXPLICIT','INHERITED')),
    CONSTRAINT CK_TM_collaboration_assignment_state CHECK (state IN ('TODO','IN_PROGRESS','DONE')),
    CONSTRAINT CK_TM_collaboration_assignment_complete CHECK
      ((state='DONE' AND completed_at_utc IS NOT NULL) OR
       (state<>'DONE' AND completed_at_utc IS NULL)),
    CONSTRAINT CK_TM_collaboration_assignment_revoked CHECK
      ((is_active=1 AND revoked_at_utc IS NULL AND revoked_by_user_id IS NULL) OR
       (is_active=0 AND revoked_at_utc IS NOT NULL AND revoked_by_user_id IS NOT NULL)),
    CONSTRAINT CK_TM_collaboration_assignment_scope CHECK
      ((subtask_id IS NULL AND assignment_origin='EXPLICIT') OR subtask_id IS NOT NULL)
  );
  CREATE UNIQUE INDEX UX_TM_collaboration_active_main
    ON dbo.TM_collaboration_assignments(task_id, assignee_user_id)
    WHERE is_active=1 AND subtask_id IS NULL;
  CREATE UNIQUE INDEX UX_TM_collaboration_active_child
    ON dbo.TM_collaboration_assignments(subtask_id, assignee_user_id)
    WHERE is_active=1 AND subtask_id IS NOT NULL;
  CREATE INDEX IX_TM_collaboration_assignee_active
    ON dbo.TM_collaboration_assignments(assignee_user_id, is_active, task_id, subtask_id)
    INCLUDE (state, completed_at_utc, assigned_at_utc);
  CREATE INDEX IX_TM_collaboration_task_active
    ON dbo.TM_collaboration_assignments(task_id, subtask_id, is_active, state);

  /* Private immutable notes: never copy into TM_subtasks.work_notes or
     TM_tasks.completion_summary, which have legacy shared readers. */
  CREATE TABLE dbo.TM_collaboration_work_entries (
    id BIGINT IDENTITY(1,1) NOT NULL,
    assignment_id BIGINT NOT NULL,
    author_user_id INT NOT NULL,
    note NVARCHAR(4000) NOT NULL,
    created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_collaboration_entry_date DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TM_collaboration_work_entries PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_TM_collaboration_entry_assignment FOREIGN KEY (assignment_id)
      REFERENCES dbo.TM_collaboration_assignments(id),
    CONSTRAINT FK_TM_collaboration_entry_author FOREIGN KEY (author_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT CK_TM_collaboration_entry_note CHECK (LEN(LTRIM(RTRIM(note))) > 0)
  );
  CREATE INDEX IX_TM_collaboration_entries_assignment
    ON dbo.TM_collaboration_work_entries(assignment_id, created_at_utc, id);

  /* Private attachments are stored separately from TM_attachments so the
     old public-within-task download API cannot accidentally expose them. */
  CREATE TABLE dbo.TM_collaboration_files (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TM_collaboration_file_id DEFAULT NEWSEQUENTIALID(),
    assignment_id BIGINT NOT NULL,
    uploaded_by_user_id INT NOT NULL,
    original_file_name NVARCHAR(255) NOT NULL,
    storage_key NVARCHAR(255) NOT NULL,
    mime_type NVARCHAR(150) NOT NULL,
    file_extension NVARCHAR(20) NOT NULL,
    size_bytes BIGINT NOT NULL,
    uploaded_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_collaboration_file_date DEFAULT SYSUTCDATETIME(),
    deleted_at_utc DATETIME2(3) NULL,
    deleted_by_user_id INT NULL,
    CONSTRAINT PK_TM_collaboration_files PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_TM_collaboration_file_key UNIQUE (storage_key),
    CONSTRAINT FK_TM_collaboration_file_assignment FOREIGN KEY (assignment_id)
      REFERENCES dbo.TM_collaboration_assignments(id),
    CONSTRAINT FK_TM_collaboration_file_actor FOREIGN KEY (uploaded_by_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT FK_TM_collaboration_file_deleter FOREIGN KEY (deleted_by_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT CK_TM_collaboration_file_size CHECK (size_bytes > 0),
    CONSTRAINT CK_TM_collaboration_file_deleted CHECK
      ((deleted_at_utc IS NULL AND deleted_by_user_id IS NULL) OR
       (deleted_at_utc IS NOT NULL AND deleted_by_user_id IS NOT NULL))
  );
  CREATE INDEX IX_TM_collaboration_files_assignment
    ON dbo.TM_collaboration_files(assignment_id, uploaded_at_utc, id)
    WHERE deleted_at_utc IS NULL;

  /* Record status and membership transitions without leaking note text into
     the generic task history. The actor is always the authenticated Portal ID. */
  CREATE TABLE dbo.TM_collaboration_events (
    id BIGINT IDENTITY(1,1) NOT NULL,
    assignment_id BIGINT NOT NULL,
    actor_user_id INT NOT NULL,
    event_type VARCHAR(25) NOT NULL,
    created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_collaboration_event_date DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TM_collaboration_events PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_TM_collaboration_event_assignment FOREIGN KEY (assignment_id)
      REFERENCES dbo.TM_collaboration_assignments(id),
    CONSTRAINT FK_TM_collaboration_event_actor FOREIGN KEY (actor_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT CK_TM_collaboration_event_type CHECK
      (event_type IN ('ASSIGNED','REMOVED','STARTED','COMPLETED','REOPENED','NOTE_ADDED','FILE_ADDED','FILE_REMOVED'))
  );
  CREATE INDEX IX_TM_collaboration_events_assignment
    ON dbo.TM_collaboration_events(assignment_id, created_at_utc, id);

  /* All legacy single-user assignment rows, statuses and attachments remain
     untouched until a separate explicit activation/conversion transaction. */
  COMMIT TRANSACTION;
  PRINT 'Migration 050 installed collaborative assignments. Existing tasks remain unchanged.';
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
