USE qnhdb;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* =========================================================
       Prerequisite validation
       ========================================================= */
    IF OBJECT_ID(N'dbo.TM_contracts', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_contract_user_settings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_notifications', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_email_outbox', N'U') IS NULL
       OR COL_LENGTH(N'dbo.TM_notifications', N'email_processed_at_utc') IS NULL
       OR COL_LENGTH(N'dbo.TM_user_settings', N'email_notifications_enabled') IS NULL
    BEGIN
        THROW 51701,
            'Contracts Phase 1A/1B and TaskHub notification/email migrations are required first.',
            1;
    END;


    /* =========================================================
       Prevent duplicate migration
       ========================================================= */
    IF COL_LENGTH(
           N'dbo.TM_contract_user_settings',
           N'expiration_email_enabled'
       ) IS NOT NULL
       OR COL_LENGTH(
           N'dbo.TM_notifications',
           N'contract_id'
       ) IS NOT NULL
    BEGIN
        THROW 51702,
            'Contract reminder schema already exists. Migration was not applied.',
            1;
    END;


    /* =========================================================
       Contract reminder settings
       ========================================================= */
    ALTER TABLE dbo.TM_contract_user_settings
        ADD
            expiration_email_enabled BIT NOT NULL
                CONSTRAINT DF_TM_contract_settings_expiration_email
                DEFAULT (0),

            expiration_reminder_lead_days INT NOT NULL
                CONSTRAINT DF_TM_contract_settings_expiration_lead
                DEFAULT (30),

            notice_email_enabled BIT NOT NULL
                CONSTRAINT DF_TM_contract_settings_notice_email
                DEFAULT (0),

            notice_reminder_lead_days INT NOT NULL
                CONSTRAINT DF_TM_contract_settings_notice_lead
                DEFAULT (14);


    /* =========================================================
       Ensure settings row for existing Contracts users
       ========================================================= */
    INSERT INTO dbo.TM_contract_user_settings (
        owner_user_id
    )
    SELECT
        access.portal_user_id
    FROM dbo.TM_user_access AS access
    WHERE access.contracts_enabled = 1
      AND NOT EXISTS (
            SELECT 1
            FROM dbo.TM_contract_user_settings AS settings
            WHERE settings.owner_user_id = access.portal_user_id
      );


    /* =========================================================
       Constraints referencing newly-created columns

       Dynamic SQL is intentional:
       SQL Server compiles the outer batch before ALTER TABLE ADD
       has changed the table metadata.
       ========================================================= */
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_contract_user_settings
            ADD
                CONSTRAINT CK_TM_contract_settings_expiration_lead
                CHECK (
                    expiration_reminder_lead_days
                    BETWEEN 1 AND 365
                ),

                CONSTRAINT CK_TM_contract_settings_notice_lead
                CHECK (
                    notice_reminder_lead_days
                    BETWEEN 1 AND 365
                );
    ';


    /* =========================================================
       Link notifications to Contracts
       ========================================================= */
    ALTER TABLE dbo.TM_notifications
        ADD contract_id BIGINT NULL;


    /* =========================================================
       FK referencing newly-created contract_id
       ========================================================= */
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_notifications
            ADD CONSTRAINT FK_TM_notifications_contract_owner
            FOREIGN KEY (
                contract_id,
                owner_user_id
            )
            REFERENCES dbo.TM_contracts (
                id,
                owner_user_id
            );
    ';


    /* =========================================================
       Extend notification types
       ========================================================= */
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id =
              OBJECT_ID(N'dbo.TM_notifications')
          AND name = N'CK_TM_notifications_type'
    )
    BEGIN
        ALTER TABLE dbo.TM_notifications
            DROP CONSTRAINT CK_TM_notifications_type;
    END;


    ALTER TABLE dbo.TM_notifications
        ADD CONSTRAINT CK_TM_notifications_type
        CHECK (
            notification_type IN (
                'TASK_OVERDUE',
                'TASK_DUE_TODAY',
                'HIGH_PRIORITY_TASK_DUE_TOMORROW',
                'CURRENT_CYCLE_ENDING_SOON',
                'CURRENT_CYCLE_PAST_END',
                'KPI_BELOW_TARGET',
                'KPI_MEASUREMENT_DUE',
                'CONTRACT_EXPIRATION_REMINDER',
                'CONTRACT_NOTICE_DEADLINE_REMINDER'
            )
        );


    /* =========================================================
       Contract notification lookup index

       Dynamic SQL because contract_id was added above.
       ========================================================= */
    EXEC sys.sp_executesql N'
        CREATE INDEX IX_TM_notifications_owner_contract_created
            ON dbo.TM_notifications (
                owner_user_id,
                contract_id,
                created_at_utc DESC,
                id DESC
            )
            INCLUDE (
                notification_type,
                dedupe_key,
                event_date,
                email_processed_at_utc
            )
            WHERE contract_id IS NOT NULL;
    ';


    COMMIT TRANSACTION;

    PRINT 'Contracts Phase 1C reminder migration completed successfully.';

END TRY
BEGIN CATCH

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;

END CATCH;
GO