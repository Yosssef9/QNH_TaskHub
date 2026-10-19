/* QNH TaskHub - 056: List-owned, arbitrarily nested task groups.
   Run manually against the TaskHub database after taking a database backup.
   Existing tasks remain ungrouped; no existing task ownership or dates change.
*/
SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.TM_tasks', N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_lists', N'U') IS NULL
    THROW 55601, 'TaskHub tasks/lists schema is required.', 1;

  IF OBJECT_ID(N'dbo.TM_task_groups', N'U') IS NOT NULL
     OR COL_LENGTH(N'dbo.TM_tasks', N'group_id') IS NOT NULL
    THROW 55602, 'Task Groups migration has already been applied or is incomplete.', 1;

  CREATE TABLE dbo.TM_task_groups (
    id BIGINT IDENTITY(1,1) NOT NULL,
    list_id BIGINT NOT NULL,
    owner_user_id INT NOT NULL,
    parent_group_id BIGINT NULL,
    name NVARCHAR(150) NOT NULL,
    display_order INT NOT NULL CONSTRAINT DF_TM_task_groups_order DEFAULT (0),
    created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_task_groups_created DEFAULT SYSUTCDATETIME(),
    updated_at_utc DATETIME2(3) NULL,
    row_version ROWVERSION NOT NULL,
    CONSTRAINT PK_TM_task_groups PRIMARY KEY (id),
    CONSTRAINT UQ_TM_task_groups_list_owner UNIQUE (id, list_id, owner_user_id),
    CONSTRAINT FK_TM_task_groups_list FOREIGN KEY (list_id,owner_user_id)
      REFERENCES dbo.TM_lists (id,owner_user_id),
    CONSTRAINT FK_TM_task_groups_parent FOREIGN KEY (parent_group_id,list_id,owner_user_id)
      REFERENCES dbo.TM_task_groups (id,list_id,owner_user_id),
    CONSTRAINT CK_TM_task_groups_name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
    CONSTRAINT CK_TM_task_groups_order CHECK (display_order >= 0),
    CONSTRAINT CK_TM_task_groups_no_self CHECK (parent_group_id IS NULL OR parent_group_id <> id)
  );

  CREATE UNIQUE INDEX UX_TM_task_groups_root_name
    ON dbo.TM_task_groups (list_id,owner_user_id,name)
    WHERE parent_group_id IS NULL;
  CREATE UNIQUE INDEX UX_TM_task_groups_child_name
    ON dbo.TM_task_groups (list_id,owner_user_id,parent_group_id,name)
    WHERE parent_group_id IS NOT NULL;
  CREATE INDEX IX_TM_task_groups_siblings
    ON dbo.TM_task_groups (list_id,owner_user_id,parent_group_id,display_order,id)
    INCLUDE (name);

  ALTER TABLE dbo.TM_tasks ADD group_id BIGINT NULL;
  EXEC sys.sp_executesql N'
    ALTER TABLE dbo.TM_tasks WITH CHECK ADD CONSTRAINT FK_TM_tasks_group_list_owner
      FOREIGN KEY (group_id,list_id,owner_user_id)
      REFERENCES dbo.TM_task_groups (id,list_id,owner_user_id);
    CREATE INDEX IX_TM_tasks_group_active
      ON dbo.TM_tasks(owner_user_id,list_id,group_id,id)
      WHERE deleted_at_utc IS NULL AND list_id IS NOT NULL;
  ';

  COMMIT TRANSACTION;
  PRINT 'Migration 056 complete: nested Task Groups are available.';
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
