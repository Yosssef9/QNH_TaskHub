USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_notifications', N'U') IS NULL
    BEGIN
        THROW 50901, 'TaskHub migrations 001-008 must be applied first.', 1;
    END;

    IF OBJECT_ID(N'dbo.TM_email_outbox', N'U') IS NOT NULL
    BEGIN
        THROW 50902, 'Email outbox table already exists. Migration was not applied.', 1;
    END;

    CREATE TABLE dbo.TM_email_outbox (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NULL,
        recipient_email NVARCHAR(320) NOT NULL,
        recipient_name NVARCHAR(200) NULL,
        language_code CHAR(2) NOT NULL,
        template_key VARCHAR(80) NOT NULL,
        template_payload_json NVARCHAR(MAX) NOT NULL,
        dedupe_key VARCHAR(250) NOT NULL,
        status VARCHAR(20) NOT NULL
            CONSTRAINT DF_TM_email_outbox_status DEFAULT ('PENDING'),
        attempt_count SMALLINT NOT NULL
            CONSTRAINT DF_TM_email_outbox_attempt_count DEFAULT (0),
        next_attempt_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_email_outbox_next_attempt DEFAULT (SYSUTCDATETIME()),
        locked_at_utc DATETIME2(3) NULL,
        locked_by VARCHAR(120) NULL,
        provider_message_id NVARCHAR(255) NULL,
        last_error NVARCHAR(2000) NULL,
        sent_at_utc DATETIME2(3) NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_email_outbox_created DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_email_outbox PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_email_outbox_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT UQ_TM_email_outbox_dedupe UNIQUE (dedupe_key),
        CONSTRAINT CK_TM_email_outbox_language
            CHECK (language_code IN ('ar', 'en')),
        CONSTRAINT CK_TM_email_outbox_template
            CHECK (LEN(LTRIM(RTRIM(template_key))) > 0),
        CONSTRAINT CK_TM_email_outbox_payload
            CHECK (ISJSON(template_payload_json) = 1),
        CONSTRAINT CK_TM_email_outbox_status
            CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
        CONSTRAINT CK_TM_email_outbox_attempt_count
            CHECK (attempt_count >= 0),
        CONSTRAINT CK_TM_email_outbox_recipient
            CHECK (LEN(LTRIM(RTRIM(recipient_email))) > 3),
        CONSTRAINT CK_TM_email_outbox_lock_state CHECK (
            (status = 'PROCESSING' AND locked_at_utc IS NOT NULL AND locked_by IS NOT NULL)
            OR
            (status <> 'PROCESSING' AND locked_at_utc IS NULL AND locked_by IS NULL)
        ),
        CONSTRAINT CK_TM_email_outbox_sent_state CHECK (
            (status = 'SENT' AND sent_at_utc IS NOT NULL)
            OR
            (status <> 'SENT' AND sent_at_utc IS NULL)
        )
    );

    CREATE INDEX IX_TM_email_outbox_worker
        ON dbo.TM_email_outbox (status, next_attempt_at_utc, id)
        INCLUDE (attempt_count, locked_at_utc, locked_by, template_key);

    CREATE INDEX IX_TM_email_outbox_owner_created
        ON dbo.TM_email_outbox (owner_user_id, created_at_utc DESC, id DESC)
        INCLUDE (recipient_email, template_key, status, attempt_count, sent_at_utc)
        WHERE owner_user_id IS NOT NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
