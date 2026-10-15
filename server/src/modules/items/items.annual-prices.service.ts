import { logger } from "../../config/logger.js";
import { queryAnnualPrices, type AnnualPriceRecord } from "./items.annual-prices.repository.js";
import type { AnnualLowestPurchase, AnnualPriceItem, AnnualPriceList, AnnualPriceQuery } from "./items.types.js";

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function dateOrNull(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function mapAnnualRecord(row: AnnualPriceRecord, endingYear: number): AnnualPriceItem {
  function yearPrice(index: 0 | 1 | 2): AnnualLowestPurchase {
    const cost = numberOrNull(row[`year${index}Cost`]);
    return {
      year: endingYear - 2 + index,
      unitCost: cost,
      supplierId: cost === null ? null : numberOrNull(row[`year${index}SupplierId`]),
      supplierCode: cost === null ? null : row[`year${index}SupplierCode`],
      supplierName: cost === null ? null : row[`year${index}SupplierName`],
      transactionDate: cost === null ? null : dateOrNull(row[`year${index}Date`]),
      invoiceNo: cost === null ? null : row[`year${index}Invoice`],
    };
  }
  return {
    itemId: Number(row.itemId),
    itemCode: row.itemCode,
    itemName: row.itemName,
    categoryName: row.categoryName,
    currencyCode: row.currencyCode,
    unitName: row.unitName,
    prices: [yearPrice(0), yearPrice(1), yearPrice(2)],
    previousChangePercent: numberOrNull(row.previousChangePercent),
    latestChangePercent: numberOrNull(row.latestChangePercent),
  };
}

export async function listAnnualPrices(query: AnnualPriceQuery): Promise<AnnualPriceList> {
  const started = Date.now();
  const result = await queryAnnualPrices(query);
  const elapsed = Date.now() - started;
  if (elapsed >= 2_000) {
    logger.warn({ operation: "items.annual-prices", durationMs: elapsed, page: query.page, year: query.endingYear, total: result.total }, "Slow Procurement annual price comparison");
  }
  return {
    items: result.records.map(row => mapAnnualRecord(row, query.endingYear)),
    endingYear: query.endingYear,
    page: query.page,
    pageSize: query.pageSize,
    total: result.total,
  };
}
