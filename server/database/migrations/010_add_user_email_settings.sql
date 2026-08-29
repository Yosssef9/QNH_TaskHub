USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_settings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_email_outbox', N'U') IS NULL
       OR OBJECT_ID(N'dbo.users', N'U') IS NULL
    BEGIN
        THROW 51001, 'TaskHub migrations 001-009 must be applied first.', 1;
    END;

    IF COL_LENGTH(N'dbo.TM_user_settings', N'email_notifications_enabled') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_user_email_settings', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_email_preferences', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_email_verifications', N'U') IS NOT NULL
    BEGIN
        THROW 51002, 'User email settings already exist. Migration was not applied.', 1;
    END;

    ALTER TABLE dbo.TM_user_settings
        ADD email_notifications_enabled BIT NOT NULL
            CONSTRAINT DF_TM_user_settings_email_notifications DEFAULT (1);

    CREATE TABLE dbo.TM_user_email_settings (
        owner_user_id INT NOT NULL,
        alternate_email NVARCHAR(320) NULL,
        alternate_email_normalized NVARCHAR(320) NULL,
        alternate_email_verified_at_utc DATETIME2(3) NULL,
        active_email_source VARCHAR(12) NOT NULL
            CONSTRAINT DF_TM_user_email_settings_source DEFAULT ('PORTAL'),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_user_email_settings_created DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_user_email_settings PRIMARY KEY CLUSTERED (owner_user_id),
        CONSTRAINT FK_TM_user_email_settings_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_user_email_settings_source
            CHECK (active_email_source IN ('PORTAL', 'ALTERNATE')),
        CONSTRAINT CK_TM_user_email_settings_alternate_state CHECK (
            (
                alternate_email IS NULL
                AND alternate_email_normalized IS NULL
                AND alternate_email_verified_at_utc IS NULL
            )
            OR
            (
                alternate_email IS NOT NULL
                AND alternate_email_normalized IS NOT NULL
                AND alternate_email_verified_at_utc IS NOT NULL
            )
        ),
        CONSTRAINT CK_TM_user_email_settings_active_alternate CHECK (
            active_email_source <> 'ALTERNATE'
            OR alternate_email_verified_at_utc IS NOT NULL
        )
    );

    CREATE UNIQUE INDEX UX_TM_user_email_settings_alternate
        ON dbo.TM_user_email_settings (alternate_email_normalized)
        WHERE alternate_email_normalized IS NOT NULL;

    CREATE TABLE dbo.TM_email_preferences (
        owner_user_id INT NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        is_enabled BIT NOT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_email_preferences_created DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_email_preferences PRIMARY KEY CLUSTERED (owner_user_id, event_type),
        CONSTRAINT FK_TM_email_preferences_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_email_preferences_event CHECK (
            event_type IN (
                'TASK_OVERDUE',
                'TASK_DUE_TODAY',
                'HIGH_PRIORITY_TASK_DUE_TOMORROW',
                'CURRENT_CYCLE_ENDING_SOON',
                'CURRENT_CYCLE_PAST_END',
                'KPI_BELOW_TARGET',
                'KPI_MEASUREMENT_DUE'
            )
        )
    );

    CREATE INDEX IX_TM_email_preferences_owner_enabled
        ON dbo.TM_email_preferences (owner_user_id, is_enabled, event_type);

    CREATE TABLE dbo.TM_email_verifications (
        owner_user_id INT NOT NULL,
        pending_email NVARCHAR(320) NULL,
        pending_email_normalized NVARCHAR(320) NULL,
        code_hash CHAR(64) NULL,
        expires_at_utc DATETIME2(3) NULL,
        attempt_count SMALLINT NOT NULL
            CONSTRAINT DF_TM_email_verifications_attempts DEFAULT (0),
        resend_available_at_utc DATETIME2(3) NULL,
        window_started_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_email_verifications_window DEFAULT (SYSUTCDATETIME()),
        send_count SMALLINT NOT NULL
            CONSTRAINT DF_TM_email_verifications_send_count DEFAULT (0),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_email_verifications_created DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_email_verifications PRIMARY KEY CLUSTERED (owner_user_id),
        CONSTRAINT FK_TM_email_verifications_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_email_verifications_pending_state CHECK (
            (
                pending_email IS NULL
                AND pending_email_normalized IS NULL
                AND code_hash IS NULL
                AND expires_at_utc IS NULL
                AND resend_available_at_utc IS NULL
            )
            OR
            (
                pending_email IS NOT NULL
                AND pending_email_normalized IS NOT NULL
                AND code_hash IS NOT NULL
                AND expires_at_utc IS NOT NULL
                AND resend_available_at_utc IS NOT NULL
            )
        ),
        CONSTRAINT CK_TM_email_verifications_attempts CHECK (attempt_count >= 0 AND attempt_count <= 5),
        CONSTRAINT CK_TM_email_verifications_send_count CHECK (send_count >= 0 AND send_count <= 5)
    );

    CREATE UNIQUE INDEX UX_TM_email_verifications_pending
        ON dbo.TM_email_verifications (pending_email_normalized)
        WHERE pending_email_normalized IS NOT NULL;

    INSERT dbo.TM_user_email_settings (owner_user_id)
    SELECT access.portal_user_id
    FROM dbo.TM_user_access AS access;

    INSERT dbo.TM_email_preferences (owner_user_id, event_type, is_enabled)
    SELECT access.portal_user_id, defaults.event_type, defaults.is_enabled
    FROM dbo.TM_user_access AS access
    CROSS JOIN (
        VALUES
            ('TASK_OVERDUE', CAST(1 AS BIT)),
            ('TASK_DUE_TODAY', CAST(0 AS BIT)),
            ('HIGH_PRIORITY_TASK_DUE_TOMORROW', CAST(1 AS BIT)),
            ('CURRENT_CYCLE_ENDING_SOON', CAST(1 AS BIT)),
            ('CURRENT_CYCLE_PAST_END', CAST(1 AS BIT)),
            ('KPI_BELOW_TARGET', CAST(1 AS BIT)),
            ('KPI_MEASUREMENT_DUE', CAST(1 AS BIT))
    ) AS defaults(event_type, is_enabled);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
