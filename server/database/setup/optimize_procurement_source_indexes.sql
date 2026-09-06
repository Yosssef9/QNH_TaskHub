/*
  QNH TaskHub Procurement - optional source-table performance index.

  Phase 1 Performance V2 purpose:
  - speed the visible-Item price-summary batch and Item detail history;
  - seek by ITEM_NO first, then keep recent DELIVERY_NOTE_DATE rows together;
  - retain SUPPLIER_ID as the comparison/grouping key;
  - cover the core UNIT_COST / currency / UOM / SOURCE_ROWID values without
    making them index-key columns.

  This is intentionally a setup/operations script, NOT a TaskHub migration,
  because QNHDB.dbo.TM_Purchase_Invoice_Details_Import is externally managed.

  Review existing indexes and execute during an appropriate maintenance window.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

USE [QNHDB];
GO

IF OBJECT_ID(N'dbo.TM_Purchase_Invoice_Details_Import', N'U') IS NULL
    THROW 53101, 'QNHDB.dbo.TM_Purchase_Invoice_Details_Import does not exist.', 1;

IF COL_LENGTH(N'dbo.TM_Purchase_Invoice_Details_Import', N'ITEM_NO') IS NULL
   OR COL_LENGTH(N'dbo.TM_Purchase_Invoice_Details_Import', N'SUPPLIER_ID') IS NULL
   OR COL_LENGTH(N'dbo.TM_Purchase_Invoice_Details_Import', N'DELIVERY_NOTE_DATE') IS NULL
   OR COL_LENGTH(N'dbo.TM_Purchase_Invoice_Details_Import', N'UNIT_COST') IS NULL
   OR COL_LENGTH(N'dbo.TM_Purchase_Invoice_Details_Import', N'CURRENCY_CODE') IS NULL
   OR COL_LENGTH(N'dbo.TM_Purchase_Invoice_Details_Import', N'UNIT_NAME_EN') IS NULL
   OR COL_LENGTH(N'dbo.TM_Purchase_Invoice_Details_Import', N'SOURCE_ROWID') IS NULL
BEGIN
    THROW 53102, 'One or more required Procurement transaction columns are missing.', 1;
END;

DECLARE @tableObjectId INT = OBJECT_ID(N'dbo.TM_Purchase_Invoice_Details_Import', N'U');
DECLARE @targetIndex SYSNAME = N'IX_TM_Purchase_Invoice_Details_Import_ItemSupplierDate';
DECLARE @targetIndexId INT = (
    SELECT index_id
    FROM sys.indexes
    WHERE object_id = @tableObjectId
      AND name = @targetIndex
);

/*
  If the TaskHub-owned index already has the Phase 1 V2 definition, do nothing.
  This checks the three ordered key columns plus the four required included columns.
*/
DECLARE @targetIsCurrent BIT = 0;
IF @targetIndexId IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sys.index_columns AS ic
        INNER JOIN sys.columns AS c
          ON c.object_id = ic.object_id
         AND c.column_id = ic.column_id
        WHERE ic.object_id = @tableObjectId
          AND ic.index_id = @targetIndexId
          AND ic.key_ordinal = 1
          AND c.name = N'ITEM_NO'
          AND ic.is_descending_key = 0
    )
    AND EXISTS (
        SELECT 1
        FROM sys.index_columns AS ic
        INNER JOIN sys.columns AS c
          ON c.object_id = ic.object_id
         AND c.column_id = ic.column_id
        WHERE ic.object_id = @tableObjectId
          AND ic.index_id = @targetIndexId
          AND ic.key_ordinal = 2
          AND c.name = N'DELIVERY_NOTE_DATE'
          AND ic.is_descending_key = 1
    )
    AND EXISTS (
        SELECT 1
        FROM sys.index_columns AS ic
        INNER JOIN sys.columns AS c
          ON c.object_id = ic.object_id
         AND c.column_id = ic.column_id
        WHERE ic.object_id = @tableObjectId
          AND ic.index_id = @targetIndexId
          AND ic.key_ordinal = 3
          AND c.name = N'SUPPLIER_ID'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM sys.index_columns
        WHERE object_id = @tableObjectId
          AND index_id = @targetIndexId
          AND key_ordinal > 3
    )
    AND NOT EXISTS (
        SELECT required.column_name
        FROM (VALUES
          (N'UNIT_COST'),
          (N'CURRENCY_CODE'),
          (N'UNIT_NAME_EN'),
          (N'SOURCE_ROWID')
        ) AS required(column_name)
        WHERE NOT EXISTS (
            SELECT 1
            FROM sys.index_columns AS ic
            INNER JOIN sys.columns AS c
              ON c.object_id = ic.object_id
             AND c.column_id = ic.column_id
            WHERE ic.object_id = @tableObjectId
              AND ic.index_id = @targetIndexId
              AND ic.is_included_column = 1
              AND c.name = required.column_name
        )
    )
    BEGIN
        SET @targetIsCurrent = 1;
    END;
END;

IF @targetIsCurrent = 1
BEGIN
    PRINT 'Procurement Item price index already matches Phase 1 Performance V2; no change made.';
END
ELSE IF @targetIndexId IS NOT NULL
BEGIN
    PRINT 'Rebuilding the existing TaskHub Procurement Item price index with the Phase 1 Performance V2 key order...';

    CREATE NONCLUSTERED INDEX IX_TM_Purchase_Invoice_Details_Import_ItemSupplierDate
        ON dbo.TM_Purchase_Invoice_Details_Import
        (
            ITEM_NO,
            DELIVERY_NOTE_DATE DESC,
            SUPPLIER_ID
        )
        INCLUDE
        (
            UNIT_COST,
            CURRENCY_CODE,
            UNIT_NAME_EN,
            SOURCE_ROWID
        )
        WITH (DROP_EXISTING = ON);
END
ELSE
BEGIN
    PRINT 'Creating the TaskHub Procurement Item price index...';

    CREATE NONCLUSTERED INDEX IX_TM_Purchase_Invoice_Details_Import_ItemSupplierDate
        ON dbo.TM_Purchase_Invoice_Details_Import
        (
            ITEM_NO,
            DELIVERY_NOTE_DATE DESC,
            SUPPLIER_ID
        )
        INCLUDE
        (
            UNIT_COST,
            CURRENCY_CODE,
            UNIT_NAME_EN,
            SOURCE_ROWID
        );
END;
GO
