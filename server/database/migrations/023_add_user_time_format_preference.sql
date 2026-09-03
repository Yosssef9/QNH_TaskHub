USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- 1. Ensure TM_user_settings exists
    ------------------------------------------------------------
    IF OBJECT_ID(N'dbo.TM_user_settings', N'U') IS NULL
    BEGIN
        THROW 52301,
            'TM_user_settings must exist before applying migration 023.',
            1;
    END;


    ------------------------------------------------------------
    -- 2. Add time_format if it does not already exist
    ------------------------------------------------------------
    IF COL_LENGTH(N'dbo.TM_user_settings', N'time_format') IS NULL
    BEGIN
        ALTER TABLE dbo.TM_user_settings
            ADD time_format VARCHAR(3) NOT NULL
                CONSTRAINT DF_TM_user_settings_time_format
                DEFAULT ('12H')
                WITH VALUES;
    END;


    ------------------------------------------------------------
    -- 3. Add CHECK constraint
    --
    -- Dynamic SQL is intentional here.
    -- SQL Server compiles the normal batch before the new column
    -- exists, which causes:
    --     Invalid column name 'time_format'
    ------------------------------------------------------------
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_user_settings')
          AND name = N'CK_TM_user_settings_time_format'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_user_settings
                WITH CHECK
                ADD CONSTRAINT CK_TM_user_settings_time_format
                CHECK (time_format IN (''12H'', ''24H''));

            ALTER TABLE dbo.TM_user_settings
                CHECK CONSTRAINT CK_TM_user_settings_time_format;
        ';
    END;


    ------------------------------------------------------------
    -- 4. Commit
    ------------------------------------------------------------
    COMMIT TRANSACTION;

    PRINT 'User time-format preference migration completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO