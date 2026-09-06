import { normalizeSqlRowVersion } from "../../shared/utils/sql-row-version.js";
import type {
  PriceQuote,
  PriceQuoteActivity,
  PriceQuoteAnalytics,
  PriceQuotePoint,
  PriceQuoteSupplierSummary,
  PriceQuoteSummary,
} from "./price-quotes.types.js";
import type {
  PriceQuoteRecord,
  QuoteActivityRecord,
  QuoteAnalyticsRecord,
  QuotePointRecord,
  QuoteSupplierSummaryRecord,
  QuoteSummaryRecord,
} from "./price-quotes.repository.js";

const dateOnly = (value: Date | null): string | null => value ? value.toISOString().slice(0, 10) : null;
const numberOrNull = (value: number | string | null): number | null => value === null ? null : Number(value);

export function mapQuote(record: PriceQuoteRecord): PriceQuote {
  const rowVersion = normalizeSqlRowVersion(record.rowVersion);
  if (!rowVersion) throw new Error("Invalid Price Quote rowversion returned by SQL Server.");
  return {
    id: Number(record.id),
    itemId: Number(record.itemId),
    itemCode: record.itemCode,
    itemName: record.itemName,
    supplierId: Number(record.supplierId),
    supplierCode: record.supplierCode,
    supplierName: record.supplierName,
    quoteDate: dateOnly(record.quoteDate) as string,
    quotedUnitCost: Number(record.quotedUnitCost),
    currencyCode: record.currencyCode,
    unitName: record.unitName,
    quoteNumber: record.quoteNumber,
    notes: record.notes,
    isActive: Boolean(record.isActive),
    latestActualUnitCost: numberOrNull(record.latestActualUnitCost),
    latestActualDate: dateOnly(record.latestActualDate),
    differenceAmount: numberOrNull(record.differenceAmount),
    differencePercent: numberOrNull(record.differencePercent),
    createdAtUtc: record.createdAtUtc.toISOString(),
    updatedAtUtc: record.updatedAtUtc.toISOString(),
    rowVersion,
  };
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

export function mapQuoteActivity(record: QuoteActivityRecord): PriceQuoteActivity {
  const before = parseJson(record.beforeValues);
  const after = parseJson(record.afterValues);
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    const from = before?.[key] ?? null;
    const to = after?.[key] ?? null;
    if (from !== to) changes[key] = { from, to };
  }
  const type = record.actionType;
  if (!["CREATED", "UPDATED", "DEACTIVATED", "REACTIVATED"].includes(type)) {
    throw new Error("Unsupported Price Quote activity type.");
  }
  return {
    id: Number(record.id),
    type: type as PriceQuoteActivity["type"],
    changes: Object.keys(changes).length ? changes : null,
    actorUserId: record.actorUserId,
    actorName: record.actorName,
    createdAtUtc: record.createdAtUtc.toISOString(),
  };
}

function point(record: QuotePointRecord): PriceQuotePoint {
  return {
    id: Number(record.id),
    quoteDate: dateOnly(record.quoteDate) as string,
    quotedUnitCost: Number(record.quotedUnitCost),
    supplierId: Number(record.supplierId),
    supplierCode: record.supplierCode,
    supplierName: record.supplierName,
    currencyCode: record.currencyCode,
    unitName: record.unitName,
    isActive: Boolean(record.isActive),
  };
}

function supplierSummary(record: QuoteSupplierSummaryRecord): PriceQuoteSupplierSummary {
  return {
    supplierId: Number(record.supplierId),
    supplierCode: record.supplierCode,
    supplierName: record.supplierName,
    currencyCode: record.currencyCode,
    unitName: record.unitName,
    latestQuote: Number(record.latestQuote),
    latestQuoteDate: dateOnly(record.latestQuoteDate) as string,
    previousQuote: numberOrNull(record.previousQuote),
    lowestQuote: Number(record.lowestQuote),
    highestQuote: Number(record.highestQuote),
    averageQuote: Number(record.averageQuote),
    quoteCount: Number(record.quoteCount),
    latestActualUnitCost: numberOrNull(record.latestActualUnitCost),
    latestActualDate: dateOnly(record.latestActualDate),
    differenceAmount: numberOrNull(record.differenceAmount),
    differencePercent: numberOrNull(record.differencePercent),
  };
}

export function mapAnalytics(
  record: QuoteAnalyticsRecord,
  points: QuotePointRecord[],
  supplierSummaries: QuoteSupplierSummaryRecord[],
): PriceQuoteAnalytics {
  const ordered = points.map(point).reverse();
  const desc = [...ordered].reverse();
  const byPriceAsc = [...ordered].sort((a, b) => a.quotedUnitCost - b.quotedUnitCost || a.id - b.id);
  return {
    quoteCount: Number(record.quoteCount ?? 0),
    activeQuoteCount: Number(record.activeQuoteCount ?? 0),
    latest: desc[0] ?? null,
    previous: desc[1] ?? null,
    lowest: byPriceAsc[0] ?? null,
    highest: byPriceAsc.at(-1) ?? null,
    averageQuote: numberOrNull(record.averageQuote),
    supplierCount: Number(record.supplierCount ?? 0),
    points: ordered,
    supplierSummaries: supplierSummaries.map(supplierSummary),
  };
}

export function mapSummary(record: QuoteSummaryRecord): PriceQuoteSummary {
  return {
    activeQuoteCount: Number(record.activeQuoteCount ?? 0),
    quotedItemCount: Number(record.quotedItemCount ?? 0),
    quotesBelowLatestActualCount: Number(record.quotesBelowLatestActualCount ?? 0),
  };
}
