USE [QNHDB];
GO
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.TM_tasks', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_subtasks', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_action_items', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_notifications', N'U') IS NULL
        THROW 54801, 'TaskHub task/Meeting Action Item/notification foundations are missing.', 1;

    IF OBJECT_ID(N'dbo.TM_general_task_assignments', N'U') IS NOT NULL
       OR COL_LENGTH(N'dbo.TM_tasks', N'completion_summary') IS NOT NULL
       OR COL_LENGTH(N'dbo.TM_subtasks', N'work_notes') IS NOT NULL
       OR COL_LENGTH(N'dbo.TM_subtasks', N'assignee_user_id') IS NOT NULL
        THROW 54802, 'General task assignment schema already exists; migration not applied.', 1;

    ALTER TABLE dbo.TM_tasks ADD
        completion_summary NVARCHAR(MAX) NULL,
        auto_completed_from_subtasks BIT NOT NULL
            CONSTRAINT DF_TM_tasks_auto_from_subtasks DEFAULT (0) WITH VALUES;
    ALTER TABLE dbo.TM_subtasks ADD
        work_notes NVARCHAR(4000) NULL,
        assignee_user_id INT NULL;
    -- Dynamic SQL compiles references only after newly added columns exist.
    EXEC sys.sp_executesql N'
      ALTER TABLE dbo.TM_subtasks WITH CHECK ADD
        CONSTRAINT FK_TM_subtasks_assignee FOREIGN KEY (assignee_user_id)
          REFERENCES dbo.TM_user_access(portal_user_id);';

    CREATE TABLE dbo.TM_general_task_assignments (
        task_id BIGINT NOT NULL,
        owner_user_id INT NOT NULL,
        assignee_user_id INT NULL,
        assigned_by_user_id INT NOT NULL,
        assigned_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_general_assignment_created DEFAULT SYSUTCDATETIME(),
        row_version ROWVERSION NOT NULL,
        CONSTRAINT PK_TM_general_task_assignments PRIMARY KEY CLUSTERED (task_id),
        CONSTRAINT FK_TM_general_assignment_task_owner FOREIGN KEY (task_id, owner_user_id)
            REFERENCES dbo.TM_tasks(id, owner_user_id),
        CONSTRAINT FK_TM_general_assignment_assignee FOREIGN KEY (assignee_user_id)
            REFERENCES dbo.TM_user_access(portal_user_id),
        CONSTRAINT FK_TM_general_assignment_actor FOREIGN KEY (assigned_by_user_id)
            REFERENCES dbo.TM_user_access(portal_user_id)
    );
    CREATE INDEX IX_TM_general_assignment_assignee
        ON dbo.TM_general_task_assignments(assignee_user_id, task_id)
        INCLUDE (owner_user_id, assigned_at_utc)
        WHERE assignee_user_id IS NOT NULL;
    EXEC sys.sp_executesql N'
      CREATE INDEX IX_TM_subtasks_assignee_task
        ON dbo.TM_subtasks(assignee_user_id, task_id, id)
        INCLUDE(is_completed, due_date)
        WHERE assignee_user_id IS NOT NULL AND deleted_at_utc IS NULL;';

    -- This task event is an IN-APP notification. No new email template is enabled by this migration.
    ALTER TABLE dbo.TM_notifications DROP CONSTRAINT CK_TM_notifications_type;
    ALTER TABLE dbo.TM_notifications WITH CHECK ADD CONSTRAINT CK_TM_notifications_type CHECK (
        notification_type IN (
            'TASK_OVERDUE','TASK_DUE_TODAY','HIGH_PRIORITY_TASK_DUE_TOMORROW',
            'CURRENT_CYCLE_ENDING_SOON','CURRENT_CYCLE_PAST_END',
            'KPI_BELOW_TARGET','KPI_MEASUREMENT_DUE',
            'CONTRACT_EXPIRATION_REMINDER','CONTRACT_NOTICE_DEADLINE_REMINDER',
            'MEETING_REQUEST_SUBMITTED','MEETING_REQUEST_UPDATED','MEETING_APPROVED',
            'MEETING_REJECTED','MEETING_INVITED','MEETING_RESCHEDULED',
            'MEETING_RESCHEDULE_REQUEST_CANCELLED','MEETING_CANCELLED',
            'MEETING_SERIES_SCHEDULED','MEETING_START_REMINDER',
            'MEETING_ACTION_ITEM_ASSIGNED','MEETING_ACTION_ITEM_COMPLETED',
            'GENERAL_TASK_ASSIGNED','GENERAL_SUBTASK_ASSIGNED','GENERAL_TASK_COMPLETED'
        )
    );

    COMMIT TRANSACTION;
    PRINT 'Migration 048 complete: general task collaboration schema ready.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
