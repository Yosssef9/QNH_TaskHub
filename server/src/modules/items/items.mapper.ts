import { AppError } from "../../shared/errors/app-error.js";
import type {
  Item,
  ItemActivity,
  ItemListItem,
  ItemListPriceSummary,
  ItemOption,
  ItemSupplierMatrixCell,
  ItemSource,
  ItemsOverview,
  ProcurementActivityType,
} from "./items.types.js";
import type {
  ItemActivityRecord,
  ItemListRecord,
  ItemOptionRecord,
  ItemPriceSummaryRecord,
  ItemSupplierMatrixRecord,
  ItemRecord,
  ItemsOverviewRecord,
} from "./items.repository.js";

function source(value: string): ItemSource {
  if (value === "ORACLE" || value === "MANUAL") return value;
  throw new AppError({ statusCode: 500, code: "INVALID_ITEM_SOURCE", message: "Item source is not supported." });
}

function activityType(value: string): ProcurementActivityType {
  if (value === "CREATED" || value === "UPDATED" || value === "DEACTIVATED" || value === "REACTIVATED") return value;
  throw new AppError({ statusCode: 500, code: "INVALID_PROCUREMENT_ACTIVITY", message: "Procurement activity has an unsupported type." });
}

function booleanValue(value: ItemRecord["isStockItem"]): boolean {
  return value === true || value === 1 || value === "1";
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapItem(record: ItemRecord): Item {
  return {
    id: Number(record.id),
    code: record.code,
    name: record.name,
    parentName: record.parentName,
    categoryName: record.categoryName,
    unit: record.unit,
    pieceUnit: record.pieceUnit,
    factor: numberOrNull(record.factor),
    isStockItem: booleanValue(record.isStockItem),
    statusCode: numberOrNull(record.statusCode),
    isAsset: booleanValue(record.isAsset),
    source: source(record.source),
  };
}

export function mapItemOption(record: ItemOptionRecord): ItemOption {
  return {
    id: Number(record.id),
    code: record.code,
    name: record.name,
    unit: record.unit,
  };
}

export function mapItemSupplierMatrixCell(record: ItemSupplierMatrixRecord): ItemSupplierMatrixCell {
  return {
    itemId: Number(record.itemId),
    supplierId: Number(record.supplierId),
    supplierCode: record.supplierCode,
    supplierName: record.supplierName ?? "—",
    currencyCode: record.currencyCode,
    unitName: record.unitName,
    latestUnitCost: numberOrNull(record.latestUnitCost),
    latestTransactionDate: record.latestTransactionDate?.toISOString().slice(0, 10) ?? null,
    previousUnitCost: numberOrNull(record.previousUnitCost),
    previousTransactionDate: record.previousTransactionDate?.toISOString().slice(0, 10) ?? null,
    lowestUnitCost: numberOrNull(record.lowestUnitCost),
    lowestTransactionDate: record.lowestTransactionDate?.toISOString().slice(0, 10) ?? null,
    highestUnitCost: numberOrNull(record.highestUnitCost),
    highestTransactionDate: record.highestTransactionDate?.toISOString().slice(0, 10) ?? null,
    averageUnitCost: numberOrNull(record.averageUnitCost),
    transactionCount: Number(record.transactionCount ?? 0),
    lastPurchaseDate: record.lastPurchaseDate?.toISOString().slice(0, 10) ?? null,
    changeAmount: numberOrNull(record.changeAmount),
    changePercent: numberOrNull(record.changePercent),
    latestQuoteUnitCost: numberOrNull(record.latestQuoteUnitCost),
    latestQuoteDate: record.latestQuoteDate?.toISOString().slice(0, 10) ?? null,
    previousQuoteUnitCost: numberOrNull(record.previousQuoteUnitCost),
    previousQuoteDate: record.previousQuoteDate?.toISOString().slice(0, 10) ?? null,
    lowestQuoteUnitCost: numberOrNull(record.lowestQuoteUnitCost),
    lowestQuoteDate: record.lowestQuoteDate?.toISOString().slice(0, 10) ?? null,
    highestQuoteUnitCost: numberOrNull(record.highestQuoteUnitCost),
    highestQuoteDate: record.highestQuoteDate?.toISOString().slice(0, 10) ?? null,
    averageQuoteUnitCost: numberOrNull(record.averageQuoteUnitCost),
    quoteCount: Number(record.quoteCount ?? 0),
    lastQuoteDate: record.lastQuoteDate?.toISOString().slice(0, 10) ?? null,
    quoteChangeAmount: numberOrNull(record.quoteChangeAmount),
    quoteChangePercent: numberOrNull(record.quoteChangePercent),
    quoteCurrencyCode: record.quoteCurrencyCode,
    quoteUnitName: record.quoteUnitName,
  };
}

export function mapItemPriceSummary(record: ItemPriceSummaryRecord): ItemListPriceSummary | null {
  const latestUnitCost = numberOrNull(record.latestUnitCost);
  const lowestUnitCost = numberOrNull(record.lowestUnitCost);
  const highestUnitCost = numberOrNull(record.highestUnitCost);
  const averageUnitCost = numberOrNull(record.averageUnitCost);
  const latestSupplierId = numberOrNull(record.latestSupplierId);
  const transactionCount = Number(record.transactionCount ?? 0);
  const supplierCount = Number(record.supplierCount ?? 0);

  if (
    latestUnitCost === null
    || lowestUnitCost === null
    || highestUnitCost === null
    || averageUnitCost === null
    || latestSupplierId === null
    || !record.latestSupplierName
    || !record.lastPurchaseDate
    || transactionCount <= 0
  ) {
    return null;
  }

  return {
    currencyCode: record.priceCurrencyCode,
    unitName: record.priceUnitName,
    latestUnitCost,
    previousUnitCost: numberOrNull(record.previousUnitCost),
    lowestUnitCost,
    highestUnitCost,
    averageUnitCost,
    changeAmount: numberOrNull(record.changeAmount),
    changePercent: numberOrNull(record.changePercent),
    supplierCount,
    transactionCount,
    lastPurchaseDate: record.lastPurchaseDate.toISOString().slice(0, 10),
    latestSupplierId,
    latestSupplierCode: record.latestSupplierCode,
    latestSupplierName: record.latestSupplierName,
  };
}

export function mapItemListRecord(record: ItemListRecord): ItemListItem {
  return {
    ...mapItem(record),
    price: mapItemPriceSummary(record),
  };
}

export function mapItemsOverview(record: ItemsOverviewRecord): ItemsOverview {
  return {
    totalItems: Number(record.totalItems ?? 0),
    purchasedItems: Number(record.purchasedItems ?? 0),
    supplierCount: Number(record.supplierCount ?? 0),
    transactionCount: Number(record.transactionCount ?? 0),
    priceIncreases: Number(record.priceIncreases ?? 0),
    priceDecreases: Number(record.priceDecreases ?? 0),
    latestAtHistoricalHigh: Number(record.latestAtHistoricalHigh ?? 0),
  };
}

export function mapItemActivity(record: ItemActivityRecord): ItemActivity {
  const parse = (value: string | null): Record<string, unknown> | null => {
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  };

  const before = parse(record.beforeValues);
  const after = parse(record.afterValues);
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    const from = before?.[key] ?? null;
    const to = after?.[key] ?? null;
    if (from !== to) changes[key] = { from, to };
  }

  return {
    id: Number(record.id),
    type: activityType(record.actionType),
    changes: Object.keys(changes).length ? changes : null,
    actorUserId: record.actorUserId,
    actorName: record.actorName,
    createdAtUtc: record.createdAtUtc.toISOString(),
  };
}

