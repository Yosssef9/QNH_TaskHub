import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { rowVersionToBuffer } from "../../shared/utils/sql-row-version.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
import type {
  PriceQuoteAnalyticsQuery,
  PriceQuoteInput,
  PriceQuoteListQuery,
  PriceQuoteSummaryInput,
} from "./price-quotes.types.js";

const itemsTable = PROCUREMENT_DB_OBJECTS.itemsTable;
const suppliersTable = PROCUREMENT_DB_OBJECTS.suppliersTable;
const transactionsTable = PROCUREMENT_DB_OBJECTS.transactionsTable;

export interface PriceQuoteRecord {
  id: number | string;
  ownerUserId: number;
  itemId: number | string;
  itemCode: string | null;
  itemName: string;
  supplierId: number | string;
  supplierCode: string | null;
  supplierName: string;
  quoteDate: Date;
  quotedUnitCost: number | string;
  currencyCode: string;
  unitName: string;
  quoteNumber: string | null;
  notes: string | null;
  isActive: boolean | number;
  latestActualUnitCost: number | string | null;
  latestActualDate: Date | null;
  differenceAmount: number | string | null;
  differencePercent: number | string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  rowVersion: unknown;
}

export interface QuoteActivityRecord {
  id: number | string;
  actionType: string;
  actorUserId: number;
  actorName: string;
  beforeValues: string | null;
  afterValues: string | null;
  createdAtUtc: Date;
}

export interface QuotePointRecord {
  id: number | string;
  quoteDate: Date;
  quotedUnitCost: number | string;
  supplierId: number | string;
  supplierCode: string | null;
  supplierName: string;
  currencyCode: string;
  unitName: string;
  isActive: boolean | number;
}

export interface QuoteSupplierSummaryRecord {
  supplierId: number | string;
  supplierCode: string | null;
  supplierName: string;
  currencyCode: string;
  unitName: string;
  latestQuote: number | string;
  latestQuoteDate: Date;
  previousQuote: number | string | null;
  lowestQuote: number | string;
  highestQuote: number | string;
  averageQuote: number | string;
  quoteCount: number | string;
  latestActualUnitCost: number | string | null;
  latestActualDate: Date | null;
  differenceAmount: number | string | null;
  differencePercent: number | string | null;
}

export interface QuoteAnalyticsRecord {
  quoteCount: number | string;
  activeQuoteCount: number | string;
  supplierCount: number | string;
  averageQuote: number | string | null;
}

export interface QuoteSummaryRecord {
  activeQuoteCount: number | string;
  quotedItemCount: number | string;
  quotesBelowLatestActualCount: number | string;
}

export interface QuoteContextTransactionRecord {
  supplierId: number | string;
  unitName: string;
  transactionDate: Date;
  unitCost: number | string;
}

export interface QuoteContextUnitRecord {
  unitName: string;
  latestTransactionDate: Date;
}

interface CountRecord { total: number | string; }
interface IdRecord { id: number | string; }

function periodPredicate(alias: string): string {
  return `
    (
      @period = 'ALL'
      OR ${alias}.quote_date >= CASE @period
        WHEN '1M' THEN DATEADD(MONTH, -1, CONVERT(DATE, SYSDATETIME()))
        WHEN '3M' THEN DATEADD(MONTH, -3, CONVERT(DATE, SYSDATETIME()))
        WHEN '6M' THEN DATEADD(MONTH, -6, CONVERT(DATE, SYSDATETIME()))
        WHEN '1Y' THEN DATEADD(YEAR, -1, CONVERT(DATE, SYSDATETIME()))
        ELSE CONVERT(DATE, '19000101')
      END
    )
  `;
}

function selectSql(): string {
  return `
    quote_row.id,
    quote_row.owner_user_id AS ownerUserId,
    quote_row.item_id AS itemId,
    NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), item.ITEM_CODE))), N'') AS itemCode,
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), item.ITEM_NAME))), N''), N'—') AS itemName,
    quote_row.supplier_id AS supplierId,
    NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))), N'') AS supplierCode,
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME))), N''), N'—') AS supplierName,
    quote_row.quote_date AS quoteDate,
    quote_row.quoted_unit_cost AS quotedUnitCost,
    quote_row.currency_code AS currencyCode,
    quote_row.unit_name AS unitName,
    quote_row.quote_number AS quoteNumber,
    quote_row.notes,
    quote_row.is_active AS isActive,
    actual.unitCost AS latestActualUnitCost,
    actual.transactionDate AS latestActualDate,
    CASE WHEN actual.unitCost IS NULL THEN NULL
         ELSE quote_row.quoted_unit_cost - actual.unitCost END AS differenceAmount,
    CASE WHEN actual.unitCost IS NULL OR actual.unitCost = 0 THEN NULL
         ELSE ((quote_row.quoted_unit_cost - actual.unitCost) / actual.unitCost) * CAST(100 AS DECIMAL(19,6)) END AS differencePercent,
    quote_row.created_at_utc AS createdAtUtc,
    quote_row.updated_at_utc AS updatedAtUtc,
    quote_row.row_version AS rowVersion
  `;
}

function joinsSql(): string {
  return `
    LEFT JOIN ${itemsTable} AS item
      ON CONVERT(BIGINT, item.ITEM_NO) = quote_row.item_id
    LEFT JOIN ${suppliersTable} AS supplier
      ON CONVERT(BIGINT, supplier.SUPPLIER_ID) = quote_row.supplier_id
    OUTER APPLY (
      SELECT TOP (1)
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) AS unitCost,
        TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) AS transactionDate
      FROM ${transactionsTable} AS tx
      WHERE TRY_CONVERT(BIGINT, tx.ITEM_NO) = quote_row.item_id
        AND TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) = quote_row.supplier_id
        AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) IS NOT NULL
        AND TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) IS NOT NULL
        AND ISNULL(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N''), N'') = quote_row.currency_code
        AND ISNULL(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N''), N'') = quote_row.unit_name
      ORDER BY
        TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) DESC,
        TRY_CONVERT(DATETIME2(3), tx.CONFIRM_DATE) DESC,
        TRY_CONVERT(DATE, tx.VENDOR_INVOICE_DATE) DESC,
        TRY_CONVERT(DATE, tx.BILL_DATE) DESC,
        CONVERT(NVARCHAR(120), tx.INVOICE_NO) DESC,
        CONVERT(NVARCHAR(120), tx.ORDER_ID) DESC,
        CONVERT(NVARCHAR(120), tx.BILL_NO) DESC,
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) DESC
    ) AS actual
  `;
}

const sortColumns: Record<PriceQuoteListQuery["sortBy"], string> = {
  quoteDate: "quote_row.quote_date",
  item: "item.ITEM_NAME",
  supplier: "supplier.SUPPLIER_NAME",
  quotedUnitCost: "quote_row.quoted_unit_cost",
  difference: "differenceAmount",
  status: "quote_row.is_active",
};

function bindList(request: import("mssql").Request, ownerUserId: number, query: PriceQuoteListQuery): void {
  request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("search", sql.NVarChar(150), query.search?.trim() || null)
    .input("itemId", sql.BigInt, query.itemId ?? null)
    .input("supplierId", sql.BigInt, query.supplierId ?? null)
    .input("supplierIdsJson", sql.NVarChar(sql.MAX), query.supplierIds?.length ? JSON.stringify(query.supplierIds) : null)
    .input("period", sql.VarChar(3), query.period)
    .input("status", sql.VarChar(10), query.status);
}

function whereSql(): string {
  return `
    quote_row.owner_user_id = @ownerUserId
    AND (@itemId IS NULL OR quote_row.item_id = @itemId)
    AND (@supplierId IS NULL OR quote_row.supplier_id = @supplierId)
    AND (
      @supplierIdsJson IS NULL
      OR quote_row.supplier_id IN (SELECT id FROM OPENJSON(@supplierIdsJson) WITH (id BIGINT '$'))
    )
    AND ${periodPredicate("quote_row")}
    AND (
      @status = 'ALL'
      OR (@status = 'ACTIVE' AND quote_row.is_active = 1)
      OR (@status = 'INACTIVE' AND quote_row.is_active = 0)
    )
    AND (
      @search IS NULL
      OR quote_row.quote_number LIKE N'%' + @search + N'%'
      OR quote_row.notes LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(100), item.ITEM_CODE) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(500), item.ITEM_NAME) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME) LIKE N'%' + @search + N'%'
    )
  `;
}

export async function listQuotes(ownerUserId: number, query: PriceQuoteListQuery): Promise<{ records: PriceQuoteRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const offset = (query.page - 1) * query.pageSize;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const orderColumn = sortColumns[query.sortBy];

  const request = pool.request();
  bindList(request, ownerUserId, query);
  request.input("offset", sql.Int, offset).input("pageSize", sql.Int, query.pageSize);
  const rows = await request.query<PriceQuoteRecord>(`
    SELECT ${selectSql()}
    FROM dbo.TM_price_quotes AS quote_row
    ${joinsSql()}
    WHERE ${whereSql()}
    ORDER BY ${orderColumn} ${direction}, quote_row.id ${direction}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  const countRequest = pool.request();
  bindList(countRequest, ownerUserId, query);
  const count = await countRequest.query<CountRecord>(`
    SELECT COUNT_BIG(1) AS total
    FROM dbo.TM_price_quotes AS quote_row
    LEFT JOIN ${itemsTable} AS item ON CONVERT(BIGINT, item.ITEM_NO) = quote_row.item_id
    LEFT JOIN ${suppliersTable} AS supplier ON CONVERT(BIGINT, supplier.SUPPLIER_ID) = quote_row.supplier_id
    WHERE ${whereSql()};
  `);

  return { records: rows.recordset, total: Number(count.recordset[0]?.total ?? 0) };
}

export async function findQuote(ownerUserId: number, quoteId: number, transaction?: DatabaseTransaction): Promise<PriceQuoteRecord | null> {
  const request = transaction ? transaction.request() : (await getDatabasePool()).request();
  const result = await request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("quoteId", sql.BigInt, quoteId)
    .query<PriceQuoteRecord>(`
      SELECT TOP (1) ${selectSql()}
      FROM dbo.TM_price_quotes AS quote_row ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      ${joinsSql()}
      WHERE quote_row.id = @quoteId
        AND quote_row.owner_user_id = @ownerUserId;
    `);
  return result.recordset[0] ?? null;
}

function bindInput(request: import("mssql").Request, input: PriceQuoteInput): void {
  request
    .input("itemId", sql.BigInt, input.itemId)
    .input("supplierId", sql.BigInt, input.supplierId)
    .input("quoteDate", sql.Date, input.quoteDate)
    .input("quotedUnitCost", sql.Decimal(19, 6), input.quotedUnitCost)
    .input("unitName", sql.NVarChar(100), input.unitName)
    .input("quoteNumber", sql.NVarChar(120), input.quoteNumber)
    .input("notes", sql.NVarChar(2000), input.notes);
}

export async function createQuote(transaction: DatabaseTransaction, ownerUserId: number, input: PriceQuoteInput): Promise<number> {
  const request = transaction.request().input("ownerUserId", sql.Int, ownerUserId);
  bindInput(request, input);
  const result = await request.query<IdRecord>(`
    INSERT INTO dbo.TM_price_quotes (
      owner_user_id, item_id, supplier_id, quote_date, quoted_unit_cost,
      currency_code, unit_name, quote_number, notes, is_active,
      created_by_user_id, updated_by_user_id
    )
    OUTPUT inserted.id
    VALUES (
      @ownerUserId, @itemId, @supplierId, @quoteDate, @quotedUnitCost,
      N'SAR', @unitName, @quoteNumber, @notes, 1,
      @ownerUserId, @ownerUserId
    );
  `);
  return Number(result.recordset[0]?.id);
}

export async function updateQuote(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  quoteId: number,
  input: PriceQuoteInput,
  rowVersion: string,
): Promise<boolean> {
  const bytes = rowVersionToBuffer(rowVersion);
  if (!bytes) return false;
  const request = transaction.request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("quoteId", sql.BigInt, quoteId)
    .input("rowVersion", sql.Binary(8), bytes);
  bindInput(request, input);
  const result = await request.query(`
    UPDATE dbo.TM_price_quotes
    SET item_id = @itemId,
        supplier_id = @supplierId,
        quote_date = @quoteDate,
        quoted_unit_cost = @quotedUnitCost,
        currency_code = N'SAR',
        unit_name = @unitName,
        quote_number = @quoteNumber,
        notes = @notes,
        updated_at_utc = SYSUTCDATETIME(),
        updated_by_user_id = @ownerUserId
    WHERE id = @quoteId
      AND owner_user_id = @ownerUserId
      AND row_version = @rowVersion;
  `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function setQuoteActive(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  quoteId: number,
  active: boolean,
  rowVersion: string,
): Promise<boolean> {
  const bytes = rowVersionToBuffer(rowVersion);
  if (!bytes) return false;
  const result = await transaction.request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("quoteId", sql.BigInt, quoteId)
    .input("isActive", sql.Bit, active)
    .input("rowVersion", sql.Binary(8), bytes)
    .query(`
      UPDATE dbo.TM_price_quotes
      SET is_active = @isActive,
          updated_at_utc = SYSUTCDATETIME(),
          updated_by_user_id = @ownerUserId
      WHERE id = @quoteId
        AND owner_user_id = @ownerUserId
        AND row_version = @rowVersion;
    `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function addActivity(
  transaction: DatabaseTransaction,
  input: {
    quoteId: number;
    ownerUserId: number;
    actorUserId: number;
    actionType: "CREATED" | "UPDATED" | "DEACTIVATED" | "REACTIVATED";
    beforeValues: Record<string, unknown> | null;
    afterValues: Record<string, unknown> | null;
  },
): Promise<void> {
  await transaction.request()
    .input("entityKey", sql.NVarChar(120), String(input.quoteId))
    .input("ownerUserId", sql.Int, input.ownerUserId)
    .input("actorUserId", sql.Int, input.actorUserId)
    .input("actionType", sql.VarChar(30), input.actionType)
    .input("beforeValues", sql.NVarChar(sql.MAX), input.beforeValues ? JSON.stringify(input.beforeValues) : null)
    .input("afterValues", sql.NVarChar(sql.MAX), input.afterValues ? JSON.stringify(input.afterValues) : null)
    .query(`
      INSERT INTO dbo.TM_procurement_activity (
        entity_type, entity_key, owner_user_id, action_type, actor_user_id,
        before_values, after_values
      )
      VALUES ('PRICE_QUOTE', @entityKey, @ownerUserId, @actionType, @actorUserId, @beforeValues, @afterValues);
    `);
}

export async function listActivity(ownerUserId: number, quoteId: number): Promise<QuoteActivityRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("entityKey", sql.NVarChar(120), String(quoteId))
    .query<QuoteActivityRecord>(`
      SELECT
        activity.id,
        activity.action_type AS actionType,
        activity.actor_user_id AS actorUserId,
        COALESCE(portal.USER_NAME, portal.USER_CODE, CONVERT(NVARCHAR(20), activity.actor_user_id)) AS actorName,
        activity.before_values AS beforeValues,
        activity.after_values AS afterValues,
        activity.created_at_utc AS createdAtUtc
      FROM dbo.TM_procurement_activity AS activity
      LEFT JOIN dbo.users AS portal ON portal.USER_ID = activity.actor_user_id
      WHERE activity.entity_type = 'PRICE_QUOTE'
        AND activity.entity_key = @entityKey
        AND activity.owner_user_id = @ownerUserId
      ORDER BY activity.created_at_utc DESC, activity.id DESC;
    `);
  return result.recordset;
}

function bindAnalytics(request: import("mssql").Request, ownerUserId: number, query: PriceQuoteAnalyticsQuery): void {
  request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("itemId", sql.BigInt, query.itemId ?? null)
    .input("supplierId", sql.BigInt, query.supplierId ?? null)
    .input("supplierIdsJson", sql.NVarChar(sql.MAX), query.supplierIds?.length ? JSON.stringify(query.supplierIds) : null)
    .input("period", sql.VarChar(3), query.period);
}

function analyticsBaseWhere(): string {
  return `
    quote_row.owner_user_id = @ownerUserId
    AND (@itemId IS NULL OR quote_row.item_id = @itemId)
    AND (@supplierId IS NULL OR quote_row.supplier_id = @supplierId)
    AND (
      @supplierIdsJson IS NULL
      OR quote_row.supplier_id IN (SELECT id FROM OPENJSON(@supplierIdsJson) WITH (id BIGINT '$'))
    )
    AND ${periodPredicate("quote_row")}
  `;
}

function analyticsWhere(): string {
  return `${analyticsBaseWhere()}
    AND quote_row.currency_code = @scopeCurrency
    AND quote_row.unit_name = @scopeUnit`;
}

export async function getAnalytics(ownerUserId: number, query: PriceQuoteAnalyticsQuery): Promise<{
  analytics: QuoteAnalyticsRecord;
  points: QuotePointRecord[];
  supplierSummaries: QuoteSupplierSummaryRecord[];
}> {
  const pool = await getDatabasePool();

  const scopeRequest = pool.request();
  bindAnalytics(scopeRequest, ownerUserId, query);
  const scopeResult = await scopeRequest.query<{ currencyCode: string; unitName: string }>(`
    SELECT TOP (1)
      quote_row.currency_code AS currencyCode,
      quote_row.unit_name AS unitName
    FROM dbo.TM_price_quotes AS quote_row
    WHERE ${analyticsBaseWhere()}
    ORDER BY quote_row.quote_date DESC, quote_row.id DESC;
  `);
  const scope = scopeResult.recordset[0];
  if (!scope) {
    return {
      analytics: { quoteCount: 0, activeQuoteCount: 0, supplierCount: 0, averageQuote: null },
      points: [],
      supplierSummaries: [],
    };
  }

  const a = pool.request();
  bindAnalytics(a, ownerUserId, query);
  a.input("scopeCurrency", sql.NVarChar(30), scope.currencyCode).input("scopeUnit", sql.NVarChar(100), scope.unitName);
  const analyticsResult = await a.query<QuoteAnalyticsRecord>(`
    SELECT
      COUNT_BIG(1) AS quoteCount,
      SUM(CASE WHEN quote_row.is_active = 1 THEN 1 ELSE 0 END) AS activeQuoteCount,
      COUNT(DISTINCT quote_row.supplier_id) AS supplierCount,
      AVG(CONVERT(DECIMAL(19,6), quote_row.quoted_unit_cost)) AS averageQuote
    FROM dbo.TM_price_quotes AS quote_row
    WHERE ${analyticsWhere()};
  `);

  const p = pool.request();
  bindAnalytics(p, ownerUserId, query);
  p.input("scopeCurrency", sql.NVarChar(30), scope.currencyCode).input("scopeUnit", sql.NVarChar(100), scope.unitName);
  const pointsResult = await p.query<QuotePointRecord>(`
    SELECT TOP (1000)
      quote_row.id,
      quote_row.quote_date AS quoteDate,
      quote_row.quoted_unit_cost AS quotedUnitCost,
      quote_row.supplier_id AS supplierId,
      NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))), N'') AS supplierCode,
      COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME))), N''), N'—') AS supplierName,
      quote_row.currency_code AS currencyCode,
      quote_row.unit_name AS unitName,
      quote_row.is_active AS isActive
    FROM dbo.TM_price_quotes AS quote_row
    LEFT JOIN ${suppliersTable} AS supplier
      ON CONVERT(BIGINT, supplier.SUPPLIER_ID) = quote_row.supplier_id
    WHERE ${analyticsWhere()}
    ORDER BY quote_row.quote_date DESC, quote_row.id DESC;
  `);

  const s = pool.request();
  bindAnalytics(s, ownerUserId, query);
  s.input("scopeCurrency", sql.NVarChar(30), scope.currencyCode).input("scopeUnit", sql.NVarChar(100), scope.unitName);
  const summaries = await s.query<QuoteSupplierSummaryRecord>(`
    WITH scoped AS (
      SELECT
        quote_row.*,
        ROW_NUMBER() OVER (
          PARTITION BY quote_row.supplier_id, quote_row.currency_code, quote_row.unit_name
          ORDER BY quote_row.quote_date DESC, quote_row.id DESC
        ) AS rn
      FROM dbo.TM_price_quotes AS quote_row
      WHERE ${analyticsWhere()}
        AND @itemId IS NOT NULL
    ),
    grouped AS (
      SELECT
        supplier_id,
        currency_code,
        unit_name,
        MAX(CASE WHEN rn = 1 THEN quoted_unit_cost END) AS latestQuote,
        MAX(CASE WHEN rn = 1 THEN quote_date END) AS latestQuoteDate,
        MAX(CASE WHEN rn = 2 THEN quoted_unit_cost END) AS previousQuote,
        MIN(quoted_unit_cost) AS lowestQuote,
        MAX(quoted_unit_cost) AS highestQuote,
        AVG(CONVERT(DECIMAL(19,6), quoted_unit_cost)) AS averageQuote,
        COUNT_BIG(1) AS quoteCount
      FROM scoped
      GROUP BY supplier_id, currency_code, unit_name
    )
    SELECT
      grouped.supplier_id AS supplierId,
      NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))), N'') AS supplierCode,
      COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME))), N''), N'—') AS supplierName,
      grouped.currency_code AS currencyCode,
      grouped.unit_name AS unitName,
      grouped.latestQuote,
      grouped.latestQuoteDate,
      grouped.previousQuote,
      grouped.lowestQuote,
      grouped.highestQuote,
      grouped.averageQuote,
      grouped.quoteCount,
      actual.unitCost AS latestActualUnitCost,
      actual.transactionDate AS latestActualDate,
      CASE WHEN actual.unitCost IS NULL THEN NULL ELSE grouped.latestQuote - actual.unitCost END AS differenceAmount,
      CASE WHEN actual.unitCost IS NULL OR actual.unitCost = 0 THEN NULL
           ELSE ((grouped.latestQuote - actual.unitCost) / actual.unitCost) * CAST(100 AS DECIMAL(19,6)) END AS differencePercent
    FROM grouped
    LEFT JOIN ${suppliersTable} AS supplier
      ON CONVERT(BIGINT, supplier.SUPPLIER_ID) = grouped.supplier_id
    OUTER APPLY (
      SELECT TOP (1)
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) AS unitCost,
        TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) AS transactionDate
      FROM ${transactionsTable} AS tx
      WHERE (@itemId IS NULL OR TRY_CONVERT(BIGINT, tx.ITEM_NO) = @itemId)
        AND TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) = grouped.supplier_id
        AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) IS NOT NULL
        AND TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) IS NOT NULL
        AND ISNULL(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N''), N'') = grouped.currency_code
        AND ISNULL(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N''), N'') = grouped.unit_name
      ORDER BY TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) DESC,
               TRY_CONVERT(DATETIME2(3), tx.CONFIRM_DATE) DESC,
               CONVERT(NVARCHAR(120), tx.INVOICE_NO) DESC,
               CONVERT(NVARCHAR(120), tx.ORDER_ID) DESC
    ) AS actual
    ORDER BY grouped.latestQuote ASC, grouped.supplier_id ASC;
  `);

  return {
    analytics: analyticsResult.recordset[0] ?? { quoteCount: 0, activeQuoteCount: 0, supplierCount: 0, averageQuote: null },
    points: pointsResult.recordset,
    supplierSummaries: summaries.recordset,
  };
}

export async function getSummary(ownerUserId: number, input: PriceQuoteSummaryInput): Promise<QuoteSummaryRecord> {
  const pool = await getDatabasePool();
  const request = pool.request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("period", sql.VarChar(3), input.period)
    .input("itemIdsJson", sql.NVarChar(sql.MAX), input.itemIds.length ? JSON.stringify(input.itemIds) : null)
    .input("supplierIdsJson", sql.NVarChar(sql.MAX), input.supplierIds.length ? JSON.stringify(input.supplierIds) : null);

  const result = await request.query<QuoteSummaryRecord>(`
    WITH scoped AS (
      SELECT quote_row.*
      FROM dbo.TM_price_quotes AS quote_row
      WHERE quote_row.owner_user_id = @ownerUserId
        AND quote_row.is_active = 1
        AND ${periodPredicate("quote_row")}
        AND (
          @itemIdsJson IS NULL
          OR quote_row.item_id IN (SELECT id FROM OPENJSON(@itemIdsJson) WITH (id BIGINT '$'))
        )
        AND (
          @supplierIdsJson IS NULL
          OR quote_row.supplier_id IN (SELECT id FROM OPENJSON(@supplierIdsJson) WITH (id BIGINT '$'))
        )
    ),
    compared AS (
      SELECT
        scoped.*,
        actual.unitCost AS latestActualUnitCost
      FROM scoped
      OUTER APPLY (
        SELECT TOP (1) TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) AS unitCost
        FROM ${transactionsTable} AS tx
        WHERE TRY_CONVERT(BIGINT, tx.ITEM_NO) = scoped.item_id
          AND TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) = scoped.supplier_id
          AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) IS NOT NULL
          AND TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) IS NOT NULL
          AND ISNULL(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N''), N'') = scoped.currency_code
          AND ISNULL(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N''), N'') = scoped.unit_name
        ORDER BY TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) DESC,
                 TRY_CONVERT(DATETIME2(3), tx.CONFIRM_DATE) DESC,
                 CONVERT(NVARCHAR(120), tx.INVOICE_NO) DESC,
                 CONVERT(NVARCHAR(120), tx.ORDER_ID) DESC
      ) AS actual
    )
    SELECT
      COUNT_BIG(1) AS activeQuoteCount,
      COUNT(DISTINCT item_id) AS quotedItemCount,
      SUM(CASE WHEN latestActualUnitCost IS NOT NULL AND quoted_unit_cost < latestActualUnitCost THEN 1 ELSE 0 END) AS quotesBelowLatestActualCount
    FROM compared;
  `);
  return result.recordset[0] ?? { activeQuoteCount: 0, quotedItemCount: 0, quotesBelowLatestActualCount: 0 };
}

export async function getQuoteContextTransactions(
  itemId: number,
  supplierId?: number,
): Promise<{ defaultTransaction: QuoteContextTransactionRecord | null; units: QuoteContextUnitRecord[] }> {
  const pool = await getDatabasePool();
  const bind = (request: import("mssql").Request) => request
    .input("itemId", sql.BigInt, itemId)
    .input("supplierId", sql.BigInt, supplierId ?? null);

  const historyWhere = `
    TRY_CONVERT(BIGINT, tx.ITEM_NO) = @itemId
    AND TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) IS NOT NULL
    AND TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) IS NOT NULL
    AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) IS NOT NULL
    AND UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE)))) = N'SAR'
    AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N'') IS NOT NULL
  `;

  const [defaultResult, unitsResult] = await Promise.all([
    bind(pool.request()).query<QuoteContextTransactionRecord>(`
      SELECT TOP (1)
        TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) AS supplierId,
        LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))) AS unitName,
        TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) AS transactionDate,
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) AS unitCost
      FROM ${transactionsTable} AS tx
      WHERE ${historyWhere}
      ORDER BY
        CASE WHEN @supplierId IS NOT NULL AND TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) = @supplierId THEN 0 ELSE 1 END,
        TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) DESC,
        TRY_CONVERT(DATETIME2(3), tx.CONFIRM_DATE) DESC,
        TRY_CONVERT(DATE, tx.VENDOR_INVOICE_DATE) DESC,
        TRY_CONVERT(DATE, tx.BILL_DATE) DESC,
        CONVERT(NVARCHAR(120), tx.INVOICE_NO) DESC,
        CONVERT(NVARCHAR(120), tx.INV_VOUCHER_NO) DESC,
        CONVERT(NVARCHAR(120), tx.ORDER_ID) DESC,
        CONVERT(NVARCHAR(120), tx.BILL_NO) DESC,
        CONVERT(NVARCHAR(120), tx.VENDOR_INVOICE_NO) DESC,
        CONVERT(NVARCHAR(120), tx.LOT_NO) DESC,
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) DESC,
        TRY_CONVERT(DECIMAL(19,6), tx.QTY) DESC,
        TRY_CONVERT(DECIMAL(19,6), tx.BONUS_QTY) DESC,
        CONVERT(NVARCHAR(120), tx.SOURCE_ROWID) DESC;
    `),
    bind(pool.request()).query<QuoteContextUnitRecord>(`
      SELECT
        LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))) AS unitName,
        MAX(TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE)) AS latestTransactionDate
      FROM ${transactionsTable} AS tx
      WHERE ${historyWhere}
      GROUP BY LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN)))
      ORDER BY MAX(TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE)) DESC,
               LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))) ASC;
    `),
  ]);

  return {
    defaultTransaction: defaultResult.recordset[0] ?? null,
    units: unitsResult.recordset,
  };
}

export const priceQuotesRepository = {
  listQuotes,
  findQuote,
  createQuote,
  updateQuote,
  setQuoteActive,
  addActivity,
  listActivity,
  getAnalytics,
  getSummary,
  getQuoteContextTransactions,
};
