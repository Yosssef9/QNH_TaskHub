SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
        THROW 52901, 'Required TaskHub access table dbo.TM_user_access does not exist.', 1;

    IF OBJECT_ID(N'dbo.TM_procurement_activity', N'U') IS NULL
        THROW 52902, 'Procurement foundation migration must be applied before Price Quotes.', 1;

    IF OBJECT_ID(N'dbo.TM_price_quotes', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.TM_price_quotes (
            id BIGINT IDENTITY(1, 1) NOT NULL,
            owner_user_id INT NOT NULL,
            item_id BIGINT NOT NULL,
            supplier_id BIGINT NOT NULL,
            quote_date DATE NOT NULL,
            quoted_unit_cost DECIMAL(19, 6) NOT NULL,
            currency_code NVARCHAR(30) NOT NULL,
            unit_name NVARCHAR(100) NOT NULL,
            quote_number NVARCHAR(120) NULL,
            notes NVARCHAR(2000) NULL,
            is_active BIT NOT NULL CONSTRAINT DF_TM_price_quotes_is_active DEFAULT (1),
            created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_price_quotes_created_at_utc DEFAULT (SYSUTCDATETIME()),
            created_by_user_id INT NOT NULL,
            updated_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_price_quotes_updated_at_utc DEFAULT (SYSUTCDATETIME()),
            updated_by_user_id INT NOT NULL,
            row_version ROWVERSION NOT NULL,

            CONSTRAINT PK_TM_price_quotes PRIMARY KEY CLUSTERED (id),
            CONSTRAINT FK_TM_price_quotes_owner
                FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
            CONSTRAINT FK_TM_price_quotes_created_by
                FOREIGN KEY (created_by_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
            CONSTRAINT FK_TM_price_quotes_updated_by
                FOREIGN KEY (updated_by_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
            CONSTRAINT CK_TM_price_quotes_unit_cost CHECK (quoted_unit_cost > 0),
            CONSTRAINT CK_TM_price_quotes_currency CHECK (LEN(LTRIM(RTRIM(currency_code))) BETWEEN 1 AND 30),
            CONSTRAINT CK_TM_price_quotes_unit CHECK (LEN(LTRIM(RTRIM(unit_name))) BETWEEN 1 AND 100)
        );

        CREATE INDEX IX_TM_price_quotes_owner_date
            ON dbo.TM_price_quotes (owner_user_id, quote_date DESC, id DESC)
            INCLUDE (item_id, supplier_id, quoted_unit_cost, currency_code, unit_name, is_active);

        CREATE INDEX IX_TM_price_quotes_owner_item_supplier_date
            ON dbo.TM_price_quotes (owner_user_id, item_id, supplier_id, quote_date DESC, id DESC)
            INCLUDE (quoted_unit_cost, currency_code, unit_name, is_active, quote_number);

        CREATE INDEX IX_TM_price_quotes_owner_active_item
            ON dbo.TM_price_quotes (owner_user_id, is_active, item_id, supplier_id)
            INCLUDE (quote_date, quoted_unit_cost, currency_code, unit_name);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
