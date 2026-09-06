import { getDatabasePool, sql } from "../../database/sql.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
import type {
  ItemPriceHistoryQuery,
  ItemSupplierListQuery,
  ItemTransactionListQuery,
  ProcurementPriceFilter,
  SupplierItemPriceListQuery,
  SupplierPriceFilter,
} from "./procurement-transactions.types.js";

const transactionsTable = PROCUREMENT_DB_OBJECTS.transactionsTable;
const suppliersTable = PROCUREMENT_DB_OBJECTS.suppliersTable;
const itemsTable = PROCUREMENT_DB_OBJECTS.itemsTable;

export interface ProcurementTransactionRecord {
  sourceRowId: string | null;
  transactionDate: Date;
  confirmDate: Date | null;
  invoiceNo: string | null;
  vendorInvoiceNo: string | null;
  vendorInvoiceDate: Date | null;
  orderId: string | null;
  billNo: string | null;
  billDate: Date | null;
  supplierId: number | string;
  supplierCode: string | null;
  supplierName: string;
  itemId: number | string;
  itemCode: string | null;
  itemDescription: string | null;
  unitName: string | null;
  quantity: number | string | null;
  bonusQuantity: number | string | null;
  unitCost: number | string;
  currencyCode: string | null;
  lotNo: string | null;
  expiryDate: Date | null;
  statusCode: string | null;
  statusName: string | null;
  invoiceStatus: string | null;
}

export interface ItemAnalyticsRecord {
  scopeCount: number | string;
  currencyCode: string | null;
  unitName: string | null;
  latestTransactionDate: Date | null;
  latestUnitCost: number | string | null;
  latestSupplierId: number | string | null;
  latestSupplierCode: string | null;
  latestSupplierName: string | null;
  latestInvoiceNo: string | null;
  latestOrderId: string | null;
  previousTransactionDate: Date | null;
  previousUnitCost: number | string | null;
  previousSupplierId: number | string | null;
  previousSupplierCode: string | null;
  previousSupplierName: string | null;
  previousInvoiceNo: string | null;
  previousOrderId: string | null;
  lowestTransactionDate: Date | null;
  lowestUnitCost: number | string | null;
  lowestSupplierId: number | string | null;
  lowestSupplierCode: string | null;
  lowestSupplierName: string | null;
  lowestInvoiceNo: string | null;
  lowestOrderId: string | null;
  highestTransactionDate: Date | null;
  highestUnitCost: number | string | null;
  highestSupplierId: number | string | null;
  highestSupplierCode: string | null;
  highestSupplierName: string | null;
  highestInvoiceNo: string | null;
  highestOrderId: string | null;
  averageUnitCost: number | string | null;
  transactionCount: number | string | null;
  supplierCount: number | string | null;
  lastPurchaseDate: Date | null;
  changeAmount: number | string | null;
  changePercent: number | string | null;
}

export interface ItemSupplierSummaryRecord {
  supplierId: number | string;
  supplierCode: string | null;
  supplierName: string;
  currencyCode: string | null;
  unitName: string | null;
  latestUnitCost: number | string;
  latestTransactionDate: Date;
  previousUnitCost: number | string | null;
  previousTransactionDate: Date | null;
  lowestUnitCost: number | string;
  highestUnitCost: number | string;
  averageUnitCost: number | string;
  transactionCount: number | string;
  lastPurchaseDate: Date;
  currentLowestUnitCost: number | string;
  currentHighestUnitCost: number | string;
  changeAmount: number | string | null;
  changePercent: number | string | null;
}



export interface SupplierItemPriceSummaryRecord {
  itemId: number | string;
  itemCode: string | null;
  itemName: string;
  categoryName: string | null;
  currencyCode: string | null;
  unitName: string | null;
  latestUnitCost: number | string;
  latestTransactionDate: Date;
  previousUnitCost: number | string | null;
  previousTransactionDate: Date | null;
  lowestUnitCost: number | string;
  highestUnitCost: number | string;
  averageUnitCost: number | string;
  transactionCount: number | string;
  lastPurchaseDate: Date;
  marketSupplierCount: number | string;
  currentLowestUnitCost: number | string;
  currentHighestUnitCost: number | string;
  differenceFromLowestAmount: number | string;
  differenceFromLowestPercent: number | string | null;
}

export interface SupplierPriceAnalyticsRecord {
  itemCount: number | string;
  transactionCount: number | string;
  lastPurchaseDate: Date | null;
  comparableItemCount: number | string;
  currentLowestItemCount: number | string;
  currentHighestItemCount: number | string;
  singleSupplierItemCount: number | string;
  averageDifferenceFromLowestPercent: number | string | null;
}

interface CountRecord { total: number | string; }
export interface ItemPriceHistoryRecord extends ProcurementTransactionRecord { total: number | string; }
interface ScopeRecord { currencyCode: string | null; unitName: string | null; }

function normalizedCte(): string {
  return `
    WITH normalized AS (
      SELECT
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.SOURCE_ROWID))), N'') AS sourceRowId,
        TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) AS transactionDate,
        TRY_CONVERT(DATETIME2(3), tx.CONFIRM_DATE) AS confirmDate,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.INVOICE_NO))), N'') AS invoiceNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.VENDOR_INVOICE_NO))), N'') AS vendorInvoiceNo,
        TRY_CONVERT(DATE, tx.VENDOR_INVOICE_DATE) AS vendorInvoiceDate,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.ORDER_ID))), N'') AS orderId,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.BILL_NO))), N'') AS billNo,
        TRY_CONVERT(DATE, tx.BILL_DATE) AS billDate,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.INV_VOUCHER_NO))), N'') AS invoiceVoucherNo,
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
        TRY_CONVERT(BIGINT, tx.ITEM_NO) AS itemId,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.ITEM_CODE))), N'') AS itemCode,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), tx.ITEM_DESC))), N'') AS itemDescription,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N'') AS unitName,
        TRY_CONVERT(DECIMAL(19,6), tx.QTY) AS quantity,
        TRY_CONVERT(DECIMAL(19,6), tx.BONUS_QTY) AS bonusQuantity,
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) AS unitCost,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N'') AS currencyCode,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.LOT_NO))), N'') AS lotNo,
        TRY_CONVERT(DATE, tx.EXPIRY_DATE) AS expiryDate,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(60), tx.STATUS_CODE))), N'') AS statusCode,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(250), tx.STATUS_NAME_EN))), N'') AS statusName,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.INVOICE_STATUS))), N'') AS invoiceStatus
      FROM ${transactionsTable} AS tx
      LEFT JOIN ${suppliersTable} AS supplier
        ON supplier.SUPPLIER_ID = tx.SUPPLIER_ID
      WHERE tx.ITEM_NO = @itemId
        AND tx.SUPPLIER_ID IS NOT NULL
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
    )
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

function secondaryOrder(
  primaryColumn: string,
  candidates: ReadonlyArray<readonly [column: string, direction: "ASC" | "DESC"]>,
): string {
  const remaining = candidates.filter(([column]) => column !== primaryColumn);
  if (remaining.length === 0) return "";
  return `, ${remaining.map(([column, direction]) => `${column} ${direction}`).join(", ")}`;
}

function bindPriceFilters(request: import("mssql").Request, itemId: number, filter: ProcurementPriceFilter): void {
  request
    .input("itemId", sql.BigInt, itemId)
    .input("period", sql.VarChar(3), filter.period)
    .input("supplierIdsJson", sql.NVarChar(sql.MAX), filter.supplierIds?.length ? JSON.stringify(filter.supplierIds) : null)
    .input("currencyCode", sql.NVarChar(30), filter.currencyCode?.trim() || null)
    .input("unitName", sql.NVarChar(100), filter.unitName?.trim() || null);
}

const transactionSortColumns: Record<ItemTransactionListQuery["sortBy"], string> = {
  transactionDate: "transactionDate",
  unitCost: "unitCost",
  supplier: "supplierName",
  quantity: "quantity",
  invoiceNo: "invoiceNo",
};

const supplierSortColumns: Record<ItemSupplierListQuery["sortBy"], string> = {
  supplier: "supplierName",
  latest: "latestUnitCost",
  lowest: "lowestUnitCost",
  highest: "highestUnitCost",
  average: "averageUnitCost",
  transactions: "transactionCount",
  lastPurchase: "lastPurchaseDate",
};

export async function listItemTransactions(
  itemId: number,
  query: ItemTransactionListQuery,
): Promise<{ records: ProcurementTransactionRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const scopedCte = `
    ${normalizedCte()},
    chosen_scope AS (
      SELECT TOP (1) currencyCode, unitName
      FROM eligible
      ORDER BY ${chronologicalOrder()}
    ),
    scoped AS (
      SELECT eligible.*
      FROM eligible
      INNER JOIN chosen_scope
        ON ISNULL(eligible.currencyCode, N'') = ISNULL(chosen_scope.currencyCode, N'')
       AND ISNULL(eligible.unitName, N'') = ISNULL(chosen_scope.unitName, N'')
    )
  `;

  const countRequest = pool.request();
  bindPriceFilters(countRequest, itemId, query);
  const countResult = await countRequest.query<CountRecord>(`
    ${scopedCte}
    SELECT COUNT_BIG(1) AS total FROM scoped;
  `);

  const recordsRequest = pool.request();
  bindPriceFilters(recordsRequest, itemId, query);
  const offset = (query.page - 1) * query.pageSize;
  recordsRequest.input("offset", sql.Int, offset).input("pageSize", sql.Int, query.pageSize);
  const orderColumn = transactionSortColumns[query.sortBy];
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const result = await recordsRequest.query<ProcurementTransactionRecord>(`
    ${scopedCte}
    SELECT
      transactionDate,
      confirmDate,
      invoiceNo,
      vendorInvoiceNo,
      vendorInvoiceDate,
      orderId,
      billNo,
      billDate,
      supplierId,
      supplierCode,
      supplierName,
      itemId,
      itemCode,
      itemDescription,
      unitName,
      quantity,
      bonusQuantity,
      unitCost,
      currencyCode,
      lotNo,
      expiryDate,
      statusCode,
      statusName,
      invoiceStatus
    FROM scoped
    ORDER BY ${orderColumn} ${direction}, ${chronologicalOrder("", orderColumn)}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  return { records: result.recordset, total: Number(countResult.recordset[0]?.total ?? 0) };
}

export async function getItemAnalytics(itemId: number, filter: ProcurementPriceFilter): Promise<ItemAnalyticsRecord> {
  const pool = await getDatabasePool();
  const request = pool.request();
  bindPriceFilters(request, itemId, filter);
  const result = await request.query<ItemAnalyticsRecord>(`
    ${normalizedCte()},
    scope_count AS (
      SELECT COUNT_BIG(1) AS scopeCount
      FROM (
        SELECT currencyCode, unitName
        FROM eligible
        GROUP BY currencyCode, unitName
      ) AS scopes
    ),
    chosen_scope AS (
      SELECT TOP (1) currencyCode, unitName
      FROM eligible
      ORDER BY ${chronologicalOrder()}
    ),
    scoped AS (
      SELECT eligible.*
      FROM eligible
      INNER JOIN chosen_scope
        ON ISNULL(eligible.currencyCode, N'') = ISNULL(chosen_scope.currencyCode, N'')
       AND ISNULL(eligible.unitName, N'') = ISNULL(chosen_scope.unitName, N'')
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY ${chronologicalOrder()}) AS rn
      FROM scoped
    ),
    aggregates AS (
      SELECT
        AVG(CONVERT(DECIMAL(38,10), unitCost)) AS averageUnitCost,
        COUNT_BIG(1) AS transactionCount,
        COUNT(DISTINCT supplierId) AS supplierCount,
        MAX(transactionDate) AS lastPurchaseDate
      FROM scoped
    ),
    lowest AS (
      SELECT TOP (1) * FROM scoped ORDER BY unitCost ASC, ${chronologicalOrder("", "unitCost")}
    ),
    highest AS (
      SELECT TOP (1) * FROM scoped ORDER BY unitCost DESC, ${chronologicalOrder("", "unitCost")}
    )
    SELECT
      COALESCE((SELECT scopeCount FROM scope_count), 0) AS scopeCount,
      chosen_scope.currencyCode,
      chosen_scope.unitName,
      latest.transactionDate AS latestTransactionDate,
      latest.unitCost AS latestUnitCost,
      latest.supplierId AS latestSupplierId,
      latest.supplierCode AS latestSupplierCode,
      latest.supplierName AS latestSupplierName,
      latest.invoiceNo AS latestInvoiceNo,
      latest.orderId AS latestOrderId,
      previous.transactionDate AS previousTransactionDate,
      previous.unitCost AS previousUnitCost,
      previous.supplierId AS previousSupplierId,
      previous.supplierCode AS previousSupplierCode,
      previous.supplierName AS previousSupplierName,
      previous.invoiceNo AS previousInvoiceNo,
      previous.orderId AS previousOrderId,
      lowest.transactionDate AS lowestTransactionDate,
      lowest.unitCost AS lowestUnitCost,
      lowest.supplierId AS lowestSupplierId,
      lowest.supplierCode AS lowestSupplierCode,
      lowest.supplierName AS lowestSupplierName,
      lowest.invoiceNo AS lowestInvoiceNo,
      lowest.orderId AS lowestOrderId,
      highest.transactionDate AS highestTransactionDate,
      highest.unitCost AS highestUnitCost,
      highest.supplierId AS highestSupplierId,
      highest.supplierCode AS highestSupplierCode,
      highest.supplierName AS highestSupplierName,
      highest.invoiceNo AS highestInvoiceNo,
      highest.orderId AS highestOrderId,
      aggregates.averageUnitCost,
      aggregates.transactionCount,
      aggregates.supplierCount,
      aggregates.lastPurchaseDate,
      CASE
        WHEN latest.unitCost IS NULL OR previous.unitCost IS NULL THEN NULL
        ELSE CONVERT(DECIMAL(19,6), latest.unitCost - previous.unitCost)
      END AS changeAmount,
      CASE
        WHEN latest.unitCost IS NULL OR previous.unitCost IS NULL OR previous.unitCost = 0 THEN NULL
        ELSE CONVERT(DECIMAL(19,6), ((latest.unitCost - previous.unitCost) / previous.unitCost) * 100)
      END AS changePercent
    FROM (SELECT 1 AS seed) AS seed
    LEFT JOIN chosen_scope ON 1 = 1
    LEFT JOIN ranked AS latest ON latest.rn = 1
    LEFT JOIN ranked AS previous ON previous.rn = 2
    LEFT JOIN lowest ON 1 = 1
    LEFT JOIN highest ON 1 = 1
    LEFT JOIN aggregates ON 1 = 1;
  `);

  return result.recordset[0] ?? {
    scopeCount: 0,
    currencyCode: null,
    unitName: null,
    latestTransactionDate: null,
    latestUnitCost: null,
    latestSupplierId: null,
    latestSupplierCode: null,
    latestSupplierName: null,
    latestInvoiceNo: null,
    latestOrderId: null,
    previousTransactionDate: null,
    previousUnitCost: null,
    previousSupplierId: null,
    previousSupplierCode: null,
    previousSupplierName: null,
    previousInvoiceNo: null,
    previousOrderId: null,
    lowestTransactionDate: null,
    lowestUnitCost: null,
    lowestSupplierId: null,
    lowestSupplierCode: null,
    lowestSupplierName: null,
    lowestInvoiceNo: null,
    lowestOrderId: null,
    highestTransactionDate: null,
    highestUnitCost: null,
    highestSupplierId: null,
    highestSupplierCode: null,
    highestSupplierName: null,
    highestInvoiceNo: null,
    highestOrderId: null,
    averageUnitCost: null,
    transactionCount: 0,
    supplierCount: 0,
    lastPurchaseDate: null,
    changeAmount: null,
    changePercent: null,
  };
}

export async function listItemSupplierSummaries(
  itemId: number,
  query: ItemSupplierListQuery,
): Promise<{ records: ItemSupplierSummaryRecord[]; scope: ScopeRecord | null; total: number }> {
  const pool = await getDatabasePool();
  const request = pool.request();
  bindPriceFilters(request, itemId, query);
  const offset = (query.page - 1) * query.pageSize;
  request.input("offset", sql.Int, offset).input("pageSize", sql.Int, query.pageSize);
  const orderColumn = supplierSortColumns[query.sortBy];
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";

  const result = await request.query<ItemSupplierSummaryRecord & ScopeRecord>(`
    ${normalizedCte()},
    chosen_scope AS (
      SELECT TOP (1) currencyCode, unitName
      FROM eligible
      ORDER BY ${chronologicalOrder()}
    ),
    scoped AS (
      SELECT eligible.*
      FROM eligible
      INNER JOIN chosen_scope
        ON ISNULL(eligible.currencyCode, N'') = ISNULL(chosen_scope.currencyCode, N'')
       AND ISNULL(eligible.unitName, N'') = ISNULL(chosen_scope.unitName, N'')
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY supplierId
        ORDER BY ${chronologicalOrder()}
      ) AS supplierRowNumber
      FROM scoped
    ),
    aggregates AS (
      SELECT
        supplierId,
        MAX(supplierCode) AS supplierCode,
        MAX(supplierName) AS supplierName,
        MIN(unitCost) AS lowestUnitCost,
        MAX(unitCost) AS highestUnitCost,
        AVG(CONVERT(DECIMAL(38,10), unitCost)) AS averageUnitCost,
        COUNT_BIG(1) AS transactionCount,
        MAX(transactionDate) AS lastPurchaseDate
      FROM scoped
      GROUP BY supplierId
    ),
    combined AS (
      SELECT
        aggregates.supplierId,
        aggregates.supplierCode,
        aggregates.supplierName,
        chosen_scope.currencyCode,
        chosen_scope.unitName,
        latest.unitCost AS latestUnitCost,
        latest.transactionDate AS latestTransactionDate,
        previous.unitCost AS previousUnitCost,
        previous.transactionDate AS previousTransactionDate,
        aggregates.lowestUnitCost,
        aggregates.highestUnitCost,
        aggregates.averageUnitCost,
        aggregates.transactionCount,
        aggregates.lastPurchaseDate
      FROM aggregates
      INNER JOIN ranked AS latest
        ON latest.supplierId = aggregates.supplierId
       AND latest.supplierRowNumber = 1
      LEFT JOIN ranked AS previous
        ON previous.supplierId = aggregates.supplierId
       AND previous.supplierRowNumber = 2
      CROSS JOIN chosen_scope
    ),
    final AS (
      SELECT
        combined.*,
        MIN(latestUnitCost) OVER () AS currentLowestUnitCost,
        MAX(latestUnitCost) OVER () AS currentHighestUnitCost,
        CASE
          WHEN previousUnitCost IS NULL THEN NULL
          ELSE CONVERT(DECIMAL(19,6), latestUnitCost - previousUnitCost)
        END AS changeAmount,
        CASE
          WHEN previousUnitCost IS NULL OR previousUnitCost = 0 THEN NULL
          ELSE CONVERT(DECIMAL(19,6), ((latestUnitCost - previousUnitCost) / previousUnitCost) * 100)
        END AS changePercent
      FROM combined
    )
    SELECT *
    FROM final
    ORDER BY ${orderColumn} ${direction}${secondaryOrder(orderColumn, [["supplierName", "ASC"], ["supplierId", "ASC"]])}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  const metadataRequest = pool.request();
  bindPriceFilters(metadataRequest, itemId, query);
  const metadataResult = await metadataRequest.query<ScopeRecord & CountRecord>(`
    ${normalizedCte()},
    chosen_scope AS (
      SELECT TOP (1) currencyCode, unitName
      FROM eligible
      ORDER BY ${chronologicalOrder()}
    ),
    scoped AS (
      SELECT eligible.*
      FROM eligible
      INNER JOIN chosen_scope
        ON ISNULL(eligible.currencyCode, N'') = ISNULL(chosen_scope.currencyCode, N'')
       AND ISNULL(eligible.unitName, N'') = ISNULL(chosen_scope.unitName, N'')
    )
    SELECT
      chosen_scope.currencyCode,
      chosen_scope.unitName,
      COUNT(DISTINCT scoped.supplierId) AS total
    FROM (SELECT 1 AS seed) AS seed
    LEFT JOIN chosen_scope ON 1 = 1
    LEFT JOIN scoped ON 1 = 1
    GROUP BY chosen_scope.currencyCode, chosen_scope.unitName;
  `);
  const metadata = metadataResult.recordset[0];
  return {
    records: result.recordset,
    scope: metadata && (metadata.currencyCode !== null || metadata.unitName !== null)
      ? { currencyCode: metadata.currencyCode, unitName: metadata.unitName }
      : null,
    total: Number(metadata?.total ?? 0),
  };
}


export async function listItemPriceHistory(
  itemId: number,
  query: ItemPriceHistoryQuery,
): Promise<{ records: ItemPriceHistoryRecord[]; scope: ScopeRecord | null; total: number }> {
  const pool = await getDatabasePool();
  const request = pool.request();
  bindPriceFilters(request, itemId, query);
  request.input("maxPoints", sql.Int, query.maxPoints);

  const result = await request.query<ItemPriceHistoryRecord>(`
    ${normalizedCte()},
    chosen_scope AS (
      SELECT TOP (1) currencyCode, unitName
      FROM eligible
      ORDER BY ${chronologicalOrder()}
    ),
    scoped AS (
      SELECT eligible.*
      FROM eligible
      INNER JOIN chosen_scope
        ON ISNULL(eligible.currencyCode, N'') = ISNULL(chosen_scope.currencyCode, N'')
       AND ISNULL(eligible.unitName, N'') = ISNULL(chosen_scope.unitName, N'')
    )
    SELECT TOP (@maxPoints)
      scoped.*,
      COUNT_BIG(1) OVER () AS total
    FROM scoped
    ORDER BY ${chronologicalOrder()};
  `);

  const first = result.recordset[0];
  return {
    records: result.recordset,
    scope: first ? { currencyCode: first.currencyCode, unitName: first.unitName } : null,
    total: Number(first?.total ?? 0),
  };
}


function supplierNormalizedCte(): string {
  return `
    WITH normalized AS (
      SELECT
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.SOURCE_ROWID))), N'') AS sourceRowId,
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
        TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) AS supplierId,
        TRY_CONVERT(BIGINT, tx.ITEM_NO) AS itemId,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), item.ITEM_CODE))), N''),
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.ITEM_CODE))), N'')
        ) AS itemCode,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), item.ITEM_NAME))), N''),
          NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), tx.ITEM_DESC))), N''),
          N'—'
        ) AS itemName,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(250), item.CATEGORY_NAME))), N'') AS categoryName,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N'') AS unitName,
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) AS unitCost,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N'') AS currencyCode,
        TRY_CONVERT(DECIMAL(19,6), tx.QTY) AS quantity,
        TRY_CONVERT(DECIMAL(19,6), tx.BONUS_QTY) AS bonusQuantity
      FROM ${transactionsTable} AS tx
      LEFT JOIN ${itemsTable} AS item
        ON item.ITEM_NO = tx.ITEM_NO
      WHERE tx.SUPPLIER_ID IS NOT NULL
        AND tx.ITEM_NO IS NOT NULL
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
    ),
    supplier_ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY itemId
          ORDER BY ${chronologicalOrder()}
        ) AS supplierItemRowNumber
      FROM eligible
      WHERE supplierId = @supplierId
    ),
    supplier_scope AS (
      SELECT
        itemId,
        itemCode,
        itemName,
        categoryName,
        currencyCode,
        unitName,
        unitCost AS latestUnitCost,
        transactionDate AS latestTransactionDate
      FROM supplier_ranked
      WHERE supplierItemRowNumber = 1
    ),
    supplier_scoped AS (
      SELECT eligible.*
      FROM eligible
      INNER JOIN supplier_scope
        ON supplier_scope.itemId = eligible.itemId
       AND ISNULL(supplier_scope.currencyCode, N'') = ISNULL(eligible.currencyCode, N'')
       AND ISNULL(supplier_scope.unitName, N'') = ISNULL(eligible.unitName, N'')
      WHERE eligible.supplierId = @supplierId
    ),
    supplier_scoped_ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY itemId
          ORDER BY ${chronologicalOrder()}
        ) AS scopedRowNumber
      FROM supplier_scoped
    ),
    supplier_aggregates AS (
      SELECT
        itemId,
        MIN(unitCost) AS lowestUnitCost,
        MAX(unitCost) AS highestUnitCost,
        AVG(CONVERT(DECIMAL(38,10), unitCost)) AS averageUnitCost,
        COUNT_BIG(1) AS transactionCount,
        MAX(transactionDate) AS lastPurchaseDate
      FROM supplier_scoped
      GROUP BY itemId
    ),
    market_ranked AS (
      SELECT
        eligible.*,
        ROW_NUMBER() OVER (
          PARTITION BY eligible.itemId, eligible.supplierId
          ORDER BY ${chronologicalOrder("eligible")}
        ) AS marketSupplierRowNumber
      FROM eligible
      INNER JOIN supplier_scope
        ON supplier_scope.itemId = eligible.itemId
       AND ISNULL(supplier_scope.currencyCode, N'') = ISNULL(eligible.currencyCode, N'')
       AND ISNULL(supplier_scope.unitName, N'') = ISNULL(eligible.unitName, N'')
    ),
    market_latest AS (
      SELECT *
      FROM market_ranked
      WHERE marketSupplierRowNumber = 1
    ),
    market_aggregates AS (
      SELECT
        itemId,
        COUNT_BIG(1) AS marketSupplierCount,
        MIN(unitCost) AS currentLowestUnitCost,
        MAX(unitCost) AS currentHighestUnitCost
      FROM market_latest
      GROUP BY itemId
    ),
    supplier_items AS (
      SELECT
        supplier_scope.itemId,
        supplier_scope.itemCode,
        supplier_scope.itemName,
        supplier_scope.categoryName,
        supplier_scope.currencyCode,
        supplier_scope.unitName,
        latest.unitCost AS latestUnitCost,
        latest.transactionDate AS latestTransactionDate,
        previous.unitCost AS previousUnitCost,
        previous.transactionDate AS previousTransactionDate,
        supplier_aggregates.lowestUnitCost,
        supplier_aggregates.highestUnitCost,
        supplier_aggregates.averageUnitCost,
        supplier_aggregates.transactionCount,
        supplier_aggregates.lastPurchaseDate,
        market_aggregates.marketSupplierCount,
        market_aggregates.currentLowestUnitCost,
        market_aggregates.currentHighestUnitCost,
        CONVERT(DECIMAL(19,6), latest.unitCost - market_aggregates.currentLowestUnitCost) AS differenceFromLowestAmount,
        CASE
          WHEN market_aggregates.currentLowestUnitCost = 0 THEN NULL
          ELSE CONVERT(
            DECIMAL(19,6),
            ((latest.unitCost - market_aggregates.currentLowestUnitCost) / market_aggregates.currentLowestUnitCost) * 100
          )
        END AS differenceFromLowestPercent
      FROM supplier_scope
      INNER JOIN supplier_aggregates
        ON supplier_aggregates.itemId = supplier_scope.itemId
      INNER JOIN supplier_scoped_ranked AS latest
        ON latest.itemId = supplier_scope.itemId
       AND latest.scopedRowNumber = 1
      LEFT JOIN supplier_scoped_ranked AS previous
        ON previous.itemId = supplier_scope.itemId
       AND previous.scopedRowNumber = 2
      INNER JOIN market_aggregates
        ON market_aggregates.itemId = supplier_scope.itemId
    )
  `;
}

const supplierItemSortColumns: Record<SupplierItemPriceListQuery["sortBy"], string> = {
  item: "itemName",
  latest: "latestUnitCost",
  lowest: "lowestUnitCost",
  highest: "highestUnitCost",
  average: "averageUnitCost",
  difference: "differenceFromLowestPercent",
  transactions: "transactionCount",
  lastPurchase: "lastPurchaseDate",
};

function bindSupplierPriceFilter(
  request: import("mssql").Request,
  supplierId: number,
  filter: SupplierPriceFilter,
): void {
  request
    .input("supplierId", sql.BigInt, supplierId)
    .input("period", sql.VarChar(3), filter.period);
}

export async function listSupplierItemPriceSummaries(
  supplierId: number,
  query: SupplierItemPriceListQuery,
): Promise<{ records: SupplierItemPriceSummaryRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const countRequest = pool.request();
  bindSupplierPriceFilter(countRequest, supplierId, query);
  const countResult = await countRequest.query<CountRecord>(`
    ${supplierNormalizedCte()}
    SELECT COUNT_BIG(1) AS total
    FROM supplier_items;
  `);

  const request = pool.request();
  bindSupplierPriceFilter(request, supplierId, query);
  const offset = (query.page - 1) * query.pageSize;
  request.input("offset", sql.Int, offset).input("pageSize", sql.Int, query.pageSize);
  const orderColumn = supplierItemSortColumns[query.sortBy];
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const result = await request.query<SupplierItemPriceSummaryRecord>(`
    ${supplierNormalizedCte()}
    SELECT *
    FROM supplier_items
    ORDER BY ${orderColumn} ${direction}${secondaryOrder(orderColumn, [["itemName", "ASC"], ["itemId", "ASC"]])}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  return {
    records: result.recordset,
    total: Number(countResult.recordset[0]?.total ?? 0),
  };
}

export async function getSupplierPriceAnalytics(
  supplierId: number,
  filter: SupplierPriceFilter,
): Promise<SupplierPriceAnalyticsRecord> {
  const pool = await getDatabasePool();
  const request = pool.request();
  bindSupplierPriceFilter(request, supplierId, filter);
  const result = await request.query<SupplierPriceAnalyticsRecord>(`
    ${supplierNormalizedCte()}
    SELECT
      COUNT_BIG(1) AS itemCount,
      COALESCE(SUM(CONVERT(BIGINT, transactionCount)), 0) AS transactionCount,
      MAX(lastPurchaseDate) AS lastPurchaseDate,
      COALESCE(SUM(CASE WHEN marketSupplierCount > 1 THEN 1 ELSE 0 END), 0) AS comparableItemCount,
      COALESCE(SUM(CASE WHEN marketSupplierCount > 1 AND latestUnitCost = currentLowestUnitCost THEN 1 ELSE 0 END), 0) AS currentLowestItemCount,
      COALESCE(SUM(CASE WHEN marketSupplierCount > 1 AND latestUnitCost = currentHighestUnitCost THEN 1 ELSE 0 END), 0) AS currentHighestItemCount,
      COALESCE(SUM(CASE WHEN marketSupplierCount = 1 THEN 1 ELSE 0 END), 0) AS singleSupplierItemCount,
      AVG(
        CASE
          WHEN marketSupplierCount > 1 THEN CONVERT(DECIMAL(38,10), differenceFromLowestPercent)
          ELSE NULL
        END
      ) AS averageDifferenceFromLowestPercent
    FROM supplier_items;
  `);

  return result.recordset[0] ?? {
    itemCount: 0,
    transactionCount: 0,
    lastPurchaseDate: null,
    comparableItemCount: 0,
    currentLowestItemCount: 0,
    currentHighestItemCount: 0,
    singleSupplierItemCount: 0,
    averageDifferenceFromLowestPercent: null,
  };
}

export const procurementTransactionsRepository = {
  listItemTransactions,
  listItemPriceHistory,
  getItemAnalytics,
  listItemSupplierSummaries,
  listSupplierItemPriceSummaries,
  getSupplierPriceAnalytics,
};

