import { getDatabasePool, sql } from "../../database/sql.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
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
  previousChangePercent: number | string | null;
  latestChangePercent: number | string | null;
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
    currentSupplier: `CASE WHEN year2SupplierName IS NULL THEN 1 ELSE 0 END ASC, year2SupplierName ${direction}`,
  };
  return `${order[query.sortBy]}, itemName ASC, itemId ASC`;
}

/** Uses the same item/supplier filters as the existing Procurement Items SQL. */
export async function queryAnnualPrices(query: AnnualPriceQuery): Promise<{ records: AnnualPriceRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const bind = (request: import("mssql").Request): import("mssql").Request => {
    bindListFilters(request, { ...query, period: "ALL", sortBy: "name" });
    request
      .input("year0", sql.Int, query.endingYear - 2)
      .input("year1", sql.Int, query.endingYear - 1)
      .input("year2", sql.Int, query.endingYear)
      .input("startDate", sql.Date, new Date(Date.UTC(query.endingYear - 2, 0, 1)))
      .input("endDate", sql.Date, new Date(Date.UTC(query.endingYear + 1, 0, 1)))
      .input("offset", sql.Int, (query.page - 1) * query.pageSize)
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
  const pricePromise = priceRequest.query<AnnualPriceRecord>(`
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
        AND tx.DELIVERY_NOTE_DATE >= @startDate
        AND tx.DELIVERY_NOTE_DATE < @endDate
        AND tx.DELIVERY_NOTE_DATE < DATEADD(DAY, 1, CONVERT(DATE, SYSDATETIME()))
        AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) > 0
        AND (@supplierIdsJson IS NULL OR tx.SUPPLIER_ID IN (
          SELECT ids.id FROM OPENJSON(@supplierIdsJson) WITH (id BIGINT '$') ids
        ))
        AND (@currencyCode IS NULL OR ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(30), tx.CURRENCY_CODE))), N'') = @currencyCode)
        AND (@unitName IS NULL OR ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(100), tx.UNIT_NAME_EN))), N'') = @unitName)
    ),
    newest_scope AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY itemId
        ORDER BY transactionDate DESC, confirmDate DESC, invoiceNo DESC, sourceRowId DESC, supplierId ASC
      ) AS scopeRank
      FROM normalized
    ),
    scoped AS (
      SELECT n.*
      FROM normalized n
      INNER JOIN newest_scope s ON s.itemId = n.itemId AND s.scopeRank = 1
       AND ISNULL(n.currencyCode, N'') = ISNULL(s.currencyCode, N'')
       AND ISNULL(n.unitName, N'') = ISNULL(s.unitName, N'')
    ),
    ranked AS (
      SELECT *, YEAR(transactionDate) AS purchaseYear,
        ROW_NUMBER() OVER (
          PARTITION BY itemId, YEAR(transactionDate)
          ORDER BY unitCost ASC, transactionDate DESC, confirmDate DESC, invoiceNo DESC, sourceRowId DESC, supplierId ASC
        ) AS priceRank
      FROM scoped
    ),
    winners AS (SELECT * FROM ranked WHERE priceRank = 1),
    annual_rows AS (
      SELECT
        fi.id AS itemId, fi.code AS itemCode, fi.name AS itemName, fi.categoryName,
        s.currencyCode, s.unitName,
        y0.unitCost AS year0Cost, y1.unitCost AS year1Cost, y2.unitCost AS year2Cost,
        y0.supplierId AS year0SupplierId, y1.supplierId AS year1SupplierId, y2.supplierId AS year2SupplierId,
        y0.supplierCode AS year0SupplierCode, y1.supplierCode AS year1SupplierCode, y2.supplierCode AS year2SupplierCode,
        y0.supplierName AS year0SupplierName, y1.supplierName AS year1SupplierName, y2.supplierName AS year2SupplierName,
        y0.transactionDate AS year0Date, y1.transactionDate AS year1Date, y2.transactionDate AS year2Date,
        y0.invoiceNo AS year0Invoice, y1.invoiceNo AS year1Invoice, y2.invoiceNo AS year2Invoice,
        CASE WHEN s.currencyCode IS NOT NULL AND s.unitName IS NOT NULL AND y0.unitCost > 0 AND y1.unitCost IS NOT NULL
          THEN CONVERT(DECIMAL(19,4), ((y1.unitCost - y0.unitCost) * 100.0) / NULLIF(y0.unitCost, 0))
          ELSE NULL END AS previousChangePercent,
        CASE WHEN s.currencyCode IS NOT NULL AND s.unitName IS NOT NULL AND y1.unitCost > 0 AND y2.unitCost IS NOT NULL
          THEN CONVERT(DECIMAL(19,4), ((y2.unitCost - y1.unitCost) * 100.0) / NULLIF(y1.unitCost, 0))
          ELSE NULL END AS latestChangePercent
      FROM filtered_items fi
      LEFT JOIN newest_scope s ON s.itemId = fi.id AND s.scopeRank = 1
      LEFT JOIN winners y0 ON y0.itemId = fi.id AND y0.purchaseYear = @year0
      LEFT JOIN winners y1 ON y1.itemId = fi.id AND y1.purchaseYear = @year1
      LEFT JOIN winners y2 ON y2.itemId = fi.id AND y2.purchaseYear = @year2
    )
    SELECT * FROM annual_rows
    ORDER BY ${annualPriceOrder(query)}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  const [count, prices] = await Promise.all([countPromise, pricePromise]);
  return { total: Number(count.recordset[0]?.total ?? 0), records: prices.recordset };
}
