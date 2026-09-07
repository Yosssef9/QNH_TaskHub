import { getDatabasePool, sql } from "../../database/sql.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
import type {
  ImportAllowedUnitRecord,
  ImportMasterRecord,
  ImportQuoteCandidate,
  ImportQuoteHistoryRecord,
  ImportSupplierNameMatchRecord,
  ProcurementImportBatchInput,
  ProcurementImportedQuoteCandidate,
} from "./procurement-imports.types.js";

const itemsTable = PROCUREMENT_DB_OBJECTS.itemsTable;
const suppliersTable = PROCUREMENT_DB_OBJECTS.suppliersTable;
const transactionsTable = PROCUREMENT_DB_OBJECTS.transactionsTable;

export async function resolveItemsByCodes(codes: string[]): Promise<ImportMasterRecord[]> {
  if (codes.length === 0) return [];
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("codesJson", sql.NVarChar(sql.MAX), JSON.stringify(codes))
    .query<ImportMasterRecord>(`
      SELECT
        CONVERT(BIGINT, item.ITEM_NO) AS id,
        LTRIM(RTRIM(CONVERT(NVARCHAR(100), item.ITEM_CODE))) AS code,
        COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), item.ITEM_NAME))), N''), N'—') AS name
      FROM ${itemsTable} AS item
      INNER JOIN OPENJSON(@codesJson) WITH (code NVARCHAR(100) '$') AS requested
        ON UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(100), item.ITEM_CODE)))) COLLATE DATABASE_DEFAULT
         = UPPER(LTRIM(RTRIM(requested.code))) COLLATE DATABASE_DEFAULT
      WHERE NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), item.ITEM_CODE))), N'') IS NOT NULL
      ORDER BY item.ITEM_CODE, item.ITEM_NO;
    `);
  return result.recordset;
}

export async function resolveSuppliersByCodes(codes: string[]): Promise<ImportMasterRecord[]> {
  if (codes.length === 0) return [];
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("codesJson", sql.NVarChar(sql.MAX), JSON.stringify(codes))
    .query<ImportMasterRecord>(`
      SELECT
        CONVERT(BIGINT, supplier.SUPPLIER_ID) AS id,
        LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))) AS code,
        COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME))), N''), N'—') AS name
      FROM ${suppliersTable} AS supplier
      INNER JOIN OPENJSON(@codesJson) WITH (code NVARCHAR(100) '$') AS requested
        ON UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE)))) COLLATE DATABASE_DEFAULT
         = UPPER(LTRIM(RTRIM(requested.code))) COLLATE DATABASE_DEFAULT
      WHERE NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))), N'') IS NOT NULL
      ORDER BY supplier.SUPPLIER_CODE, supplier.SUPPLIER_ID;
    `);
  return result.recordset;
}

export async function resolveSuppliersByNames(names: string[]): Promise<ImportSupplierNameMatchRecord[]> {
  if (names.length === 0) return [];
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("namesJson", sql.NVarChar(sql.MAX), JSON.stringify(names))
    .query<ImportSupplierNameMatchRecord>(`
      SELECT
        LTRIM(RTRIM(requested.name)) AS requestedName,
        CONVERT(BIGINT, supplier.SUPPLIER_ID) AS id,
        LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))) AS code,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME))), N''),
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME_S))), N''),
          N'—'
        ) AS name
      FROM ${suppliersTable} AS supplier
      INNER JOIN OPENJSON(@namesJson) WITH (name NVARCHAR(250) '$') AS requested
        ON (
          UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME)))) COLLATE DATABASE_DEFAULT
           = UPPER(LTRIM(RTRIM(requested.name))) COLLATE DATABASE_DEFAULT
          OR UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME_S)))) COLLATE DATABASE_DEFAULT
           = UPPER(LTRIM(RTRIM(requested.name))) COLLATE DATABASE_DEFAULT
        )
      WHERE
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME))), N'') IS NOT NULL
        OR NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME_S))), N'') IS NOT NULL
      ORDER BY requested.name, supplier.SUPPLIER_ID;
    `);
  return result.recordset;
}

export async function listAllowedUnits(itemIds: number[]): Promise<ImportAllowedUnitRecord[]> {
  if (itemIds.length === 0) return [];
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("itemIdsJson", sql.NVarChar(sql.MAX), JSON.stringify(itemIds))
    .query<ImportAllowedUnitRecord>(`
      WITH selected AS (
        SELECT id
        FROM OPENJSON(@itemIdsJson) WITH (id BIGINT '$')
      ),
      unit_values AS (
        SELECT
          CONVERT(BIGINT, item.ITEM_NO) AS itemId,
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), item.UNIT))), N'') AS unitName
        FROM ${itemsTable} AS item
        INNER JOIN selected ON selected.id = CONVERT(BIGINT, item.ITEM_NO)

        UNION ALL

        SELECT
          CONVERT(BIGINT, item.ITEM_NO) AS itemId,
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), item.ITEM_PIECE_UNIT))), N'') AS unitName
        FROM ${itemsTable} AS item
        INNER JOIN selected ON selected.id = CONVERT(BIGINT, item.ITEM_NO)

        UNION ALL

        SELECT
          TRY_CONVERT(BIGINT, tx.ITEM_NO) AS itemId,
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N'') AS unitName
        FROM ${transactionsTable} AS tx
        INNER JOIN selected ON selected.id = TRY_CONVERT(BIGINT, tx.ITEM_NO)
        WHERE UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE)))) COLLATE DATABASE_DEFAULT
            = N'SAR' COLLATE DATABASE_DEFAULT
      )
      SELECT DISTINCT itemId, unitName
      FROM unit_values
      WHERE itemId IS NOT NULL AND unitName IS NOT NULL
      ORDER BY itemId, unitName;
    `);
  return result.recordset;
}

export async function inspectQuoteHistory(
  ownerUserId: number,
  quoteDate: string,
  candidates: ImportQuoteCandidate[],
): Promise<ImportQuoteHistoryRecord[]> {
  if (candidates.length === 0) return [];
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("quoteDate", sql.Date, quoteDate)
    .input("candidatesJson", sql.NVarChar(sql.MAX), JSON.stringify(candidates))
    .query<ImportQuoteHistoryRecord>(`
      WITH candidates AS (
        SELECT
          candidate_key,
          item_id,
          supplier_id,
          unit_name,
          quoted_unit_cost
        FROM OPENJSON(@candidatesJson)
        WITH (
          candidate_key NVARCHAR(100) '$.key',
          item_id BIGINT '$.itemId',
          supplier_id BIGINT '$.supplierId',
          unit_name NVARCHAR(100) '$.unitName',
          quoted_unit_cost DECIMAL(19,6) '$.quotedUnitCost'
        )
      )
      SELECT
        candidate.candidate_key AS [key],
        duplicate_quote.id AS duplicateQuoteId,
        latest_quote.id AS latestQuoteId,
        latest_quote.quote_date AS latestQuoteDate,
        latest_quote.quoted_unit_cost AS latestQuotedUnitCost,
        CASE
          WHEN latest_quote.id IS NULL THEN NULL
          WHEN latest_quote.quoted_unit_cost = candidate.quoted_unit_cost THEN CAST(1 AS BIT)
          ELSE CAST(0 AS BIT)
        END AS latestPriceMatches
      FROM candidates AS candidate
      OUTER APPLY (
        SELECT TOP (1) quote_row.id
        FROM dbo.TM_price_quotes AS quote_row
        WHERE quote_row.owner_user_id = @ownerUserId
          AND quote_row.item_id = candidate.item_id
          AND quote_row.supplier_id = candidate.supplier_id
          AND quote_row.quote_date = @quoteDate
          AND quote_row.currency_code COLLATE DATABASE_DEFAULT = N'SAR' COLLATE DATABASE_DEFAULT
          AND UPPER(LTRIM(RTRIM(quote_row.unit_name))) COLLATE DATABASE_DEFAULT
            = UPPER(LTRIM(RTRIM(candidate.unit_name))) COLLATE DATABASE_DEFAULT
          AND quote_row.quoted_unit_cost = candidate.quoted_unit_cost
        ORDER BY quote_row.id DESC
      ) AS duplicate_quote
      OUTER APPLY (
        SELECT TOP (1)
          quote_row.id,
          quote_row.quote_date,
          quote_row.quoted_unit_cost
        FROM dbo.TM_price_quotes AS quote_row
        WHERE quote_row.owner_user_id = @ownerUserId
          AND quote_row.item_id = candidate.item_id
          AND quote_row.supplier_id = candidate.supplier_id
          AND quote_row.currency_code COLLATE DATABASE_DEFAULT = N'SAR' COLLATE DATABASE_DEFAULT
          AND UPPER(LTRIM(RTRIM(quote_row.unit_name))) COLLATE DATABASE_DEFAULT
            = UPPER(LTRIM(RTRIM(candidate.unit_name))) COLLATE DATABASE_DEFAULT
        ORDER BY quote_row.quote_date DESC, quote_row.id DESC
      ) AS latest_quote;
    `);
  return result.recordset;
}

export async function isApplyFoundationReady(): Promise<boolean> {
  const pool = await getDatabasePool();
  const result = await pool.request().query<{ ready: number }>(`
    SELECT CASE
      WHEN OBJECT_ID(N'dbo.TM_procurement_import_batches', N'U') IS NOT NULL
       AND COL_LENGTH(N'dbo.TM_price_quotes', N'import_batch_id') IS NOT NULL
      THEN 1 ELSE 0
    END AS ready;
  `);
  return Number(result.recordset[0]?.ready ?? 0) === 1;
}

export async function createImportBatch(
  transaction: DatabaseTransaction,
  input: ProcurementImportBatchInput,
): Promise<number> {
  const result = await transaction.request()
    .input("ownerUserId", sql.Int, input.ownerUserId)
    .input("sourceFileName", sql.NVarChar(260), input.sourceFileName)
    .input("sourceFileSha256", sql.Char(64), input.sourceFileSha256)
    .input("sourceFileSizeBytes", sql.BigInt, input.sourceFileSizeBytes)
    .input("sourceSheetName", sql.NVarChar(128), input.sourceSheetName)
    .input("targetMode", sql.VarChar(20), input.targetMode)
    .input("targetSavedViewId", sql.BigInt, input.targetSavedViewId)
    .input("targetViewNameSnapshot", sql.NVarChar(120), input.targetViewNameSnapshot)
    .input("quoteDate", sql.Date, input.quoteDate)
    .input("matchedItemCount", sql.Int, input.matchedItemCount)
    .input("addedItemCount", sql.Int, input.addedItemCount)
    .input("matchedSupplierCount", sql.Int, input.matchedSupplierCount)
    .input("addedSupplierCount", sql.Int, input.addedSupplierCount)
    .input("duplicateQuoteCount", sql.Int, input.duplicateQuoteCount)
    .input("skippedInvalidCount", sql.Int, input.skippedInvalidCount)
    .query<{ id: number | string }>(`
      INSERT INTO dbo.TM_procurement_import_batches (
        owner_user_id,
        source_file_name,
        source_file_sha256,
        source_file_size_bytes,
        source_sheet_name,
        target_mode,
        target_saved_view_id,
        target_view_name_snapshot,
        quote_date,
        currency_code,
        matched_item_count,
        added_item_count,
        matched_supplier_count,
        added_supplier_count,
        created_quote_count,
        duplicate_quote_count,
        skipped_invalid_count,
        import_status
      )
      OUTPUT inserted.id
      VALUES (
        @ownerUserId,
        @sourceFileName,
        @sourceFileSha256,
        @sourceFileSizeBytes,
        @sourceSheetName,
        @targetMode,
        @targetSavedViewId,
        @targetViewNameSnapshot,
        @quoteDate,
        N'SAR',
        @matchedItemCount,
        @addedItemCount,
        @matchedSupplierCount,
        @addedSupplierCount,
        0,
        @duplicateQuoteCount,
        @skippedInvalidCount,
        'APPLIED'
      );
    `);
  return Number(result.recordset[0]?.id);
}

export async function createImportedQuotes(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  importBatchId: number,
  quoteDate: string,
  candidates: ProcurementImportedQuoteCandidate[],
): Promise<number> {
  if (candidates.length === 0) return 0;

  const result = await transaction.request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("importBatchId", sql.BigInt, importBatchId)
    .input("quoteDate", sql.Date, quoteDate)
    .input("candidatesJson", sql.NVarChar(sql.MAX), JSON.stringify(candidates))
    .query<{ createdCount: number | string }>(`
      DECLARE @Inserted TABLE (
        id BIGINT NOT NULL PRIMARY KEY
      );

      WITH candidates AS (
        SELECT DISTINCT
          item_id,
          supplier_id,
          LTRIM(RTRIM(unit_name)) AS unit_name,
          quoted_unit_cost
        FROM OPENJSON(@candidatesJson)
        WITH (
          item_id BIGINT '$.itemId',
          supplier_id BIGINT '$.supplierId',
          unit_name NVARCHAR(100) '$.unitName',
          quoted_unit_cost DECIMAL(19,6) '$.quotedUnitCost'
        )
        WHERE item_id IS NOT NULL
          AND supplier_id IS NOT NULL
          AND NULLIF(LTRIM(RTRIM(unit_name)), N'') IS NOT NULL
          AND quoted_unit_cost > 0
      )
      INSERT INTO dbo.TM_price_quotes (
        owner_user_id,
        item_id,
        supplier_id,
        quote_date,
        quoted_unit_cost,
        currency_code,
        unit_name,
        quote_number,
        notes,
        is_active,
        created_by_user_id,
        updated_by_user_id,
        import_batch_id
      )
      OUTPUT inserted.id INTO @Inserted (id)
      SELECT
        @ownerUserId,
        candidate.item_id,
        candidate.supplier_id,
        @quoteDate,
        candidate.quoted_unit_cost,
        N'SAR',
        candidate.unit_name,
        NULL,
        NULL,
        1,
        @ownerUserId,
        @ownerUserId,
        @importBatchId
      FROM candidates AS candidate
      WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.TM_price_quotes AS existing WITH (UPDLOCK, HOLDLOCK)
        WHERE existing.owner_user_id = @ownerUserId
          AND existing.item_id = candidate.item_id
          AND existing.supplier_id = candidate.supplier_id
          AND existing.quote_date = @quoteDate
          AND existing.currency_code COLLATE DATABASE_DEFAULT = N'SAR' COLLATE DATABASE_DEFAULT
          AND UPPER(LTRIM(RTRIM(existing.unit_name))) COLLATE DATABASE_DEFAULT
            = UPPER(LTRIM(RTRIM(candidate.unit_name))) COLLATE DATABASE_DEFAULT
          AND existing.quoted_unit_cost = candidate.quoted_unit_cost
      );

      INSERT INTO dbo.TM_procurement_activity (
        entity_type,
        entity_key,
        owner_user_id,
        action_type,
        actor_user_id,
        before_values,
        after_values
      )
      SELECT
        'PRICE_QUOTE',
        CONVERT(NVARCHAR(120), inserted.id),
        @ownerUserId,
        'CREATED',
        @ownerUserId,
        NULL,
        CONCAT(
          N'{"source":"EXCEL_IMPORT","importBatchId":',
          CONVERT(NVARCHAR(30), @importBatchId),
          N'}'
        )
      FROM @Inserted AS inserted;

      SELECT COUNT_BIG(1) AS createdCount
      FROM @Inserted;
    `);

  return Number(result.recordset[0]?.createdCount ?? 0);
}

export async function updateImportBatchCounts(
  transaction: DatabaseTransaction,
  importBatchId: number,
  ownerUserId: number,
  createdQuoteCount: number,
  duplicateQuoteCount: number,
): Promise<void> {
  await transaction.request()
    .input("importBatchId", sql.BigInt, importBatchId)
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("createdQuoteCount", sql.Int, createdQuoteCount)
    .input("duplicateQuoteCount", sql.Int, duplicateQuoteCount)
    .query(`
      UPDATE dbo.TM_procurement_import_batches
      SET created_quote_count = @createdQuoteCount,
          duplicate_quote_count = @duplicateQuoteCount
      WHERE id = @importBatchId
        AND owner_user_id = @ownerUserId;
    `);
}

export const procurementImportsRepository = {
  resolveItemsByCodes,
  resolveSuppliersByCodes,
  resolveSuppliersByNames,
  listAllowedUnits,
  inspectQuoteHistory,
  isApplyFoundationReady,
  createImportBatch,
  createImportedQuotes,
  updateImportBatchCounts,
};

