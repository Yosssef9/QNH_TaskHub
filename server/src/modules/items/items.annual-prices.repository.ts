import { getDatabasePool, sql } from "../../database/sql.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
import { supplierScopeSql } from "../procurement-transactions/supplier-scope.sql.js";
import { bindListFilters, itemSelectSql, whereSql } from "./items.repository.js";
import type { AnnualPriceQuery } from "./items.types.js";

export interface AnnualPriceRecord {
  itemId: number | string;
  itemCode: string;
  itemName: string;
  categoryName: string | null;
  unitName: string | null;
  currencyCode: string | null;
  year0Cost: number | string | null;
  year1Cost: number | string | null;
  year2Cost: number | string | null;
  year0SupplierId: number | string | null;
  year1SupplierId: number | string | null;
  year2SupplierId: number | string | null;
  year0SupplierCode: string | null;
  year1SupplierCode: string | null;
  year2SupplierCode: string | null;
  year0SupplierName: string | null;
  year1SupplierName: string | null;
  year2SupplierName: string | null;
  year0Date: Date | null;
  year1Date: Date | null;
  year2Date: Date | null;
  year0Invoice: string | null;
  year1Invoice: string | null;
  year2Invoice: string | null;
  year0RecordCount: number | string | null;
  year0UnitPriceSum: number | string | null;
  year0MinimumPrice: number | string | null;
  year0MaximumPrice: number | string | null;
  year0DistinctPriceCount: number | string | null;
  year0ModeFrequency: number | string | null;
  year0MedianLower: number | string | null;
  year0MedianUpper: number | string | null;
  year0PurchasedQuantity: number | string | null;
  year0PurchaseValue: number | string | null;
  year0InvalidQuantityCount: number | string | null;
  year1RecordCount: number | string | null;
  year1UnitPriceSum: number | string | null;
  year1MinimumPrice: number | string | null;
  year1MaximumPrice: number | string | null;
  year1DistinctPriceCount: number | string | null;
  year1ModeFrequency: number | string | null;
  year1MedianLower: number | string | null;
  year1MedianUpper: number | string | null;
  year1PurchasedQuantity: number | string | null;
  year1PurchaseValue: number | string | null;
  year1InvalidQuantityCount: number | string | null;
  year2RecordCount: number | string | null;
  year2UnitPriceSum: number | string | null;
  year2MinimumPrice: number | string | null;
  year2MaximumPrice: number | string | null;
  year2DistinctPriceCount: number | string | null;
  year2ModeFrequency: number | string | null;
  year2MedianLower: number | string | null;
  year2MedianUpper: number | string | null;
  year2PurchasedQuantity: number | string | null;
  year2PurchaseValue: number | string | null;
  year2InvalidQuantityCount: number | string | null;
  previousChangePercent: number | string | null;
  latestChangePercent: number | string | null;
  year0Benchmark: number | string | null;
  year1Benchmark: number | string | null;
  year2Benchmark: number | string | null;
  year0Quantity: number | string | null;
  year1Quantity: number | string | null;
  year2Quantity: number | string | null;
  year0ActualCost: number | string | null;
  year1ActualCost: number | string | null;
  year2ActualCost: number | string | null;
  year0Savings: number | string | null;
  year1Savings: number | string | null;
  year2Savings: number | string | null;
  purchaseYearCount: number | string;
  totalSavings: number | string | null;
  summarySavings: number | string | null;
  summaryIncluded: number | string;
  summaryExcluded: number | string;
  summaryPartial: number | string;
}

interface CountRow { total: number | string }

/** Database ordering is selected only from trusted constants, never user-provided SQL text. */
export function annualPriceOrder(query: Pick<AnnualPriceQuery, "sortBy" | "sortDirection">): string {
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const order: Record<AnnualPriceQuery["sortBy"], string> = {
    performance: `CASE WHEN latestChangePercent IS NULL THEN 1 ELSE 0 END ASC, latestChangePercent ${direction}`,
    previousChange: `CASE WHEN previousChangePercent IS NULL THEN 1 ELSE 0 END ASC, previousChangePercent ${direction}`,
    name: `itemName ${direction}`,
    currentPrice: `CASE WHEN year2Cost IS NULL THEN 1 ELSE 0 END ASC, year2Cost ${direction}`,
    totalSavings: `CASE WHEN totalSavings IS NULL THEN 1 ELSE 0 END ASC, totalSavings ${direction}`,
    currentSupplier: `CASE WHEN year2SupplierName IS NULL THEN 1 ELSE 0 END ASC, year2SupplierName ${direction}`,
  };
  return `${order[query.sortBy]}, itemName ASC, itemId ASC`;
}

/** Resolve the selected comparison years against the current three-year window. */
export function resolveAnnualSavingsSelection(query: Pick<AnnualPriceQuery, "endingYear" | "savingsYears">) {
  const selectedYears = query.savingsYears ?? [query.endingYear - 2, query.endingYear - 1, query.endingYear];
  return {
    selectedYears,
    year0: selectedYears.includes(query.endingYear - 2),
    year1: selectedYears.includes(query.endingYear - 1),
    year2: selectedYears.includes(query.endingYear),
  };
}

/** Uses the same item/supplier filters as the existing Procurement Items SQL. */
export async function queryAnnualPrices(query: AnnualPriceQuery): Promise<{ records: AnnualPriceRecord[]; total: number; totalSavings: number; included: number; excluded: number; partial: number }> {
  const pool = await getDatabasePool();
  // No selection supplied means all comparisons (backward compatible with existing clients).
  const selected = resolveAnnualSavingsSelection(query);
  const bind = (request: import("mssql").Request, page = query.page): import("mssql").Request => {
    bindListFilters(request, { ...query, period: "ALL", sortBy: "name" });
    request
      .input("priceMethod", sql.VarChar(12), query.priceMethod)
      .input("year0", sql.Int, query.endingYear - 2)
      .input("year1", sql.Int, query.endingYear - 1)
      .input("year2", sql.Int, query.endingYear)
      .input("includeYear0", sql.Bit, selected.year0)
      .input("includeYear1", sql.Bit, selected.year1)
      .input("includeYear2", sql.Bit, selected.year2)
      .input("selectedYearCount", sql.Int, selected.selectedYears.length)
      .input("startDate", sql.Date, new Date(Date.UTC(query.endingYear - 2, 0, 1)))
      .input("benchmarkStartDate", sql.Date, new Date(Date.UTC(query.endingYear - 3, 0, 1)))
      .input("endDate", sql.Date, new Date(Date.UTC(query.endingYear + 1, 0, 1)))
      .input("offset", sql.Int, (page - 1) * query.pageSize)
      .input("pageSize", sql.Int, query.pageSize);
    return request;
  };

  // Count only items, not purchase rows. Items with no eligible purchase stay visible at the bottom.
  const countRequest = bind(pool.request());
  const countPromise = countRequest.query<CountRow>(`
    SELECT COUNT_BIG(1) AS total
    FROM ${PROCUREMENT_DB_OBJECTS.itemsTable} AS item
    ${whereSql()};
  `);

  const priceRequest = bind(pool.request());
  const priceSql = `
    WITH filtered_items AS (
      SELECT ${itemSelectSql()}
      FROM ${PROCUREMENT_DB_OBJECTS.itemsTable} AS item
      ${whereSql()}
    ),
    normalized AS (
      SELECT
        fi.id AS itemId,
        TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) AS transactionDate,
        TRY_CONVERT(DATETIME2(3), tx.CONFIRM_DATE) AS confirmDate,
        TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) AS unitCost,
        TRY_CONVERT(DECIMAL(19,6), tx.QTY) AS quantity,
        TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) AS supplierId,
        COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE))), N''),
                 NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.SUPPLIER_CODE))), N'')) AS supplierCode,
        COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), supplier.SUPPLIER_NAME))), N''),
                 NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(500), tx.SUPPLIER_NAME_EN))), N''), N'—') AS supplierName,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N'') AS currencyCode,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N'') AS unitName,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.INVOICE_NO))), N'') AS invoiceNo,
        NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(120), tx.SOURCE_ROWID))), N'') AS sourceRowId
      FROM filtered_items fi
      INNER JOIN ${PROCUREMENT_DB_OBJECTS.transactionsTable} tx ON tx.ITEM_NO = fi.id
      LEFT JOIN ${PROCUREMENT_DB_OBJECTS.suppliersTable} supplier ON supplier.SUPPLIER_ID = tx.SUPPLIER_ID
      WHERE tx.SUPPLIER_ID IS NOT NULL
        AND tx.DELIVERY_NOTE_DATE >= @benchmarkStartDate
        AND tx.DELIVERY_NOTE_DATE < @endDate
        AND tx.DELIVERY_NOTE_DATE < DATEADD(DAY, 1, CONVERT(DATE, SYSDATETIME()))
        AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) > 0
        -- Exclude only explicitly identified cancelled / void / reversed source rows.
        -- Numeric or site-specific status codes require a separately confirmed mapping.
        AND UPPER(COALESCE(CONVERT(NVARCHAR(100), tx.INVOICE_STATUS), N'')) NOT LIKE N'%CANCEL%'
        AND UPPER(COALESCE(CONVERT(NVARCHAR(100), tx.INVOICE_STATUS), N'')) NOT LIKE N'%VOID%'
        AND UPPER(COALESCE(CONVERT(NVARCHAR(100), tx.INVOICE_STATUS), N'')) NOT LIKE N'%REVERS%'
        AND UPPER(COALESCE(CONVERT(NVARCHAR(250), tx.STATUS_NAME_EN), N'')) NOT LIKE N'%CANCEL%'
        AND UPPER(COALESCE(CONVERT(NVARCHAR(250), tx.STATUS_NAME_EN), N'')) NOT LIKE N'%VOID%'
        AND UPPER(COALESCE(CONVERT(NVARCHAR(250), tx.STATUS_NAME_EN), N'')) NOT LIKE N'%REVERS%'
        AND ${supplierScopeSql('tx.SUPPLIER_ID')}
        AND (@currencyCode IS NULL OR ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N'') = @currencyCode)
        AND (@unitName IS NULL OR ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N'') = @unitName)
    ),
    newest_scope AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY itemId
        ORDER BY transactionDate DESC, confirmDate DESC, invoiceNo DESC, sourceRowId DESC, supplierId ASC
      ) AS scopeRank
      FROM normalized
      WHERE transactionDate >= @startDate
    ),
    scoped AS (
      SELECT n.*
      FROM normalized n
      INNER JOIN newest_scope s ON s.itemId = n.itemId AND s.scopeRank = 1
       AND ISNULL(n.currencyCode, N'') = ISNULL(s.currencyCode, N'')
       AND ISNULL(n.unitName, N'') = ISNULL(s.unitName, N'')
    ),
    yearly_prices AS (
      SELECT s.*, YEAR(s.transactionDate) AS purchaseYear
      FROM scoped s
    ),
    annual_statistics AS (
      SELECT itemId, purchaseYear,
        COUNT_BIG(1) AS transactionCount,
        SUM(CONVERT(DECIMAL(28,6), unitCost)) AS unitPriceSum,
        MIN(unitCost) AS minimumPrice,
        MAX(unitCost) AS maximumPrice,
        COUNT(DISTINCT unitCost) AS distinctPriceCount,
        SUM(CASE WHEN quantity IS NULL OR quantity <= 0 THEN 1 ELSE 0 END) AS invalidQuantityCount,
        SUM(CASE WHEN quantity > 0 THEN CONVERT(DECIMAL(28,6), quantity) ELSE CONVERT(DECIMAL(28,6), 0) END) AS purchasedQuantity,
        SUM(CASE WHEN quantity > 0 THEN CONVERT(DECIMAL(28,6), quantity * unitCost) ELSE CONVERT(DECIMAL(28,6), 0) END) AS actualSpending
      FROM yearly_prices
      GROUP BY itemId, purchaseYear
    ),
    ranked AS (
      SELECT p.*,
        ROW_NUMBER() OVER (PARTITION BY itemId, purchaseYear
          ORDER BY unitCost ASC, transactionDate DESC, confirmDate DESC, invoiceNo DESC, sourceRowId DESC, supplierId ASC) AS lowestRank,
        ROW_NUMBER() OVER (PARTITION BY itemId, purchaseYear
          ORDER BY transactionDate DESC, confirmDate DESC, invoiceNo DESC, sourceRowId DESC, supplierId ASC) AS latestRank,
        COUNT_BIG(1) OVER (PARTITION BY itemId, purchaseYear) AS medianCount
      FROM yearly_prices p
    ),
    median_prices AS (
      SELECT itemId, purchaseYear,
        AVG(CONVERT(DECIMAL(28,6),unitCost)) AS medianCost,
        MIN(unitCost) AS medianLower,
        MAX(unitCost) AS medianUpper
      FROM ranked
      WHERE lowestRank IN ((medianCount + 1) / 2, (medianCount + 2) / 2)
      GROUP BY itemId, purchaseYear
    ),
    frequency AS (
      SELECT itemId, purchaseYear, unitCost,
        COUNT_BIG(1) AS occurrences,
        MAX(transactionDate) AS lastOccurrence
      FROM yearly_prices
      GROUP BY itemId, purchaseYear, unitCost
    ),
    mode_ranked AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY itemId, purchaseYear
        ORDER BY occurrences DESC, lastOccurrence DESC, unitCost ASC
      ) AS frequencyRank
      FROM frequency
    ),
    annual_price_values AS (
      SELECT st.itemId, st.purchaseYear, st.transactionCount, st.invalidQuantityCount,
        st.purchasedQuantity, st.actualSpending,
        st.unitPriceSum, st.minimumPrice, st.maximumPrice, st.distinctPriceCount,
        med.medianLower, med.medianUpper, md.occurrences AS modeFrequency,
        CONVERT(DECIMAL(19,6), CASE @priceMethod
          WHEN 'lowest' THEN chosen.unitCost
          WHEN 'latest' THEN chosen.unitCost
          WHEN 'average' THEN st.unitPriceSum / NULLIF(st.transactionCount, 0)
          WHEN 'median' THEN med.medianCost
          WHEN 'mode' THEN md.unitCost
          WHEN 'weighted' THEN CASE WHEN st.invalidQuantityCount = 0 AND st.purchasedQuantity > 0
            THEN st.actualSpending / NULLIF(st.purchasedQuantity,0) ELSE NULL END
        END) AS unitCost,
        chosen.supplierId, chosen.supplierCode, chosen.supplierName,
        chosen.transactionDate, chosen.invoiceNo
      FROM annual_statistics st
      LEFT JOIN ranked chosen ON chosen.itemId = st.itemId AND chosen.purchaseYear = st.purchaseYear
        AND ((@priceMethod = 'lowest' AND chosen.lowestRank = 1)
          OR (@priceMethod = 'latest' AND chosen.latestRank = 1))
      LEFT JOIN median_prices med ON med.itemId = st.itemId AND med.purchaseYear = st.purchaseYear
      LEFT JOIN mode_ranked md ON md.itemId = st.itemId AND md.purchaseYear = st.purchaseYear AND md.frequencyRank = 1
    ),
    annual_values AS (
      SELECT
        fi.id AS itemId, fi.code AS itemCode, fi.name AS itemName, fi.categoryName,
        s.currencyCode, s.unitName,
        y0.unitCost AS year0Cost, y1.unitCost AS year1Cost, y2.unitCost AS year2Cost,
        y0.supplierId AS year0SupplierId, y1.supplierId AS year1SupplierId, y2.supplierId AS year2SupplierId,
        y0.supplierCode AS year0SupplierCode, y1.supplierCode AS year1SupplierCode, y2.supplierCode AS year2SupplierCode,
        y0.supplierName AS year0SupplierName, y1.supplierName AS year1SupplierName, y2.supplierName AS year2SupplierName,
        y0.transactionDate AS year0Date, y1.transactionDate AS year1Date, y2.transactionDate AS year2Date,
        y0.invoiceNo AS year0Invoice, y1.invoiceNo AS year1Invoice, y2.invoiceNo AS year2Invoice,
        y0.transactionCount AS year0RecordCount, y1.transactionCount AS year1RecordCount, y2.transactionCount AS year2RecordCount,
        y0.unitPriceSum AS year0UnitPriceSum, y1.unitPriceSum AS year1UnitPriceSum, y2.unitPriceSum AS year2UnitPriceSum,
        y0.minimumPrice AS year0MinimumPrice, y1.minimumPrice AS year1MinimumPrice, y2.minimumPrice AS year2MinimumPrice,
        y0.maximumPrice AS year0MaximumPrice, y1.maximumPrice AS year1MaximumPrice, y2.maximumPrice AS year2MaximumPrice,
        y0.distinctPriceCount AS year0DistinctPriceCount, y1.distinctPriceCount AS year1DistinctPriceCount, y2.distinctPriceCount AS year2DistinctPriceCount,
        y0.modeFrequency AS year0ModeFrequency, y1.modeFrequency AS year1ModeFrequency, y2.modeFrequency AS year2ModeFrequency,
        y0.medianLower AS year0MedianLower, y1.medianLower AS year1MedianLower, y2.medianLower AS year2MedianLower,
        y0.medianUpper AS year0MedianUpper, y1.medianUpper AS year1MedianUpper, y2.medianUpper AS year2MedianUpper,
        y0.purchasedQuantity AS year0PurchasedQuantity, y1.purchasedQuantity AS year1PurchasedQuantity, y2.purchasedQuantity AS year2PurchasedQuantity,
        y0.actualSpending AS year0PurchaseValue, y1.actualSpending AS year1PurchaseValue, y2.actualSpending AS year2PurchaseValue,
        y0.invalidQuantityCount AS year0InvalidQuantityCount, y1.invalidQuantityCount AS year1InvalidQuantityCount, y2.invalidQuantityCount AS year2InvalidQuantityCount,
        CASE WHEN s.currencyCode IS NOT NULL AND s.unitName IS NOT NULL AND y0.unitCost > 0 AND y1.unitCost IS NOT NULL
          THEN CONVERT(DECIMAL(19,4), ((y1.unitCost - y0.unitCost) * 100.0) / NULLIF(y0.unitCost, 0))
          ELSE NULL END AS previousChangePercent,
        CASE WHEN s.currencyCode IS NOT NULL AND s.unitName IS NOT NULL AND y1.unitCost > 0 AND y2.unitCost IS NOT NULL
          THEN CONVERT(DECIMAL(19,4), ((y2.unitCost - y1.unitCost) * 100.0) / NULLIF(y1.unitCost, 0))
          ELSE NULL END AS latestChangePercent,
        b0.unitCost AS year0Benchmark, y0.unitCost AS year1Benchmark, y1.unitCost AS year2Benchmark,
        y0.purchasedQuantity AS year0Quantity, y1.purchasedQuantity AS year1Quantity, y2.purchasedQuantity AS year2Quantity,
        y0.actualSpending AS year0ActualCost, y1.actualSpending AS year1ActualCost, y2.actualSpending AS year2ActualCost,
        -- Each year stands alone: a missing benchmark in another year must
        -- not invalidate a comparable purchase year.
        -- Count purchase years INSIDE the selected three-year window.
        -- A previous-year benchmark outside that window never counts as a purchase year.
        (CASE WHEN y0.transactionCount > 0 AND y0.invalidQuantityCount = 0 AND y0.purchasedQuantity > 0 THEN 1 ELSE 0 END
         + CASE WHEN y1.transactionCount > 0 AND y1.invalidQuantityCount = 0 AND y1.purchasedQuantity > 0 THEN 1 ELSE 0 END
         + CASE WHEN y2.transactionCount > 0 AND y2.invalidQuantityCount = 0 AND y2.purchasedQuantity > 0 THEN 1 ELSE 0 END) AS purchaseYearCount,
        CASE WHEN s.currencyCode = N'SAR' AND NULLIF(s.unitName, N'') IS NOT NULL
            AND b0.unitCost > 0
            AND y0.transactionCount > 0 AND y0.invalidQuantityCount = 0
          THEN CONVERT(DECIMAL(28,4), b0.unitCost * y0.purchasedQuantity - y0.actualSpending)
          ELSE NULL END AS year0Savings,
        CASE WHEN s.currencyCode = N'SAR' AND NULLIF(s.unitName, N'') IS NOT NULL
            AND y0.unitCost > 0
            AND y1.transactionCount > 0 AND y1.invalidQuantityCount = 0
          THEN CONVERT(DECIMAL(28,4), y0.unitCost * y1.purchasedQuantity - y1.actualSpending)
          ELSE NULL END AS year1Savings,
        CASE WHEN s.currencyCode = N'SAR' AND NULLIF(s.unitName, N'') IS NOT NULL
            AND y1.unitCost > 0
            AND y2.transactionCount > 0 AND y2.invalidQuantityCount = 0
          THEN CONVERT(DECIMAL(28,4), y1.unitCost * y2.purchasedQuantity - y2.actualSpending)
          ELSE NULL END AS year2Savings
      FROM filtered_items fi
      LEFT JOIN newest_scope s ON s.itemId = fi.id AND s.scopeRank = 1
      LEFT JOIN annual_price_values b0 ON b0.itemId = fi.id AND b0.purchaseYear = @year0 - 1
      LEFT JOIN annual_price_values y0 ON y0.itemId = fi.id AND y0.purchaseYear = @year0
      LEFT JOIN annual_price_values y1 ON y1.itemId = fi.id AND y1.purchaseYear = @year1
      LEFT JOIN annual_price_values y2 ON y2.itemId = fi.id AND y2.purchaseYear = @year2
    ),
    annual_rows AS (
      SELECT *,
        (CASE WHEN @includeYear0 = 1 AND year0Savings IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN @includeYear1 = 1 AND year1Savings IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN @includeYear2 = 1 AND year2Savings IS NOT NULL THEN 1 ELSE 0 END) AS comparableYearCount,
        -- Exclude single-purchase-year items from the financial KPI, even if an
        -- earlier benchmark outside the window makes that single year's math possible.
        -- Keep yearly details for audit/inspection, but not in the item's total.
        CASE WHEN purchaseYearCount >= 2
          AND ((@includeYear0 = 1 AND year0Savings IS NOT NULL)
            OR (@includeYear1 = 1 AND year1Savings IS NOT NULL)
            OR (@includeYear2 = 1 AND year2Savings IS NOT NULL))
          THEN CONVERT(DECIMAL(28,4),
               CASE WHEN @includeYear0 = 1 THEN COALESCE(year0Savings, 0) ELSE 0 END
             + CASE WHEN @includeYear1 = 1 THEN COALESCE(year1Savings, 0) ELSE 0 END
             + CASE WHEN @includeYear2 = 1 THEN COALESCE(year2Savings, 0) ELSE 0 END)
          ELSE NULL END AS totalSavings
      FROM annual_values
    ),
    summarized AS (
      SELECT *,
        SUM(COALESCE(totalSavings, CONVERT(DECIMAL(28,4), 0))) OVER () AS summarySavings,
        SUM(CASE WHEN totalSavings IS NOT NULL THEN 1 ELSE 0 END) OVER () AS summaryIncluded,
        SUM(CASE WHEN totalSavings IS NULL THEN 1 ELSE 0 END) OVER () AS summaryExcluded,
        SUM(CASE WHEN totalSavings IS NOT NULL AND comparableYearCount < @selectedYearCount THEN 1 ELSE 0 END) OVER () AS summaryPartial
      FROM annual_rows
    )
    SELECT * FROM summarized
    ORDER BY ${annualPriceOrder(query)}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;
  const pricePromise = priceRequest.query<AnnualPriceRecord>(priceSql);

  const [count, prices] = await Promise.all([countPromise, pricePromise]);
  const total = Number(count.recordset[0]?.total ?? 0);
  // Preserve the all-filtered-items summary when an out-of-range page is empty.
  // The query is repeated for its first page only in that exceptional case.
  const first = prices.recordset[0] ?? (total > 0
    ? (await bind(pool.request(), 1).query<AnnualPriceRecord>(priceSql)).recordset[0]
    : undefined);
  return {
    total,
    records: prices.recordset,
    totalSavings: Number(first?.summarySavings ?? 0),
    included: Number(first?.summaryIncluded ?? 0),
    excluded: Number(first?.summaryExcluded ?? total),
    partial: Number(first?.summaryPartial ?? 0),
  };
}

