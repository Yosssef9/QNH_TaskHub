import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
import type {
  ItemInput,
  ItemListQuery,
  ItemOptionQuery,
  ItemOverviewQuery,
  ItemPriceSummaryQuery,
  ItemSupplierMatrixQuery,
} from "./items.types.js";

const itemsTable = PROCUREMENT_DB_OBJECTS.itemsTable;
const suppliersTable = PROCUREMENT_DB_OBJECTS.suppliersTable;
const transactionsTable = PROCUREMENT_DB_OBJECTS.transactionsTable;

export interface ItemRecord {
  id: number | string;
  code: string;
  name: string;
  parentName: string | null;
  categoryName: string | null;
  unit: string | null;
  pieceUnit: string | null;
  factor: number | string | null;
  isStockItem: boolean | number | string | null;
  statusCode: number | string | null;
  isAsset: boolean | number | string | null;
  source: string;
}

export interface ItemOptionRecord {
  id: number | string;
  code: string;
  name: string;
  unit: string | null;
}

export interface ItemPriceSummaryRecord {
  itemId: number | string | null;
  priceCurrencyCode: string | null;
  priceUnitName: string | null;
  latestUnitCost: number | string | null;
  previousUnitCost: number | string | null;
  lowestUnitCost: number | string | null;
  highestUnitCost: number | string | null;
  averageUnitCost: number | string | null;
  changeAmount: number | string | null;
  changePercent: number | string | null;
  supplierCount: number | string | null;
  transactionCount: number | string | null;
  lastPurchaseDate: Date | null;
  latestSupplierId: number | string | null;
  latestSupplierCode: string | null;
  latestSupplierName: string | null;
}

export interface ItemSupplierMatrixRecord {
  itemId: number | string;
  supplierId: number | string;
  supplierCode: string | null;
  supplierName: string | null;
  currencyCode: string | null;
  unitName: string | null;
  latestUnitCost: number | string | null;
  latestTransactionDate: Date | null;
  previousUnitCost: number | string | null;
  previousTransactionDate: Date | null;
  lowestUnitCost: number | string | null;
  lowestTransactionDate: Date | null;
  highestUnitCost: number | string | null;
  highestTransactionDate: Date | null;
  averageUnitCost: number | string | null;
  transactionCount: number | string | null;
  lastPurchaseDate: Date | null;
  changeAmount: number | string | null;
  changePercent: number | string | null;
  latestQuoteUnitCost: number | string | null;
  latestQuoteDate: Date | null;
  quoteCurrencyCode: string | null;
  quoteUnitName: string | null;
}

export interface ItemListRecord extends ItemRecord, ItemPriceSummaryRecord {}

export interface ItemsOverviewRecord {
  totalItems: number | string;
  purchasedItems: number | string;
  supplierCount: number | string;
  transactionCount: number | string;
  priceIncreases: number | string;
  priceDecreases: number | string;
  latestAtHistoricalHigh: number | string;
}

export interface ItemActivityRecord {
  id: number | string;
  actionType: string;
  actorUserId: number;
  actorName: string;
  beforeValues: string | null;
  afterValues: string | null;
  createdAtUtc: Date;
}

interface CountRecord { total: number | string; }
interface IdRecord { id: number | string; }

function sourceSql(alias = "item"): string {
  return `CASE WHEN CONVERT(BIGINT, ${alias}.ITEM_NO) < 0 OR CONVERT(NVARCHAR(100), ${alias}.ITEM_CODE) LIKE N'USR-ITEM-%' THEN 'MANUAL' ELSE 'ORACLE' END`;
}

function itemSelectSql(alias = "item"): string {
  return `
    CONVERT(BIGINT, ${alias}.ITEM_NO) AS id,
    CONVERT(NVARCHAR(100), ${alias}.ITEM_CODE) AS code,
    CONVERT(NVARCHAR(500), ${alias}.ITEM_NAME) AS name,
    CONVERT(NVARCHAR(500), ${alias}.ITEM_PARENT_NAME) AS parentName,
    CONVERT(NVARCHAR(250), ${alias}.CATEGORY_NAME) AS categoryName,
    CONVERT(NVARCHAR(100), ${alias}.UNIT) AS unit,
    CONVERT(NVARCHAR(100), ${alias}.ITEM_PIECE_UNIT) AS pieceUnit,
    TRY_CONVERT(DECIMAL(19,6), ${alias}.FACTOR) AS factor,
    TRY_CONVERT(BIT, ${alias}.IS_STOCK_ITEM) AS isStockItem,
    TRY_CONVERT(INT, ${alias}.ITEM_STATUS) AS statusCode,
    TRY_CONVERT(BIT, ${alias}.IS_ASSET) AS isAsset,
    ${sourceSql(alias)} AS source
  `;
}

function itemListSelectSql(): string {
  return `
    ${itemSelectSql()},
    price.itemId AS itemId,
    price.currencyCode AS priceCurrencyCode,
    price.unitName AS priceUnitName,
    price.latestUnitCost,
    price.previousUnitCost,
    price.lowestUnitCost,
    price.highestUnitCost,
    price.averageUnitCost,
    price.changeAmount,
    price.changePercent,
    price.supplierCount,
    price.transactionCount,
    price.lastPurchaseDate,
    price.latestSupplierId,
    price.latestSupplierCode,
    price.latestSupplierName
  `;
}

function nullPriceSelectSql(alias = "item"): string {
  return `
    ${itemSelectSql(alias)},
    CONVERT(BIGINT, ${alias}.ITEM_NO) AS itemId,
    CAST(NULL AS NVARCHAR(30)) AS priceCurrencyCode,
    CAST(NULL AS NVARCHAR(100)) AS priceUnitName,
    CAST(NULL AS DECIMAL(19,6)) AS latestUnitCost,
    CAST(NULL AS DECIMAL(19,6)) AS previousUnitCost,
    CAST(NULL AS DECIMAL(19,6)) AS lowestUnitCost,
    CAST(NULL AS DECIMAL(19,6)) AS highestUnitCost,
    CAST(NULL AS DECIMAL(38,10)) AS averageUnitCost,
    CAST(NULL AS DECIMAL(19,6)) AS changeAmount,
    CAST(NULL AS DECIMAL(19,6)) AS changePercent,
    CAST(NULL AS BIGINT) AS supplierCount,
    CAST(NULL AS BIGINT) AS transactionCount,
    CAST(NULL AS DATE) AS lastPurchaseDate,
    CAST(NULL AS BIGINT) AS latestSupplierId,
    CAST(NULL AS NVARCHAR(100)) AS latestSupplierCode,
    CAST(NULL AS NVARCHAR(500)) AS latestSupplierName
  `;
}

function priceSummarySelectSql(alias = "price"): string {
  return `
    ${alias}.itemId,
    ${alias}.currencyCode AS priceCurrencyCode,
    ${alias}.unitName AS priceUnitName,
    ${alias}.latestUnitCost,
    ${alias}.previousUnitCost,
    ${alias}.lowestUnitCost,
    ${alias}.highestUnitCost,
    ${alias}.averageUnitCost,
    ${alias}.changeAmount,
    ${alias}.changePercent,
    ${alias}.supplierCount,
    ${alias}.transactionCount,
    ${alias}.lastPurchaseDate,
    ${alias}.latestSupplierId,
    ${alias}.latestSupplierCode,
    ${alias}.latestSupplierName
  `;
}

const sortColumns: Record<ItemListQuery["sortBy"], string> = {
  code: "item.ITEM_CODE",
  name: "item.ITEM_NAME",
  category: "item.CATEGORY_NAME",
  unit: "item.UNIT",
  status: "item.ITEM_STATUS",
  source: sourceSql(),
  latest: "price.latestUnitCost",
  lowest: "price.lowestUnitCost",
  highest: "price.highestUnitCost",
  change: "price.changePercent",
  suppliers: "price.supplierCount",
  lastPurchase: "price.lastPurchaseDate",
};

const analyticsSorts = new Set<ItemListQuery["sortBy"]>([
  "latest",
  "lowest",
  "highest",
  "change",
  "suppliers",
  "lastPurchase",
]);

function bindListFilters(
  request: import("mssql").Request,
  query: ItemListQuery | ItemOverviewQuery,
): void {
  request
    .input("search", sql.NVarChar(120), query.search?.trim() || null)
    .input("source", sql.VarChar(10), query.source ?? null)
    .input("category", sql.NVarChar(150), query.category?.trim() || null)
    .input("statusCode", sql.Int, query.statusCode ?? null)
    .input("itemIdsJson", sql.NVarChar(sql.MAX), query.itemIds?.length ? JSON.stringify(query.itemIds) : null)
    .input("period", sql.VarChar(3), query.period)
    .input("supplierIdsJson", sql.NVarChar(sql.MAX), query.supplierIds?.length ? JSON.stringify(query.supplierIds) : null)
    .input("currencyCode", sql.NVarChar(30), query.currencyCode?.trim() || null)
    .input("unitName", sql.NVarChar(100), query.unitName?.trim() || null);
}

function bindOptionFilters(request: import("mssql").Request, query: ItemOptionQuery): void {
  request
    .input("search", sql.NVarChar(120), query.search?.trim() || null)
    .input("source", sql.VarChar(10), query.source ?? null);
}

function bindPriceSummaryFilters(request: import("mssql").Request, query: ItemPriceSummaryQuery): void {
  request
    .input("itemIdsJson", sql.NVarChar(sql.MAX), JSON.stringify(query.itemIds))
    .input("period", sql.VarChar(3), query.period)
    .input("supplierIdsJson", sql.NVarChar(sql.MAX), query.supplierIds?.length ? JSON.stringify(query.supplierIds) : null)
    .input("currencyCode", sql.NVarChar(30), query.currencyCode?.trim() || null)
    .input("unitName", sql.NVarChar(100), query.unitName?.trim() || null);
}

function bindSupplierMatrixFilters(
  request: import("mssql").Request,
  ownerUserId: number,
  query: ItemSupplierMatrixQuery,
): void {
  request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("itemIdsJson", sql.NVarChar(sql.MAX), JSON.stringify(query.itemIds))
    .input("supplierIdsJson", sql.NVarChar(sql.MAX), JSON.stringify(query.supplierIds))
    .input("period", sql.VarChar(3), query.period);
}

function whereSql(): string {
  return `
    WHERE (
      @search IS NULL
      OR CONVERT(NVARCHAR(100), item.ITEM_CODE) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(500), item.ITEM_NAME) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(500), item.ITEM_PARENT_NAME) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(250), item.CATEGORY_NAME) LIKE N'%' + @search + N'%'
    )
    AND (@source IS NULL OR @source = ${sourceSql()})
    AND (@category IS NULL OR CONVERT(NVARCHAR(250), item.CATEGORY_NAME) = @category)
    AND (@statusCode IS NULL OR TRY_CONVERT(INT, item.ITEM_STATUS) = @statusCode)
    AND (
      @itemIdsJson IS NULL
      OR CONVERT(BIGINT, item.ITEM_NO) IN (
        SELECT ids.id
        FROM OPENJSON(@itemIdsJson) WITH (id BIGINT '$') AS ids
      )
    )
  `;
}

function optionWhereSql(): string {
  return `
    WHERE (
      @search IS NULL
      OR CONVERT(NVARCHAR(100), item.ITEM_CODE) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(500), item.ITEM_NAME) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(500), item.ITEM_PARENT_NAME) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(250), item.CATEGORY_NAME) LIKE N'%' + @search + N'%'
    )
    AND (@source IS NULL OR @source = ${sourceSql()})
  `;
}

const chronologicalColumns = [
  ["transactionDate", "DESC"],
  ["confirmDate", "DESC"],
  ["vendorInvoiceDate", "DESC"],
  ["billDate", "DESC"],
  ["invoiceNo", "DESC"],
  ["invoiceVoucherNo", "DESC"],
  ["orderId", "DESC"],
  ["billNo", "DESC"],
  ["vendorInvoiceNo", "DESC"],
  ["lotNo", "DESC"],
  ["unitCost", "DESC"],
  ["quantity", "DESC"],
  ["bonusQuantity", "DESC"],
  ["sourceRowId", "DESC"],
] as const;

function chronologicalOrder(alias = "", excludedColumn?: string): string {
  const p = alias ? `${alias}.` : "";
  return chronologicalColumns
    .filter(([column]) => column !== excludedColumn)
    .map(([column, direction]) => `${p}${column} ${direction}`)
    .join(",\n    ");
}

function priceAnalyticsCte(filteredItemsSql?: string): string {
  const filteredItems = filteredItemsSql ?? `
      SELECT item.*
      FROM ${itemsTable} AS item
      ${whereSql()}
  `;

  return `
    WITH filtered_items AS (
      ${filteredItems}
    ),
    normalized AS (
      SELECT
        TRY_CONVERT(BIGINT, tx.ITEM_NO) AS itemId,
        TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) AS supplierId,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))), N''),
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.SUPPLIER_CODE))), N'')
        ) AS supplierCode,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME))), N''),
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), tx.SUPPLIER_NAME_EN))), N''),
          N'—'
        ) AS supplierName,
        TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) AS transactionDate,
        TRY_CONVERT(DATETIME2(3), tx.CONFIRM_DATE) AS confirmDate,
        TRY_CONVERT(DATE, tx.VENDOR_INVOICE_DATE) AS vendorInvoiceDate,
        TRY_CONVERT(DATE, tx.BILL_DATE) AS billDate,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.INVOICE_NO))), N'') AS invoiceNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.INV_VOUCHER_NO))), N'') AS invoiceVoucherNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.ORDER_ID))), N'') AS orderId,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.BILL_NO))), N'') AS billNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.VENDOR_INVOICE_NO))), N'') AS vendorInvoiceNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.LOT_NO))), N'') AS lotNo,
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) AS unitCost,
        TRY_CONVERT(DECIMAL(19,6), tx.QTY) AS quantity,
        TRY_CONVERT(DECIMAL(19,6), tx.BONUS_QTY) AS bonusQuantity,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.SOURCE_ROWID))), N'') AS sourceRowId,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N'') AS currencyCode,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N'') AS unitName
      FROM ${transactionsTable} AS tx
      INNER JOIN filtered_items AS filtered
        ON filtered.ITEM_NO = tx.ITEM_NO
      LEFT JOIN ${suppliersTable} AS supplier
        ON supplier.SUPPLIER_ID = tx.SUPPLIER_ID
      WHERE tx.SUPPLIER_ID IS NOT NULL
        AND TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) IS NOT NULL
        AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) IS NOT NULL
    ),
    eligible AS (
      SELECT *
      FROM normalized
      WHERE (
        @period = 'ALL'
        OR transactionDate >= CASE @period
          WHEN '1M' THEN DATEADD(MONTH, -1, CONVERT(DATE, SYSDATETIME()))
          WHEN '3M' THEN DATEADD(MONTH, -3, CONVERT(DATE, SYSDATETIME()))
          WHEN '6M' THEN DATEADD(MONTH, -6, CONVERT(DATE, SYSDATETIME()))
          WHEN '1Y' THEN DATEADD(YEAR, -1, CONVERT(DATE, SYSDATETIME()))
          ELSE CONVERT(DATE, '19000101')
        END
      )
      AND (
        @supplierIdsJson IS NULL
        OR supplierId IN (
          SELECT ids.id
          FROM OPENJSON(@supplierIdsJson) WITH (id BIGINT '$') AS ids
        )
      )
      AND (@currencyCode IS NULL OR ISNULL(currencyCode, N'') = ISNULL(@currencyCode, N''))
      AND (@unitName IS NULL OR ISNULL(unitName, N'') = ISNULL(@unitName, N''))
    ),
    scope_ranked AS (
      SELECT
        eligible.*,
        ROW_NUMBER() OVER (
          PARTITION BY itemId
          ORDER BY ${chronologicalOrder()}
        ) AS scopeRowNumber
      FROM eligible
    ),
    chosen_scope AS (
      SELECT itemId, currencyCode, unitName
      FROM scope_ranked
      WHERE scopeRowNumber = 1
    ),
    scoped AS (
      SELECT eligible.*
      FROM eligible
      INNER JOIN chosen_scope
        ON chosen_scope.itemId = eligible.itemId
       AND ISNULL(chosen_scope.currencyCode, N'') = ISNULL(eligible.currencyCode, N'')
       AND ISNULL(chosen_scope.unitName, N'') = ISNULL(eligible.unitName, N'')
    ),
    ranked AS (
      SELECT
        scoped.*,
        ROW_NUMBER() OVER (
          PARTITION BY itemId
          ORDER BY ${chronologicalOrder()}
        ) AS chronologicalRowNumber,
        ROW_NUMBER() OVER (
          PARTITION BY itemId
          ORDER BY unitCost ASC, ${chronologicalOrder("", "unitCost")}
        ) AS lowestRowNumber,
        ROW_NUMBER() OVER (
          PARTITION BY itemId
          ORDER BY unitCost DESC, ${chronologicalOrder("", "unitCost")}
        ) AS highestRowNumber
      FROM scoped
    ),
    aggregates AS (
      SELECT
        itemId,
        AVG(CONVERT(DECIMAL(38,10), unitCost)) AS averageUnitCost,
        COUNT_BIG(1) AS transactionCount,
        COUNT(DISTINCT supplierId) AS supplierCount,
        MAX(transactionDate) AS lastPurchaseDate
      FROM scoped
      GROUP BY itemId
    ),
    price_summary AS (
      SELECT
        aggregates.itemId,
        chosen_scope.currencyCode,
        chosen_scope.unitName,
        latest.unitCost AS latestUnitCost,
        previous.unitCost AS previousUnitCost,
        lowest.unitCost AS lowestUnitCost,
        highest.unitCost AS highestUnitCost,
        aggregates.averageUnitCost,
        aggregates.transactionCount,
        aggregates.supplierCount,
        aggregates.lastPurchaseDate,
        latest.supplierId AS latestSupplierId,
        latest.supplierCode AS latestSupplierCode,
        latest.supplierName AS latestSupplierName,
        CASE
          WHEN previous.unitCost IS NULL THEN NULL
          ELSE CONVERT(DECIMAL(19,6), latest.unitCost - previous.unitCost)
        END AS changeAmount,
        CASE
          WHEN previous.unitCost IS NULL OR previous.unitCost = 0 THEN NULL
          ELSE CONVERT(DECIMAL(19,6), ((latest.unitCost - previous.unitCost) / previous.unitCost) * 100)
        END AS changePercent
      FROM aggregates
      INNER JOIN chosen_scope ON chosen_scope.itemId = aggregates.itemId
      INNER JOIN ranked AS latest
        ON latest.itemId = aggregates.itemId
       AND latest.chronologicalRowNumber = 1
      LEFT JOIN ranked AS previous
        ON previous.itemId = aggregates.itemId
       AND previous.chronologicalRowNumber = 2
      INNER JOIN ranked AS lowest
        ON lowest.itemId = aggregates.itemId
       AND lowest.lowestRowNumber = 1
      INNER JOIN ranked AS highest
        ON highest.itemId = aggregates.itemId
       AND highest.highestRowNumber = 1
    )
  `;
}

export async function listItems(query: ItemListQuery): Promise<{ records: ItemListRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const offset = (query.page - 1) * query.pageSize;
  const orderColumn = sortColumns[query.sortBy];
  const orderDirection = query.sortDirection === "desc" ? "DESC" : "ASC";
  const usesAnalyticsSort = analyticsSorts.has(query.sortBy);

  const recordsRequest = pool.request();
  bindListFilters(recordsRequest, query);
  recordsRequest.input("offset", sql.Int, offset).input("pageSize", sql.Int, query.pageSize);

  const records = usesAnalyticsSort
    ? await recordsRequest.query<ItemListRecord>(`
        ${priceAnalyticsCte()}
        SELECT ${itemListSelectSql()}
        FROM filtered_items AS item
        LEFT JOIN price_summary AS price
          ON price.itemId = CONVERT(BIGINT, item.ITEM_NO)
        ORDER BY
          CASE WHEN ${orderColumn} IS NULL THEN 1 ELSE 0 END ASC,
          ${orderColumn} ${orderDirection},
          CONVERT(BIGINT, item.ITEM_NO) ${orderDirection}
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
      `)
    : await recordsRequest.query<ItemListRecord>(`
        SELECT ${nullPriceSelectSql()}
        FROM ${itemsTable} AS item
        ${whereSql()}
        ORDER BY ${orderColumn} ${orderDirection}, CONVERT(BIGINT, item.ITEM_NO) ${orderDirection}
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
      `);

  const countRequest = pool.request();
  bindListFilters(countRequest, query);
  const count = await countRequest.query<CountRecord>(`
    SELECT COUNT_BIG(1) AS total
    FROM ${itemsTable} AS item
    ${whereSql()};
  `);

  return { records: records.recordset, total: Number(count.recordset[0]?.total ?? 0) };
}

export async function listItemOptions(query: ItemOptionQuery): Promise<{ records: ItemOptionRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const offset = (query.page - 1) * query.pageSize;

  const request = pool.request();
  bindOptionFilters(request, query);
  request.input("offset", sql.Int, offset).input("pageSize", sql.Int, query.pageSize);
  const records = await request.query<ItemOptionRecord>(`
    SELECT
      CONVERT(BIGINT, item.ITEM_NO) AS id,
      CONVERT(NVARCHAR(100), item.ITEM_CODE) AS code,
      CONVERT(NVARCHAR(500), item.ITEM_NAME) AS name,
      CONVERT(NVARCHAR(100), item.UNIT) AS unit
    FROM ${itemsTable} AS item
    ${optionWhereSql()}
    ORDER BY item.ITEM_NAME ASC, item.ITEM_CODE ASC, CONVERT(BIGINT, item.ITEM_NO) ASC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  const countRequest = pool.request();
  bindOptionFilters(countRequest, query);
  const count = await countRequest.query<CountRecord>(`
    SELECT COUNT_BIG(1) AS total
    FROM ${itemsTable} AS item
    ${optionWhereSql()};
  `);

  return { records: records.recordset, total: Number(count.recordset[0]?.total ?? 0) };
}

export async function listItemPriceSummaries(query: ItemPriceSummaryQuery): Promise<ItemPriceSummaryRecord[]> {
  const pool = await getDatabasePool();
  const request = pool.request();
  bindPriceSummaryFilters(request, query);

  const filteredItemsSql = `
    SELECT item.*
    FROM ${itemsTable} AS item
    WHERE CONVERT(BIGINT, item.ITEM_NO) IN (
      SELECT ids.id
      FROM OPENJSON(@itemIdsJson) WITH (id BIGINT '$') AS ids
    )
  `;

  const result = await request.query<ItemPriceSummaryRecord>(`
    ${priceAnalyticsCte(filteredItemsSql)}
    SELECT ${priceSummarySelectSql()}
    FROM price_summary AS price
    ORDER BY price.itemId ASC;
  `);

  return result.recordset;
}

export async function listSupplierMatrix(
  ownerUserId: number,
  query: ItemSupplierMatrixQuery,
): Promise<ItemSupplierMatrixRecord[]> {
  const pool = await getDatabasePool();
  const request = pool.request();
  bindSupplierMatrixFilters(request, ownerUserId, query);

  const result = await request.query<ItemSupplierMatrixRecord>(`
    WITH selected_items AS (
      SELECT ids.id AS itemId
      FROM OPENJSON(@itemIdsJson) WITH (id BIGINT '$') AS ids
    ),
    selected_suppliers AS (
      SELECT ids.id AS supplierId
      FROM OPENJSON(@supplierIdsJson) WITH (id BIGINT '$') AS ids
    ),
    normalized AS (
      SELECT
        TRY_CONVERT(BIGINT, tx.ITEM_NO) AS itemId,
        TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) AS supplierId,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))), N''),
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.SUPPLIER_CODE))), N'')
        ) AS supplierCode,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME))), N''),
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), tx.SUPPLIER_NAME_EN))), N''),
          N'—'
        ) AS supplierName,
        TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) AS transactionDate,
        TRY_CONVERT(DATETIME2(3), tx.CONFIRM_DATE) AS confirmDate,
        TRY_CONVERT(DATE, tx.VENDOR_INVOICE_DATE) AS vendorInvoiceDate,
        TRY_CONVERT(DATE, tx.BILL_DATE) AS billDate,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.INVOICE_NO))), N'') AS invoiceNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.INV_VOUCHER_NO))), N'') AS invoiceVoucherNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.ORDER_ID))), N'') AS orderId,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.BILL_NO))), N'') AS billNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.VENDOR_INVOICE_NO))), N'') AS vendorInvoiceNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.LOT_NO))), N'') AS lotNo,
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) AS unitCost,
        TRY_CONVERT(DECIMAL(19,6), tx.QTY) AS quantity,
        TRY_CONVERT(DECIMAL(19,6), tx.BONUS_QTY) AS bonusQuantity,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.SOURCE_ROWID))), N'') AS sourceRowId,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N'') AS currencyCode,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N'') AS unitName
      FROM ${transactionsTable} AS tx
      INNER JOIN selected_items AS selected_item
        ON selected_item.itemId = tx.ITEM_NO
      INNER JOIN selected_suppliers AS selected_supplier
        ON selected_supplier.supplierId = tx.SUPPLIER_ID
      LEFT JOIN ${suppliersTable} AS supplier
        ON supplier.SUPPLIER_ID = tx.SUPPLIER_ID
      WHERE TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) IS NOT NULL
        AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) IS NOT NULL
    ),
    eligible AS (
      SELECT *
      FROM normalized
      WHERE (
        @period = 'ALL'
        OR transactionDate >= CASE @period
          WHEN '1M' THEN DATEADD(MONTH, -1, CONVERT(DATE, SYSDATETIME()))
          WHEN '3M' THEN DATEADD(MONTH, -3, CONVERT(DATE, SYSDATETIME()))
          WHEN '6M' THEN DATEADD(MONTH, -6, CONVERT(DATE, SYSDATETIME()))
          WHEN '1Y' THEN DATEADD(YEAR, -1, CONVERT(DATE, SYSDATETIME()))
          ELSE CONVERT(DATE, '19000101')
        END
      )
    ),
    scope_ranked AS (
      SELECT
        eligible.*,
        ROW_NUMBER() OVER (
          PARTITION BY itemId, supplierId
          ORDER BY ${chronologicalOrder()}
        ) AS scopeRowNumber
      FROM eligible
    ),
    chosen_scope AS (
      SELECT itemId, supplierId, currencyCode, unitName
      FROM scope_ranked
      WHERE scopeRowNumber = 1
    ),
    scoped AS (
      SELECT eligible.*
      FROM eligible
      INNER JOIN chosen_scope
        ON chosen_scope.itemId = eligible.itemId
       AND chosen_scope.supplierId = eligible.supplierId
       AND ISNULL(chosen_scope.currencyCode, N'') = ISNULL(eligible.currencyCode, N'')
       AND ISNULL(chosen_scope.unitName, N'') = ISNULL(eligible.unitName, N'')
    ),
    ranked AS (
      SELECT
        scoped.*,
        ROW_NUMBER() OVER (
          PARTITION BY itemId, supplierId
          ORDER BY ${chronologicalOrder()}
        ) AS chronologicalRowNumber,
        ROW_NUMBER() OVER (
          PARTITION BY itemId, supplierId
          ORDER BY unitCost ASC, ${chronologicalOrder("", "unitCost")}
        ) AS lowestRowNumber,
        ROW_NUMBER() OVER (
          PARTITION BY itemId, supplierId
          ORDER BY unitCost DESC, ${chronologicalOrder("", "unitCost")}
        ) AS highestRowNumber
      FROM scoped
    ),
    aggregates AS (
      SELECT
        itemId,
        supplierId,
        AVG(CONVERT(DECIMAL(38,10), unitCost)) AS averageUnitCost,
        COUNT_BIG(1) AS transactionCount,
        MAX(transactionDate) AS lastPurchaseDate
      FROM scoped
      GROUP BY itemId, supplierId
    ),
    actual_summary AS (
      SELECT
        aggregates.itemId,
        aggregates.supplierId,
        latest.supplierCode,
        latest.supplierName,
        latest.currencyCode,
        latest.unitName,
        latest.unitCost AS latestUnitCost,
        latest.transactionDate AS latestTransactionDate,
        previous.unitCost AS previousUnitCost,
        previous.transactionDate AS previousTransactionDate,
        lowest.unitCost AS lowestUnitCost,
        lowest.transactionDate AS lowestTransactionDate,
        highest.unitCost AS highestUnitCost,
        highest.transactionDate AS highestTransactionDate,
        aggregates.averageUnitCost,
        aggregates.transactionCount,
        aggregates.lastPurchaseDate,
        CASE
          WHEN previous.unitCost IS NULL THEN NULL
          ELSE CONVERT(DECIMAL(19,6), latest.unitCost - previous.unitCost)
        END AS changeAmount,
        CASE
          WHEN previous.unitCost IS NULL OR previous.unitCost = 0 THEN NULL
          ELSE CONVERT(DECIMAL(19,6), ((latest.unitCost - previous.unitCost) / previous.unitCost) * 100)
        END AS changePercent
      FROM aggregates
      INNER JOIN ranked AS latest
        ON latest.itemId = aggregates.itemId
       AND latest.supplierId = aggregates.supplierId
       AND latest.chronologicalRowNumber = 1
      LEFT JOIN ranked AS previous
        ON previous.itemId = aggregates.itemId
       AND previous.supplierId = aggregates.supplierId
       AND previous.chronologicalRowNumber = 2
      INNER JOIN ranked AS lowest
        ON lowest.itemId = aggregates.itemId
       AND lowest.supplierId = aggregates.supplierId
       AND lowest.lowestRowNumber = 1
      INNER JOIN ranked AS highest
        ON highest.itemId = aggregates.itemId
       AND highest.supplierId = aggregates.supplierId
       AND highest.highestRowNumber = 1
    ),
    quote_ranked AS (
      SELECT
        quote_row.item_id AS itemId,
        quote_row.supplier_id AS supplierId,
        quote_row.quoted_unit_cost AS latestQuoteUnitCost,
        quote_row.quote_date AS latestQuoteDate,
        quote_row.currency_code AS quoteCurrencyCode,
        quote_row.unit_name AS quoteUnitName,
        ROW_NUMBER() OVER (
          PARTITION BY quote_row.item_id, quote_row.supplier_id
          ORDER BY quote_row.quote_date DESC, quote_row.id DESC
        ) AS quoteRowNumber
      FROM dbo.TM_price_quotes AS quote_row
      INNER JOIN selected_items AS selected_item
        ON selected_item.itemId = quote_row.item_id
      INNER JOIN selected_suppliers AS selected_supplier
        ON selected_supplier.supplierId = quote_row.supplier_id
      WHERE quote_row.owner_user_id = @ownerUserId
        AND quote_row.is_active = 1
        AND (
          @period = 'ALL'
          OR quote_row.quote_date >= CASE @period
            WHEN '1M' THEN DATEADD(MONTH, -1, CONVERT(DATE, SYSDATETIME()))
            WHEN '3M' THEN DATEADD(MONTH, -3, CONVERT(DATE, SYSDATETIME()))
            WHEN '6M' THEN DATEADD(MONTH, -6, CONVERT(DATE, SYSDATETIME()))
            WHEN '1Y' THEN DATEADD(YEAR, -1, CONVERT(DATE, SYSDATETIME()))
            ELSE CONVERT(DATE, '19000101')
          END
        )
    ),
    latest_quote AS (
      SELECT
        itemId,
        supplierId,
        latestQuoteUnitCost,
        latestQuoteDate,
        quoteCurrencyCode,
        quoteUnitName
      FROM quote_ranked
      WHERE quoteRowNumber = 1
    )
    SELECT
      COALESCE(actual.itemId, quote.itemId) AS itemId,
      COALESCE(actual.supplierId, quote.supplierId) AS supplierId,
      COALESCE(actual.supplierCode, NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))), N'')) AS supplierCode,
      COALESCE(actual.supplierName, NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME))), N''), N'—') AS supplierName,
      actual.currencyCode,
      actual.unitName,
      actual.latestUnitCost,
      actual.latestTransactionDate,
      actual.previousUnitCost,
      actual.previousTransactionDate,
      actual.lowestUnitCost,
      actual.lowestTransactionDate,
      actual.highestUnitCost,
      actual.highestTransactionDate,
      actual.averageUnitCost,
      actual.transactionCount,
      actual.lastPurchaseDate,
      actual.changeAmount,
      actual.changePercent,
      quote.latestQuoteUnitCost,
      quote.latestQuoteDate,
      quote.quoteCurrencyCode,
      quote.quoteUnitName
    FROM actual_summary AS actual
    FULL OUTER JOIN latest_quote AS quote
      ON quote.itemId = actual.itemId
     AND quote.supplierId = actual.supplierId
    LEFT JOIN ${suppliersTable} AS supplier
      ON supplier.SUPPLIER_ID = COALESCE(actual.supplierId, quote.supplierId)
    ORDER BY COALESCE(actual.itemId, quote.itemId), COALESCE(actual.supplierId, quote.supplierId);
  `);

  return result.recordset;
}

export async function getItemsOverview(query: ItemOverviewQuery): Promise<ItemsOverviewRecord> {
  const pool = await getDatabasePool();
  const request = pool.request();
  bindListFilters(request, query);
  const result = await request.query<ItemsOverviewRecord>(`
    ${priceAnalyticsCte()}
    SELECT
      (SELECT COUNT_BIG(1) FROM filtered_items) AS totalItems,
      (SELECT COUNT_BIG(1) FROM price_summary) AS purchasedItems,
      (SELECT COUNT(DISTINCT supplierId) FROM scoped) AS supplierCount,
      (SELECT COUNT_BIG(1) FROM scoped) AS transactionCount,
      (SELECT COUNT_BIG(1) FROM price_summary WHERE changePercent > 0) AS priceIncreases,
      (SELECT COUNT_BIG(1) FROM price_summary WHERE changePercent < 0) AS priceDecreases,
      (SELECT COUNT_BIG(1) FROM price_summary WHERE latestUnitCost = highestUnitCost) AS latestAtHistoricalHigh;
  `);
  return result.recordset[0] ?? {
    totalItems: 0,
    purchasedItems: 0,
    supplierCount: 0,
    transactionCount: 0,
    priceIncreases: 0,
    priceDecreases: 0,
    latestAtHistoricalHigh: 0,
  };
}

export async function findItem(
  itemId: number,
  transaction?: DatabaseTransaction,
): Promise<ItemRecord | null> {
  const request = transaction ? transaction.request() : (await getDatabasePool()).request();
  const result = await request.input("itemId", sql.BigInt, itemId).query<ItemRecord>(`
    SELECT TOP (1) ${itemSelectSql()}
    FROM ${itemsTable} AS item ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
    WHERE CONVERT(BIGINT, item.ITEM_NO) = @itemId;
  `);
  return result.recordset[0] ?? null;
}

function bindItemInput(request: import("mssql").Request, input: ItemInput): void {
  request
    .input("name", sql.NVarChar(500), input.name)
    .input("parentName", sql.NVarChar(500), input.parentName)
    .input("categoryName", sql.NVarChar(250), input.categoryName)
    .input("unit", sql.NVarChar(100), input.unit)
    .input("pieceUnit", sql.NVarChar(100), input.pieceUnit)
    .input("factor", sql.Decimal(19, 6), input.factor)
    .input("isStockItem", sql.Int, input.isStockItem ? 1 : 0)
    .input("statusCode", sql.Int, input.statusCode)
    .input("isAsset", sql.Int, input.isAsset ? 1 : 0);
}

export async function createManualItem(transaction: DatabaseTransaction, input: ItemInput): Promise<number> {
  const request = transaction.request();
  bindItemInput(request, input);
  const result = await request.query<IdRecord>(`
    DECLARE @itemId BIGINT;
    DECLARE @itemCode NVARCHAR(100);

    SELECT @itemId = COALESCE(MIN(CONVERT(BIGINT, ITEM_NO)), 0) - 1
    FROM ${itemsTable} WITH (UPDLOCK, HOLDLOCK)
    WHERE CONVERT(BIGINT, ITEM_NO) < 0;

    IF @itemId >= 0 SET @itemId = -1;

    SET @itemCode = N'USR-ITEM-' + RIGHT(
      N'000000' + CONVERT(NVARCHAR(30), ABS(@itemId)),
      6
    );

    INSERT INTO ${itemsTable} (
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
    VALUES (
      @itemCode,
      @itemId,
      @itemCode,
      @name,
      @parentName,
      @categoryName,
      @unit,
      @pieceUnit,
      @factor,
      @isStockItem,
      @statusCode,
      @isAsset
    );

    SELECT @itemId AS id;
  `);
  return Number(result.recordset[0]?.id);
}

export async function updateItem(
  transaction: DatabaseTransaction,
  itemId: number,
  input: ItemInput,
): Promise<boolean> {
  const request = transaction.request();
  bindItemInput(request, input);
  const result = await request.input("itemId", sql.BigInt, itemId).query(`
    UPDATE ${itemsTable}
    SET
      ITEM_NAME = @name,
      ITEM_PARENT_NAME = @parentName,
      CATEGORY_NAME = @categoryName,
      UNIT = @unit,
      ITEM_PIECE_UNIT = @pieceUnit,
      FACTOR = @factor,
      IS_STOCK_ITEM = @isStockItem,
      ITEM_STATUS = @statusCode,
      IS_ASSET = @isAsset
    WHERE CONVERT(BIGINT, ITEM_NO) = @itemId;
  `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function addActivity(
  transaction: DatabaseTransaction,
  input: {
    itemId: number;
    actorUserId: number;
    actionType: "CREATED" | "UPDATED";
    beforeValues: Record<string, unknown> | null;
    afterValues: Record<string, unknown> | null;
  },
): Promise<void> {
  await transaction
    .request()
    .input("entityKey", sql.NVarChar(120), String(input.itemId))
    .input("actionType", sql.VarChar(30), input.actionType)
    .input("actorUserId", sql.Int, input.actorUserId)
    .input("beforeValues", sql.NVarChar(sql.MAX), input.beforeValues ? JSON.stringify(input.beforeValues) : null)
    .input("afterValues", sql.NVarChar(sql.MAX), input.afterValues ? JSON.stringify(input.afterValues) : null)
    .query(`
      INSERT INTO dbo.TM_procurement_activity (
        entity_type,
        entity_key,
        owner_user_id,
        action_type,
        actor_user_id,
        before_values,
        after_values
      )
      VALUES ('ITEM', @entityKey, NULL, @actionType, @actorUserId, @beforeValues, @afterValues);
    `);
}

export async function listActivity(itemId: number): Promise<ItemActivityRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("entityKey", sql.NVarChar(120), String(itemId))
    .query<ItemActivityRecord>(`
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
      WHERE activity.entity_type = 'ITEM'
        AND activity.entity_key = @entityKey
      ORDER BY activity.created_at_utc DESC, activity.id DESC;
    `);
  return result.recordset;
}

export const itemsRepository = {
  listItems,
  listItemOptions,
  listItemPriceSummaries,
  listSupplierMatrix,
  getItemsOverview,
  findItem,
  createManualItem,
  updateItem,
  addActivity,
  listActivity,
};


