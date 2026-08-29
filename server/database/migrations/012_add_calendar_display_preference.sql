SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_settings', N'U') IS NULL
    BEGIN
        THROW 51000, 'TM_user_settings must exist before applying migration 012.', 1;
    END;

    IF COL_LENGTH(N'dbo.TM_user_settings', N'calendar_show_adjacent_dates') IS NULL
    BEGIN
        ALTER TABLE dbo.TM_user_settings
            ADD calendar_show_adjacent_dates BIT NOT NULL
                CONSTRAINT DF_TM_user_settings_calendar_adjacent_dates DEFAULT (0) WITH VALUES;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
