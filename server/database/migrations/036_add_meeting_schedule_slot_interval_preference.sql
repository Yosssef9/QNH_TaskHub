USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_settings', N'U') IS NULL
    BEGIN
        THROW 53601,
              'TM_user_settings must exist before applying migration 036.',
              1;
    END;

    IF COL_LENGTH(N'dbo.TM_user_settings', N'meeting_schedule_slot_interval') IS NULL
    BEGIN
        ALTER TABLE dbo.TM_user_settings
            ADD meeting_schedule_slot_interval SMALLINT NOT NULL
                CONSTRAINT DF_TM_user_settings_meeting_schedule_slot_interval
                DEFAULT (30)
                WITH VALUES;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_user_settings')
          AND name = N'CK_TM_user_settings_meeting_schedule_slot_interval'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_user_settings
                WITH CHECK
                ADD CONSTRAINT CK_TM_user_settings_meeting_schedule_slot_interval
                CHECK (meeting_schedule_slot_interval IN (15, 30, 60));

            ALTER TABLE dbo.TM_user_settings
                CHECK CONSTRAINT CK_TM_user_settings_meeting_schedule_slot_interval;
        ';
    END;

    COMMIT TRANSACTION;
    PRINT 'Meeting schedule slot-interval preference migration 036 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
