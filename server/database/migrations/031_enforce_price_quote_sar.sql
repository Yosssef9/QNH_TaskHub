SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_price_quotes', N'U') IS NULL
        THROW 53101, 'Price Quote table dbo.TM_price_quotes does not exist. Apply migration 029 first.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.TM_price_quotes
        WHERE LTRIM(RTRIM(currency_code)) <> N'SAR'
    )
        THROW 53102, 'TM_price_quotes contains a non-SAR currency. Review those rows before enforcing the SAR-only rule.', 1;

    IF OBJECT_ID(N'dbo.DF_TM_price_quotes_currency_SAR', N'D') IS NULL
    BEGIN
        ALTER TABLE dbo.TM_price_quotes
            ADD CONSTRAINT DF_TM_price_quotes_currency_SAR DEFAULT (N'SAR') FOR currency_code;
    END;

    IF OBJECT_ID(N'dbo.CK_TM_price_quotes_currency_SAR', N'C') IS NULL
    BEGIN
        ALTER TABLE dbo.TM_price_quotes WITH CHECK
            ADD CONSTRAINT CK_TM_price_quotes_currency_SAR CHECK (currency_code = N'SAR');
        ALTER TABLE dbo.TM_price_quotes CHECK CONSTRAINT CK_TM_price_quotes_currency_SAR;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
