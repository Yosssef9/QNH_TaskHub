SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_contracts', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_contract_activity', N'U') IS NULL
    BEGIN
        THROW 51601, 'Contracts core schema is required before Contract Files can be added.', 1;
    END;

    IF OBJECT_ID(N'dbo.TM_contract_attachments', N'U') IS NOT NULL
    BEGIN
        THROW 51602, 'Contract attachment schema already exists. Migration was not applied.', 1;
    END;

    CREATE TABLE dbo.TM_contract_attachments (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_TM_contract_attachments_id DEFAULT (NEWSEQUENTIALID()),
        owner_user_id INT NOT NULL,
        contract_id BIGINT NOT NULL,
        original_file_name NVARCHAR(260) NOT NULL,
        storage_key VARCHAR(500) NOT NULL,
        mime_type VARCHAR(255) NOT NULL,
        file_extension VARCHAR(20) NOT NULL,
        size_bytes BIGINT NOT NULL,
        uploaded_by_user_id INT NOT NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_contract_attachments_is_active DEFAULT (1),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_contract_attachments_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_contract_attachments PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_contract_attachments_storage_key UNIQUE (storage_key),
        CONSTRAINT FK_TM_contract_attachments_contract_owner
            FOREIGN KEY (contract_id, owner_user_id)
            REFERENCES dbo.TM_contracts (id, owner_user_id),
        CONSTRAINT FK_TM_contract_attachments_uploader
            FOREIGN KEY (uploaded_by_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_contract_attachments_private_uploader
            CHECK (uploaded_by_user_id = owner_user_id),
        CONSTRAINT CK_TM_contract_attachments_name
            CHECK (LEN(LTRIM(RTRIM(original_file_name))) > 0),
        CONSTRAINT CK_TM_contract_attachments_storage_key
            CHECK (LEN(LTRIM(RTRIM(storage_key))) > 0),
        CONSTRAINT CK_TM_contract_attachments_mime_type
            CHECK (LEN(LTRIM(RTRIM(mime_type))) > 0),
        CONSTRAINT CK_TM_contract_attachments_extension
            CHECK (file_extension IN ('.pdf', '.png', '.jpg', '.jpeg')),
        CONSTRAINT CK_TM_contract_attachments_size
            CHECK (size_bytes > 0 AND size_bytes <= 10485760)
    );

    CREATE INDEX IX_TM_contract_attachments_owner_contract_active_created
        ON dbo.TM_contract_attachments (
            owner_user_id,
            contract_id,
            is_active,
            created_at_utc DESC,
            id
        )
        INCLUDE (original_file_name, mime_type, file_extension, size_bytes);

    ALTER TABLE dbo.TM_contract_activity
        DROP CONSTRAINT CK_TM_contract_activity_type;

    ALTER TABLE dbo.TM_contract_activity
        ADD CONSTRAINT CK_TM_contract_activity_type
        CHECK (
            activity_type IN (
                'CREATED',
                'UPDATED',
                'ARCHIVED',
                'RESTORED',
                'ATTACHMENT_ADDED',
                'ATTACHMENT_REMOVED'
            )
        );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
