SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
        THROW 52801, 'Required TaskHub access table dbo.TM_user_access does not exist.', 1;

    IF OBJECT_ID(N'dbo.TM_procurement_activity', N'U') IS NULL
        THROW 52802, 'Procurement Phase 1 migration must be applied before Phase 2.', 1;

    IF OBJECT_ID(N'QNHDB.dbo.TM_INV_Items_Import', N'U') IS NULL
        THROW 52803, 'Shared Item table [QNHDB].[dbo].[TM_INV_Items_Import] must exist before Procurement Phase 2 is applied.', 1;

    IF COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'SOURCE_ROWID') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'ITEM_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'ITEM_CODE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'ITEM_NAME') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'ITEM_PARENT_NAME') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'CATEGORY_NAME') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'UNIT') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'ITEM_PIECE_UNIT') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'FACTOR') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'IS_STOCK_ITEM') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'ITEM_STATUS') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_INV_Items_Import', N'IS_ASSET') IS NULL
        THROW 52804, '[QNHDB].[dbo].[TM_INV_Items_Import] is missing one or more required Item columns for Procurement Phase 2.', 1;

    IF EXISTS (
        SELECT 1
        FROM [QNHDB].[dbo].[TM_INV_Items_Import]
        GROUP BY ITEM_NO
        HAVING COUNT_BIG(1) > 1
    )
        THROW 52805, '[QNHDB].[dbo].[TM_INV_Items_Import] contains duplicate ITEM_NO values. Fix the source table before applying this migration.', 1;

    IF OBJECT_ID(N'dbo.TM_procurement_saved_views', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.TM_procurement_saved_views (
            id BIGINT IDENTITY(1, 1) NOT NULL,
            owner_user_id INT NOT NULL,
            view_name NVARCHAR(120) NOT NULL,
            view_config_json NVARCHAR(MAX) NOT NULL,
            is_default BIT NOT NULL CONSTRAINT DF_TM_procurement_saved_views_is_default DEFAULT (0),
            created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_procurement_saved_views_created_at_utc DEFAULT (SYSUTCDATETIME()),
            updated_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_procurement_saved_views_updated_at_utc DEFAULT (SYSUTCDATETIME()),
            row_version ROWVERSION NOT NULL,

            CONSTRAINT PK_TM_procurement_saved_views PRIMARY KEY CLUSTERED (id),
            CONSTRAINT FK_TM_procurement_saved_views_owner
                FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
            CONSTRAINT CK_TM_procurement_saved_views_name
                CHECK (LEN(LTRIM(RTRIM(view_name))) BETWEEN 1 AND 120),
            CONSTRAINT CK_TM_procurement_saved_views_config_json
                CHECK (ISJSON(view_config_json) = 1)
        );

        CREATE INDEX IX_TM_procurement_saved_views_owner_name
            ON dbo.TM_procurement_saved_views (owner_user_id, view_name, id)
            INCLUDE (is_default, updated_at_utc);

        CREATE UNIQUE INDEX UX_TM_procurement_saved_views_one_default
            ON dbo.TM_procurement_saved_views (owner_user_id)
            WHERE is_default = 1;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
