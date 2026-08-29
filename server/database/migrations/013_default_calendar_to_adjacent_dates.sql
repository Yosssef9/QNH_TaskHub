SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_settings', N'U') IS NULL
    BEGIN
        THROW 51000, 'TM_user_settings must exist before applying migration 013.', 1;
    END;

    IF COL_LENGTH(
        N'dbo.TM_user_settings',
        N'calendar_show_adjacent_dates'
    ) IS NULL
    BEGIN
        THROW 51001, 'Migration 012 must be applied before migration 013.', 1;
    END;

    DECLARE @DefaultConstraintName SYSNAME;
    DECLARE @Sql NVARCHAR(MAX);

    SELECT
        @DefaultConstraintName = dc.name
    FROM sys.default_constraints AS dc
    INNER JOIN sys.columns AS c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.TM_user_settings')
      AND c.name = N'calendar_show_adjacent_dates';

    IF @DefaultConstraintName IS NOT NULL
    BEGIN
        SET @Sql =
            N'ALTER TABLE dbo.TM_user_settings DROP CONSTRAINT '
            + QUOTENAME(@DefaultConstraintName)
            + N';';

        EXEC sys.sp_executesql @Sql;
    END;

    ALTER TABLE dbo.TM_user_settings
        ADD CONSTRAINT DF_TM_user_settings_calendar_adjacent_dates
        DEFAULT (1) FOR calendar_show_adjacent_dates;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO