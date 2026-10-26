USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================
       1. Validate prerequisites
       ============================================ */

    IF OBJECT_ID(N'dbo.TM_task_discussion_files', N'U') IS NULL
    BEGIN
        THROW 56001,
            'Migration 059 must be applied before 060.',
            1;
    END;

    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
    BEGIN
        THROW 56002,
            'TM_user_access table is missing.',
            1;
    END;

    /* ============================================
       2. Add soft-delete columns
       ============================================ */

    IF COL_LENGTH(
        N'dbo.TM_task_discussion_files',
        N'deleted_at_utc'
    ) IS NULL
    BEGIN
        ALTER TABLE dbo.TM_task_discussion_files
        ADD deleted_at_utc DATETIME2(3) NULL;
    END;

    IF COL_LENGTH(
        N'dbo.TM_task_discussion_files',
        N'deleted_by_user_id'
    ) IS NULL
    BEGIN
        ALTER TABLE dbo.TM_task_discussion_files
        ADD deleted_by_user_id INT NULL;
    END;

    /* ============================================
       3. Add foreign key
       ============================================ */

    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = N'FK_TM_discussion_files_deleter'
          AND parent_object_id =
              OBJECT_ID(N'dbo.TM_task_discussion_files')
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_task_discussion_files
            WITH CHECK
            ADD CONSTRAINT FK_TM_discussion_files_deleter
            FOREIGN KEY (deleted_by_user_id)
            REFERENCES dbo.TM_user_access(portal_user_id);
        ';
    END;

    /* ============================================
       4. Add deletion consistency constraint
       ============================================ */

    IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name = N'CK_TM_discussion_files_deletion'
          AND parent_object_id =
              OBJECT_ID(N'dbo.TM_task_discussion_files')
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_task_discussion_files
            WITH CHECK
            ADD CONSTRAINT CK_TM_discussion_files_deletion
            CHECK (
                (
                    deleted_at_utc IS NULL
                    AND deleted_by_user_id IS NULL
                )
                OR
                (
                    deleted_at_utc IS NOT NULL
                    AND deleted_by_user_id IS NOT NULL
                )
            );
        ';
    END;

    /* ============================================
       5. Commit migration
       ============================================ */

    COMMIT TRANSACTION;

    PRINT 'Discussion attachment soft-deletion migration 060 completed successfully.';

END TRY
BEGIN CATCH

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;

END CATCH;
GO