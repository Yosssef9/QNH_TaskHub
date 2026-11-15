/* Expected Finish Dates: personal estimates per active assignment episode.
   Manual migration. Apply only after migrations 048, 050 and 069; do not
   run automatically from the frontend or ZIP installer. */
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_tasks', N'U') IS NULL
    OR OBJECT_ID(N'dbo.TM_subtasks', N'U') IS NULL
    OR OBJECT_ID(N'dbo.TM_collaboration_assignments', N'U') IS NULL
    OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
    THROW 57001, 'Required TaskHub assignment tables are missing. Apply prior migrations first.', 1;
  IF OBJECT_ID(N'dbo.TM_assignment_expected_finishes', N'U') IS NOT NULL
    OR OBJECT_ID(N'dbo.TM_assignment_expected_finish_changes', N'U') IS NOT NULL
    THROW 57002, 'Expected Finish Date tables already exist; no changes applied.', 1;

  CREATE TABLE dbo.TM_assignment_expected_finishes (
    id BIGINT IDENTITY(1,1) NOT NULL,
    task_id BIGINT NOT NULL,
    subtask_id BIGINT NULL,
    assignee_user_id INT NOT NULL,
    collaboration_assignment_id BIGINT NULL,
    expected_finish_date DATE NULL,
    is_active BIT NOT NULL CONSTRAINT DF_TM_expected_finish_active DEFAULT (1),
    created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_expected_finish_created DEFAULT SYSUTCDATETIME(),
    updated_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_expected_finish_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TM_assignment_expected_finishes PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_TM_expected_finish_task FOREIGN KEY (task_id) REFERENCES dbo.TM_tasks(id),
    CONSTRAINT FK_TM_expected_finish_subtask FOREIGN KEY (subtask_id,task_id)
      REFERENCES dbo.TM_subtasks(id,task_id),
    CONSTRAINT FK_TM_expected_finish_user FOREIGN KEY (assignee_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT FK_TM_expected_finish_collaboration FOREIGN KEY (collaboration_assignment_id)
      REFERENCES dbo.TM_collaboration_assignments(id)
  );
  CREATE UNIQUE INDEX UX_TM_expected_finish_active_general_task
    ON dbo.TM_assignment_expected_finishes(task_id,assignee_user_id)
    WHERE collaboration_assignment_id IS NULL AND subtask_id IS NULL AND is_active=1;
  CREATE UNIQUE INDEX UX_TM_expected_finish_active_general_subtask
    ON dbo.TM_assignment_expected_finishes(subtask_id,assignee_user_id)
    WHERE collaboration_assignment_id IS NULL AND subtask_id IS NOT NULL AND is_active=1;
  CREATE UNIQUE INDEX UX_TM_expected_finish_collaboration_assignment
    ON dbo.TM_assignment_expected_finishes(collaboration_assignment_id)
    WHERE collaboration_assignment_id IS NOT NULL;
  CREATE INDEX IX_TM_expected_finish_by_task
    ON dbo.TM_assignment_expected_finishes(task_id,is_active,subtask_id,assignee_user_id)
    INCLUDE (expected_finish_date,collaboration_assignment_id);

  CREATE TABLE dbo.TM_assignment_expected_finish_changes (
    id BIGINT IDENTITY(1,1) NOT NULL,
    estimate_id BIGINT NOT NULL,
    actor_user_id INT NOT NULL,
    previous_date DATE NULL,
    new_date DATE NULL,
    changed_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_expected_change_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TM_assignment_expected_finish_changes PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_TM_expected_change_estimate FOREIGN KEY (estimate_id)
      REFERENCES dbo.TM_assignment_expected_finishes(id),
    CONSTRAINT FK_TM_expected_change_actor FOREIGN KEY (actor_user_id)
      REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT CK_TM_expected_change_changed CHECK
      (previous_date <> new_date OR previous_date IS NULL AND new_date IS NOT NULL
        OR previous_date IS NOT NULL AND new_date IS NULL)
  );
  CREATE INDEX IX_TM_expected_change_history
    ON dbo.TM_assignment_expected_finish_changes(estimate_id,changed_at_utc,id);
  COMMIT TRANSACTION;
  PRINT 'Migration 070: Expected Finish Dates installed; no existing task records changed.';
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
