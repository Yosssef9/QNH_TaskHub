USE [QNHDB];
GO

SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* =====================================================
       Task title
       ===================================================== */

    ALTER TABLE dbo.TM_tasks
    ALTER COLUMN title NVARCHAR(1000) NOT NULL;


    /* =====================================================
       Subtask title
       ===================================================== */

    ALTER TABLE dbo.TM_subtasks
    ALTER COLUMN title NVARCHAR(1000) NOT NULL;


    /* =====================================================
       Work Cycle title

       title_unique_hash is a computed column based on title,
       so both its index and the computed column itself must
       be removed before title can be altered.
       ===================================================== */

    IF EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.TM_work_cycles')
          AND name = N'UX_TM_work_cycles_active_title'
    )
    BEGIN
        DROP INDEX UX_TM_work_cycles_active_title
        ON dbo.TM_work_cycles;
    END;


    /* Drop computed column before changing title */
    IF COL_LENGTH(
        N'dbo.TM_work_cycles',
        N'title_unique_hash'
    ) IS NOT NULL
    BEGIN
        ALTER TABLE dbo.TM_work_cycles
        DROP COLUMN title_unique_hash;
    END;


    ALTER TABLE dbo.TM_work_cycles
    ALTER COLUMN title NVARCHAR(1000) NOT NULL;


    /* =====================================================
       Recreate compact hash used for Work Cycle uniqueness
       ===================================================== */

    ALTER TABLE dbo.TM_work_cycles
    ADD title_unique_hash AS
        CONVERT(
            BINARY(32),
            HASHBYTES(
                'SHA2_256',
                UPPER(LTRIM(RTRIM(title)))
            )
        ) PERSISTED;


    CREATE UNIQUE INDEX UX_TM_work_cycles_active_title
    ON dbo.TM_work_cycles (
        owner_user_id,
        title_unique_hash
    )
    INCLUDE (title)
    WHERE archived_at_utc IS NULL;


    /* =====================================================
       Notification compatibility

       Task title itself is used as notification subject.
       Work Cycle title can appear in notification context.
       ===================================================== */

    ALTER TABLE dbo.TM_notifications
    ALTER COLUMN subject_title NVARCHAR(1000) NOT NULL;

    ALTER TABLE dbo.TM_notifications
    ALTER COLUMN context_title NVARCHAR(1500) NULL;


    COMMIT TRANSACTION;

    PRINT 'Migration 014 completed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO