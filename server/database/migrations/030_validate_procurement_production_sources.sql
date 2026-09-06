SET NOCOUNT ON;
SET XACT_ABORT ON;

/*
  Production Procurement source-object preflight.

  This migration does not create or modify the externally managed Oracle/CarWare
  import tables or procedures. It verifies that the final production objects exist
  and that TaskHub's approved read/write assumptions match the physical schema.
*/
BEGIN TRY
    IF DB_ID(N'QNHDB') IS NULL
        THROW 53001, 'Required source database QNHDB does not exist or is not visible to the migration principal.', 1;

    IF OBJECT_ID(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'U') IS NULL
        THROW 53002, 'Required Supplier source table QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT does not exist.', 1;

    IF OBJECT_ID(N'QNHDB.dbo.TM_INV_Items_Import', N'U') IS NULL
        THROW 53003, 'Required Item source table QNHDB.dbo.TM_INV_Items_Import does not exist.', 1;

    IF OBJECT_ID(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'U') IS NULL
        THROW 53004, 'Required purchase Transaction source table QNHDB.dbo.TM_Purchase_Invoice_Details_Import does not exist.', 1;

    IF OBJECT_ID(N'QNHDB.dbo.SP_Import_APS_SUPPLIERS', N'P') IS NULL
        THROW 53005, 'Required Supplier sync procedure QNHDB.dbo.SP_Import_APS_SUPPLIERS does not exist.', 1;

    IF OBJECT_ID(N'QNHDB.dbo.SP_Import_INV_Items_All', N'P') IS NULL
        THROW 53006, 'Required Item sync procedure QNHDB.dbo.SP_Import_INV_Items_All does not exist.', 1;

    IF OBJECT_ID(N'QNHDB.dbo.SP_Import_Purchase_Invoices_All', N'P') IS NULL
        THROW 53007, 'Required Transaction sync procedure QNHDB.dbo.SP_Import_Purchase_Invoices_All does not exist.', 1;

    /* Supplier columns used by shared Supplier CRUD and Contract lookups. */
    IF COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'SUPPLIER_ID') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'SUPPLIER_CODE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'MANUAL_FILE_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'SUPPLIER_NAME') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'SUPPLIER_NAME_S') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'TAX_REGISTRATION_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'COUNTRY_NAME') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'CITY_NAME') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'CURRENCY') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'CONTACT_JOB_TEL') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'EXTENSION_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'MOBILE_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'HOME_PHONE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'EMAIL') IS NULL
        THROW 53008, 'Supplier source table is missing one or more columns required by TaskHub Procurement.', 1;

    /* Item columns used by shared Item CRUD and item analytics presentation. */
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
        THROW 53009, 'Item source table is missing one or more columns required by TaskHub Procurement.', 1;

    /* Transaction columns actually read by the analytics engine. */
    IF COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'SOURCE_ROWID') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'DELIVERY_NOTE_DATE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'INVOICE_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'VENDOR_INVOICE_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'VENDOR_INVOICE_DATE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'SUPPLIER_ID') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'SUPPLIER_CODE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'SUPPLIER_NAME_EN') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'CURRENCY_CODE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'INV_VOUCHER_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'CONFIRM_DATE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'ORDER_ID') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'BILL_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'BILL_DATE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'ITEM_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'ITEM_CODE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'ITEM_DESC') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'UNIT_NAME_EN') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'QTY') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'BONUS_QTY') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'UNIT_COST') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'LOT_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'EXPIRY_DATE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'STATUS_CODE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'STATUS_NAME_EN') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_Purchase_Invoice_Details_Import', N'INVOICE_STATUS') IS NULL
        THROW 53010, 'Transaction source table is missing one or more columns required by TaskHub Procurement analytics.', 1;

    IF EXISTS (
        SELECT 1
        FROM [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT]
        GROUP BY SUPPLIER_ID
        HAVING COUNT_BIG(1) > 1
    )
        THROW 53011, 'Supplier source contains duplicate SUPPLIER_ID values.', 1;

    IF EXISTS (
        SELECT 1
        FROM [QNHDB].[dbo].[TM_INV_Items_Import]
        GROUP BY ITEM_NO
        HAVING COUNT_BIG(1) > 1
    )
        THROW 53012, 'Item source contains duplicate ITEM_NO values.', 1;

    IF EXISTS (
        SELECT SOURCE_ROWID
        FROM [QNHDB].[dbo].[TM_Purchase_Invoice_Details_Import]
        WHERE SOURCE_ROWID IS NOT NULL
        GROUP BY SOURCE_ROWID
        HAVING COUNT_BIG(1) > 1
    )
        THROW 53013, 'Transaction source contains duplicate SOURCE_ROWID values; deterministic transaction ordering cannot be guaranteed.', 1;

    /*
      Manual Supplier writes cover every Supplier source column TaskHub knows about.
      Fail deployment if the physical table adds another required/no-default column.
    */
    IF EXISTS (
        SELECT 1
        FROM [QNHDB].sys.columns AS c
        LEFT JOIN [QNHDB].sys.default_constraints AS dc
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE c.object_id = OBJECT_ID(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT')
          AND c.is_nullable = 0
          AND c.is_identity = 0
          AND c.is_computed = 0
          AND c.system_type_id <> 189
          AND dc.object_id IS NULL
          AND c.name NOT IN (
            N'SUPPLIER_ID', N'SUPPLIER_CODE', N'MANUAL_FILE_NO', N'SUPPLIER_NAME', N'SUPPLIER_NAME_S',
            N'TAX_REGISTRATION_NO', N'COUNTRY_NAME', N'CITY_NAME', N'CURRENCY', N'CONTACT_JOB_TEL',
            N'EXTENSION_NO', N'MOBILE_NO', N'HOME_PHONE', N'EMAIL'
          )
    )
        THROW 53014, 'Supplier source has a required/no-default column that TaskHub manual Supplier creation does not populate.', 1;

    /* Manual Item creation writes these fields, including SOURCE_ROWID. */
    IF EXISTS (
        SELECT 1
        FROM [QNHDB].sys.columns AS c
        LEFT JOIN [QNHDB].sys.default_constraints AS dc
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE c.object_id = OBJECT_ID(N'QNHDB.dbo.TM_INV_Items_Import')
          AND c.is_nullable = 0
          AND c.is_identity = 0
          AND c.is_computed = 0
          AND c.system_type_id <> 189
          AND dc.object_id IS NULL
          AND c.name NOT IN (
            N'SOURCE_ROWID', N'ITEM_NO', N'ITEM_CODE', N'ITEM_NAME', N'ITEM_PARENT_NAME', N'CATEGORY_NAME',
            N'UNIT', N'ITEM_PIECE_UNIT', N'FACTOR', N'IS_STOCK_ITEM', N'ITEM_STATUS', N'IS_ASSET'
          )
    )
        THROW 53015, 'Item source has a required/no-default column that TaskHub manual Item creation does not populate.', 1;

    /*
      Upgrade bridge for environments that already applied Procurement Phases 1/2
      while the temporary placeholder tables were still configured. Preserve IDs so
      existing Contracts, Saved Views, and Price Quotes continue resolving correctly.
      The legacy placeholder tables are deliberately retained; nothing is deleted.
    */
    IF OBJECT_ID(N'dbo.TM_suppliers', N'U') IS NOT NULL
    BEGIN
        INSERT INTO [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT] (
            SUPPLIER_ID,
            SUPPLIER_CODE,
            MANUAL_FILE_NO,
            SUPPLIER_NAME,
            SUPPLIER_NAME_S,
            TAX_REGISTRATION_NO,
            COUNTRY_NAME,
            CITY_NAME,
            CURRENCY,
            CONTACT_JOB_TEL,
            EXTENSION_NO,
            MOBILE_NO,
            HOME_PHONE,
            EMAIL
        )
        SELECT
            legacy.SUPPLIER_ID,
            legacy.SUPPLIER_CODE,
            legacy.MANUAL_FILE_NO,
            legacy.SUPPLIER_NAME,
            legacy.SUPPLIER_NAME_S,
            legacy.TAX_REGISTRATION_NO,
            legacy.COUNTRY_NAME,
            legacy.CITY_NAME,
            legacy.CURRENCY,
            legacy.CONTACT_JOB_TEL,
            legacy.EXTENSION_NO,
            legacy.MOBILE_NO,
            legacy.HOME_PHONE,
            legacy.EMAIL
        FROM dbo.TM_suppliers AS legacy
        WHERE NOT EXISTS (
            SELECT 1
            FROM [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT] AS production
            WHERE CONVERT(BIGINT, production.SUPPLIER_ID) = CONVERT(BIGINT, legacy.SUPPLIER_ID)
        );
    END;

    IF OBJECT_ID(N'dbo.TM_items', N'U') IS NOT NULL
    BEGIN
        INSERT INTO [QNHDB].[dbo].[TM_INV_Items_Import] (
            SOURCE_ROWID,
            ITEM_NO,
            ITEM_CODE,
            ITEM_NAME,
            ITEM_PARENT_NAME,
            CATEGORY_NAME,
            UNIT,
            ITEM_PIECE_UNIT,
            FACTOR,
            IS_STOCK_ITEM,
            ITEM_STATUS,
            IS_ASSET
        )
        SELECT
            COALESCE(
                NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), legacy.ITEM_CODE))), N''),
                N'USR-ITEM-' + RIGHT(N'000000' + CONVERT(NVARCHAR(30), ABS(CONVERT(BIGINT, legacy.ITEM_NO))), 6)
            ),
            legacy.ITEM_NO,
            legacy.ITEM_CODE,
            legacy.ITEM_NAME,
            legacy.ITEM_PARENT_NAME,
            legacy.CATEGORY_NAME,
            legacy.UNIT,
            legacy.ITEM_PIECE_UNIT,
            legacy.FACTOR,
            legacy.IS_STOCK_ITEM,
            legacy.ITEM_STATUS,
            legacy.IS_ASSET
        FROM dbo.TM_items AS legacy
        WHERE NOT EXISTS (
            SELECT 1
            FROM [QNHDB].[dbo].[TM_INV_Items_Import] AS production
            WHERE CONVERT(BIGINT, production.ITEM_NO) = CONVERT(BIGINT, legacy.ITEM_NO)
        );
    END;

    IF EXISTS (
        SELECT SOURCE_ROWID
        FROM [QNHDB].[dbo].[TM_Purchase_Invoice_Details_Import]
        WHERE SOURCE_ROWID IS NOT NULL
        GROUP BY SOURCE_ROWID
        HAVING COUNT_BIG(1) > 1
    )
        THROW 53016, 'Transaction source contains duplicate SOURCE_ROWID values after production reconciliation.', 1;

    PRINT 'Procurement production source-object validation and legacy reconciliation passed.';
END TRY
BEGIN CATCH
    THROW;
END CATCH;
GO
