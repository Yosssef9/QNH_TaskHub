
USE [QNHDB];
GO

SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    -- Verify the table exists.
    IF OBJECT_ID(
        N'dbo.TM_collaboration_assignments', N'U'
    ) IS NULL
        THROW 51000,
            'TM_collaboration_assignments table not found.',
            1;

    -- 1. Add proxy user column.
    IF COL_LENGTH(
        'dbo.TM_collaboration_assignments',
        'proxy_user_id'
    ) IS NULL
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.TM_collaboration_assignments
            ADD proxy_user_id INT NULL;
        ');
    END;

    -- 2. Add proxy assignment timestamp.
    IF COL_LENGTH(
        'dbo.TM_collaboration_assignments',
        'proxy_assigned_at_utc'
    ) IS NULL
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.TM_collaboration_assignments
            ADD proxy_assigned_at_utc DATETIME2(3) NULL;
        ');
    END;

    -- 3. Foreign key.
    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = 'FK_TM_collab_assignment_proxy_user'
          AND parent_object_id =
              OBJECT_ID('dbo.TM_collaboration_assignments')
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.TM_collaboration_assignments
            ADD CONSTRAINT FK_TM_collab_assignment_proxy_user
            FOREIGN KEY (proxy_user_id)
            REFERENCES dbo.users(USER_ID);
        ');
    END;

    -- 4. Prevent self-proxy.
    IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name = 'CK_TM_collab_assignment_proxy_distinct'
          AND parent_object_id =
              OBJECT_ID('dbo.TM_collaboration_assignments')
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.TM_collaboration_assignments
            ADD CONSTRAINT CK_TM_collab_assignment_proxy_distinct
            CHECK (
                proxy_user_id IS NULL
                OR proxy_user_id <> assignee_user_id
            );
        ');
    END;

    -- 5. Create proxy lookup index.
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_TM_collab_assignment_proxy'
          AND object_id =
              OBJECT_ID('dbo.TM_collaboration_assignments')
    )
    BEGIN
        EXEC(N'
            CREATE INDEX IX_TM_collab_assignment_proxy
            ON dbo.TM_collaboration_assignments
                (proxy_user_id, task_id, subtask_id)
            WHERE proxy_user_id IS NOT NULL
              AND is_active = 1;
        ');
    END;

    COMMIT TRANSACTION;

    PRINT 'Migration 069 completed successfully.';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
