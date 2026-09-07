SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
        THROW 53201, 'Required TaskHub access table dbo.TM_user_access does not exist.', 1;

    IF OBJECT_ID(N'dbo.TM_procurement_saved_views', N'U') IS NULL
        THROW 53202, 'Procurement Saved Views must exist before the Excel import foundation is applied.', 1;

    IF OBJECT_ID(N'dbo.TM_price_quotes', N'U') IS NULL
        THROW 53203, 'Price Quotes must exist before the Excel import foundation is applied.', 1;

    IF OBJECT_ID(N'dbo.TM_procurement_import_batches', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.TM_procurement_import_batches (
            id BIGINT IDENTITY(1, 1) NOT NULL,
            owner_user_id INT NOT NULL,

            source_file_name NVARCHAR(260) NOT NULL,
            source_file_sha256 CHAR(64) NOT NULL,
            source_file_size_bytes BIGINT NOT NULL,
            source_sheet_name NVARCHAR(128) NOT NULL,

            target_mode VARCHAR(20) NOT NULL,
            target_saved_view_id BIGINT NOT NULL,
            target_view_name_snapshot NVARCHAR(120) NOT NULL,

            quote_date DATE NOT NULL,
            currency_code NVARCHAR(30) NOT NULL
                CONSTRAINT DF_TM_procurement_import_batches_currency DEFAULT (N'SAR'),

            matched_item_count INT NOT NULL,
            added_item_count INT NOT NULL,
            matched_supplier_count INT NOT NULL,
            added_supplier_count INT NOT NULL,
            created_quote_count INT NOT NULL,
            duplicate_quote_count INT NOT NULL,
            skipped_invalid_count INT NOT NULL,

            import_status VARCHAR(20) NOT NULL
                CONSTRAINT DF_TM_procurement_import_batches_status DEFAULT ('APPLIED'),
            created_at_utc DATETIME2(3) NOT NULL
                CONSTRAINT DF_TM_procurement_import_batches_created_at_utc DEFAULT (SYSUTCDATETIME()),
            row_version ROWVERSION NOT NULL,

            CONSTRAINT PK_TM_procurement_import_batches
                PRIMARY KEY CLUSTERED (id),

            CONSTRAINT FK_TM_procurement_import_batches_owner
                FOREIGN KEY (owner_user_id)
                REFERENCES dbo.TM_user_access (portal_user_id),

            CONSTRAINT CK_TM_procurement_import_batches_file_name
                CHECK (LEN(LTRIM(RTRIM(source_file_name))) BETWEEN 1 AND 260),

            CONSTRAINT CK_TM_procurement_import_batches_file_hash
                CHECK (
                    LEN(source_file_sha256) = 64
                    AND source_file_sha256 NOT LIKE '%[^0-9A-Fa-f]%'
                ),

            CONSTRAINT CK_TM_procurement_import_batches_file_size
                CHECK (source_file_size_bytes > 0),

            CONSTRAINT CK_TM_procurement_import_batches_sheet_name
                CHECK (LEN(LTRIM(RTRIM(source_sheet_name))) BETWEEN 1 AND 128),

            CONSTRAINT CK_TM_procurement_import_batches_target_mode
                CHECK (target_mode IN ('EXISTING_VIEW', 'NEW_VIEW')),

            CONSTRAINT CK_TM_procurement_import_batches_target_view
                CHECK (target_saved_view_id > 0 AND LEN(LTRIM(RTRIM(target_view_name_snapshot))) BETWEEN 1 AND 120),

            CONSTRAINT CK_TM_procurement_import_batches_currency
                CHECK (currency_code = N'SAR'),

            CONSTRAINT CK_TM_procurement_import_batches_counts
                CHECK (
                    matched_item_count >= 0
                    AND added_item_count >= 0
                    AND matched_supplier_count >= 0
                    AND added_supplier_count >= 0
                    AND created_quote_count >= 0
                    AND duplicate_quote_count >= 0
                    AND skipped_invalid_count >= 0
                    AND added_item_count <= matched_item_count
                    AND added_supplier_count <= matched_supplier_count
                ),

            CONSTRAINT CK_TM_procurement_import_batches_status
                CHECK (import_status IN ('APPLIED'))
        );

        CREATE INDEX IX_TM_procurement_import_batches_owner_created
            ON dbo.TM_procurement_import_batches (owner_user_id, created_at_utc DESC, id DESC)
            INCLUDE (
                target_saved_view_id,
                target_view_name_snapshot,
                source_file_name,
                source_sheet_name,
                quote_date,
                created_quote_count,
                duplicate_quote_count,
                skipped_invalid_count
            );

        CREATE INDEX IX_TM_procurement_import_batches_owner_hash
            ON dbo.TM_procurement_import_batches (owner_user_id, source_file_sha256, created_at_utc DESC)
            INCLUDE (target_saved_view_id, source_sheet_name, quote_date, created_quote_count);
    END;

    IF COL_LENGTH(N'dbo.TM_procurement_import_batches', N'source_file_sha256') IS NULL
       OR COL_LENGTH(N'dbo.TM_procurement_import_batches', N'target_saved_view_id') IS NULL
       OR COL_LENGTH(N'dbo.TM_procurement_import_batches', N'created_quote_count') IS NULL
       OR COL_LENGTH(N'dbo.TM_procurement_import_batches', N'row_version') IS NULL
    BEGIN
        THROW 53204, 'dbo.TM_procurement_import_batches exists but does not match the approved Excel import foundation.', 1;
    END;

    IF COL_LENGTH(N'dbo.TM_price_quotes', N'import_batch_id') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_price_quotes
                ADD import_batch_id BIGINT NULL;
        ';
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_price_quotes')
          AND name = N'FK_TM_price_quotes_import_batch'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_price_quotes WITH CHECK
                ADD CONSTRAINT FK_TM_price_quotes_import_batch
                FOREIGN KEY (import_batch_id)
                REFERENCES dbo.TM_procurement_import_batches (id);

            ALTER TABLE dbo.TM_price_quotes
                CHECK CONSTRAINT FK_TM_price_quotes_import_batch;
        ';
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.TM_price_quotes')
          AND name = N'IX_TM_price_quotes_import_batch'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            CREATE INDEX IX_TM_price_quotes_import_batch
                ON dbo.TM_price_quotes (import_batch_id, id)
                INCLUDE (owner_user_id, item_id, supplier_id, quote_date, quoted_unit_cost, unit_name)
                WHERE import_batch_id IS NOT NULL;
        ';
    END;

    COMMIT TRANSACTION;

    PRINT 'Procurement Excel import foundation created successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
