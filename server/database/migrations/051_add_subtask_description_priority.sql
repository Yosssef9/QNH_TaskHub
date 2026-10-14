-- Apply manually in SSMS after a verified backup. Never run from the ZIP patch script.
USE [QNHDB];
GO
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_subtasks', N'U') IS NULL OR OBJECT_ID(N'dbo.TM_tasks', N'U') IS NULL
    THROW 55101, 'TM_subtasks and TM_tasks must exist before migration 051.', 1;

  IF COL_LENGTH(N'dbo.TM_subtasks', N'description') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.TM_subtasks ADD description NVARCHAR(4000) NULL;';

  IF COL_LENGTH(N'dbo.TM_subtasks', N'priority') IS NULL
  BEGIN
    EXEC sys.sp_executesql N'ALTER TABLE dbo.TM_subtasks ADD priority VARCHAR(10) NULL;';
    -- Existing subtasks inherit a one-time snapshot of their parent's priority.
    EXEC sys.sp_executesql N'
      UPDATE child SET priority = parent.priority
      FROM dbo.TM_subtasks AS child
      JOIN dbo.TM_tasks AS parent ON parent.id = child.task_id
        AND parent.owner_user_id = child.owner_user_id
      WHERE child.priority IS NULL;';
  END;

  IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.TM_subtasks')
      AND name=N'priority' AND is_nullable=1)
  BEGIN
    EXEC sys.sp_executesql N'
      UPDATE dbo.TM_subtasks SET priority = ''MEDIUM'' WHERE priority IS NULL;
      ALTER TABLE dbo.TM_subtasks ALTER COLUMN priority VARCHAR(10) NOT NULL;';
  END;

  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints AS d JOIN sys.columns AS c
       ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
       WHERE d.parent_object_id=OBJECT_ID(N'dbo.TM_subtasks') AND c.name=N'priority')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.TM_subtasks ADD CONSTRAINT DF_TM_subtasks_priority DEFAULT (''MEDIUM'') FOR priority;';

  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TM_subtasks') AND name=N'CK_TM_subtasks_priority')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.TM_subtasks WITH CHECK ADD CONSTRAINT CK_TM_subtasks_priority CHECK(priority IN (''LOW'',''MEDIUM'',''HIGH''));';

  COMMIT TRANSACTION;
  PRINT 'Migration 051 applied: subtask description and priority.';
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
