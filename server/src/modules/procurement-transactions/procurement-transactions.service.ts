import type {
  ItemAnalyticsRecord,
  ItemSupplierSummaryRecord,
  ProcurementTransactionRecord,
  SupplierItemPriceSummaryRecord,
  SupplierPriceAnalyticsRecord,
} from "./procurement-transactions.repository.js";
import { procurementTransactionsRepository } from "./procurement-transactions.repository.js";
import type {
  ItemPriceAnalytics,
  ItemPriceHistory,
  ItemPriceHistoryQuery,
  ItemSupplierListQuery,
  ItemSupplierPriceList,
  ItemSupplierPriceSummary,
  ItemTransactionList,
  ItemTransactionListQuery,
  ProcurementPriceFilter,
  ProcurementPricePoint,
  ProcurementTransaction,
  SupplierItemPriceList,
  SupplierItemPriceListQuery,
  SupplierItemPriceSummary,
  SupplierPriceAnalytics,
  SupplierPriceFilter,
} from "./procurement-transactions.types.js";

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumber(value: number | string): number {
  return Number(value);
}

function mapTransaction(record: ProcurementTransactionRecord): ProcurementTransaction {
  return {
    transactionDate: dateOnly(record.transactionDate) as string,
    confirmDate: record.confirmDate?.toISOString() ?? null,
    invoiceNo: record.invoiceNo,
    vendorInvoiceNo: record.vendorInvoiceNo,
    vendorInvoiceDate: dateOnly(record.vendorInvoiceDate),
    orderId: record.orderId,
    billNo: record.billNo,
    billDate: dateOnly(record.billDate),
    supplierId: requiredNumber(record.supplierId),
    supplierCode: record.supplierCode,
    supplierName: record.supplierName,
    itemId: requiredNumber(record.itemId),
    itemCode: record.itemCode,
    itemDescription: record.itemDescription,
    unitName: record.unitName,
    quantity: numberOrNull(record.quantity),
    bonusQuantity: numberOrNull(record.bonusQuantity),
    unitCost: requiredNumber(record.unitCost),
    currencyCode: record.currencyCode,
    lotNo: record.lotNo,
    expiryDate: dateOnly(record.expiryDate),
    statusCode: record.statusCode,
    statusName: record.statusName,
    invoiceStatus: record.invoiceStatus,
  };
}

function transactionPoint(record: ProcurementTransactionRecord): ProcurementPricePoint {
  return {
    transactionDate: dateOnly(record.transactionDate) as string,
    unitCost: requiredNumber(record.unitCost),
    supplierId: requiredNumber(record.supplierId),
    supplierCode: record.supplierCode,
    supplierName: record.supplierName,
    invoiceNo: record.invoiceNo,
    orderId: record.orderId,
    currencyCode: record.currencyCode,
    unitName: record.unitName,
  };
}

function point(
  record: ItemAnalyticsRecord,
  prefix: "latest" | "previous" | "lowest" | "highest",
): ProcurementPricePoint | null {
  const values = prefix === "latest"
    ? {
        transactionDate: record.latestTransactionDate,
        unitCost: record.latestUnitCost,
        supplierId: record.latestSupplierId,
        supplierCode: record.latestSupplierCode,
        supplierName: record.latestSupplierName,
        invoiceNo: record.latestInvoiceNo,
        orderId: record.latestOrderId,
      }
    : prefix === "previous"
      ? {
          transactionDate: record.previousTransactionDate,
          unitCost: record.previousUnitCost,
          supplierId: record.previousSupplierId,
          supplierCode: record.previousSupplierCode,
          supplierName: record.previousSupplierName,
          invoiceNo: record.previousInvoiceNo,
          orderId: record.previousOrderId,
        }
      : prefix === "lowest"
        ? {
            transactionDate: record.lowestTransactionDate,
            unitCost: record.lowestUnitCost,
            supplierId: record.lowestSupplierId,
            supplierCode: record.lowestSupplierCode,
            supplierName: record.lowestSupplierName,
            invoiceNo: record.lowestInvoiceNo,
            orderId: record.lowestOrderId,
          }
        : {
            transactionDate: record.highestTransactionDate,
            unitCost: record.highestUnitCost,
            supplierId: record.highestSupplierId,
            supplierCode: record.highestSupplierCode,
            supplierName: record.highestSupplierName,
            invoiceNo: record.highestInvoiceNo,
            orderId: record.highestOrderId,
          };

  if (!values.transactionDate || values.unitCost === null || values.supplierId === null || !values.supplierName) return null;
  return {
    transactionDate: dateOnly(values.transactionDate) as string,
    unitCost: requiredNumber(values.unitCost),
    supplierId: requiredNumber(values.supplierId),
    supplierCode: values.supplierCode,
    supplierName: values.supplierName,
    invoiceNo: values.invoiceNo,
    orderId: values.orderId,
    currencyCode: record.currencyCode,
    unitName: record.unitName,
  };
}

function mapAnalytics(itemId: number, record: ItemAnalyticsRecord): ItemPriceAnalytics {
  const latest = point(record, "latest");
  const previous = point(record, "previous");
  const changeAmount = numberOrNull(record.changeAmount);
  const changePercent = numberOrNull(record.changePercent);
  return {
    itemId,
    scope: latest ? { currencyCode: record.currencyCode, unitName: record.unitName } : null,
    scopeCount: Number(record.scopeCount ?? 0),
    latest,
    previous,
    lowest: point(record, "lowest"),
    highest: point(record, "highest"),
    averageUnitCost: numberOrNull(record.averageUnitCost),
    transactionCount: Number(record.transactionCount ?? 0),
    supplierCount: Number(record.supplierCount ?? 0),
    lastPurchaseDate: dateOnly(record.lastPurchaseDate),
    changeAmount,
    changePercent,
  };
}

function mapSupplierSummary(record: ItemSupplierSummaryRecord): ItemSupplierPriceSummary {
  const latestUnitCost = requiredNumber(record.latestUnitCost);
  const previousUnitCost = numberOrNull(record.previousUnitCost);
  const changeAmount = numberOrNull(record.changeAmount);
  const changePercent = numberOrNull(record.changePercent);
  const currentLowest = requiredNumber(record.currentLowestUnitCost);
  const currentHighest = requiredNumber(record.currentHighestUnitCost);
  return {
    supplierId: requiredNumber(record.supplierId),
    supplierCode: record.supplierCode,
    supplierName: record.supplierName,
    currencyCode: record.currencyCode,
    unitName: record.unitName,
    latestUnitCost,
    latestTransactionDate: dateOnly(record.latestTransactionDate) as string,
    previousUnitCost,
    previousTransactionDate: dateOnly(record.previousTransactionDate),
    lowestUnitCost: requiredNumber(record.lowestUnitCost),
    highestUnitCost: requiredNumber(record.highestUnitCost),
    averageUnitCost: requiredNumber(record.averageUnitCost),
    transactionCount: Number(record.transactionCount),
    lastPurchaseDate: dateOnly(record.lastPurchaseDate) as string,
    changeAmount,
    changePercent,
    isCurrentLowest: latestUnitCost === currentLowest,
    isCurrentHighest: latestUnitCost === currentHighest,
  };
}


function mapSupplierItemSummary(record: SupplierItemPriceSummaryRecord): SupplierItemPriceSummary {
  const latestUnitCost = requiredNumber(record.latestUnitCost);
  const currentLowestUnitCost = requiredNumber(record.currentLowestUnitCost);
  const currentHighestUnitCost = requiredNumber(record.currentHighestUnitCost);
  const marketSupplierCount = Number(record.marketSupplierCount);
  return {
    itemId: requiredNumber(record.itemId),
    itemCode: record.itemCode,
    itemName: record.itemName,
    categoryName: record.categoryName,
    currencyCode: record.currencyCode,
    unitName: record.unitName,
    latestUnitCost,
    latestTransactionDate: dateOnly(record.latestTransactionDate) as string,
    previousUnitCost: numberOrNull(record.previousUnitCost),
    previousTransactionDate: dateOnly(record.previousTransactionDate),
    lowestUnitCost: requiredNumber(record.lowestUnitCost),
    highestUnitCost: requiredNumber(record.highestUnitCost),
    averageUnitCost: requiredNumber(record.averageUnitCost),
    transactionCount: Number(record.transactionCount),
    lastPurchaseDate: dateOnly(record.lastPurchaseDate) as string,
    marketSupplierCount,
    currentLowestUnitCost,
    currentHighestUnitCost,
    differenceFromLowestAmount: requiredNumber(record.differenceFromLowestAmount),
    differenceFromLowestPercent: numberOrNull(record.differenceFromLowestPercent),
    isCurrentLowest: marketSupplierCount > 1 && latestUnitCost === currentLowestUnitCost,
    isCurrentHighest: marketSupplierCount > 1 && latestUnitCost === currentHighestUnitCost,
  };
}

function mapSupplierAnalytics(
  supplierId: number,
  period: SupplierPriceFilter["period"],
  record: SupplierPriceAnalyticsRecord,
): SupplierPriceAnalytics {
  return {
    supplierId,
    period,
    itemCount: Number(record.itemCount ?? 0),
    transactionCount: Number(record.transactionCount ?? 0),
    lastPurchaseDate: dateOnly(record.lastPurchaseDate),
    comparableItemCount: Number(record.comparableItemCount ?? 0),
    currentLowestItemCount: Number(record.currentLowestItemCount ?? 0),
    currentHighestItemCount: Number(record.currentHighestItemCount ?? 0),
    singleSupplierItemCount: Number(record.singleSupplierItemCount ?? 0),
    averageDifferenceFromLowestPercent: numberOrNull(record.averageDifferenceFromLowestPercent),
  };
}

export const procurementTransactionsService = {
  async listItemTransactions(itemId: number, query: ItemTransactionListQuery): Promise<ItemTransactionList> {
    const result = await procurementTransactionsRepository.listItemTransactions(itemId, query);
    return {
      transactions: result.records.map(mapTransaction),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  },

  async listItemPriceHistory(itemId: number, query: ItemPriceHistoryQuery): Promise<ItemPriceHistory> {
    const result = await procurementTransactionsRepository.listItemPriceHistory(itemId, query);
    return {
      points: result.records.map(transactionPoint).reverse(),
      scope: result.scope,
      total: result.total,
      truncated: result.total > result.records.length,
    };
  },

  async getItemAnalytics(itemId: number, filter: ProcurementPriceFilter): Promise<ItemPriceAnalytics> {
    return mapAnalytics(itemId, await procurementTransactionsRepository.getItemAnalytics(itemId, filter));
  },

  async listItemSupplierSummaries(itemId: number, query: ItemSupplierListQuery): Promise<ItemSupplierPriceList> {
    const result = await procurementTransactionsRepository.listItemSupplierSummaries(itemId, query);
    return {
      suppliers: result.records.map(mapSupplierSummary),
      scope: result.scope,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  },

  async listSupplierItemPriceSummaries(
    supplierId: number,
    query: SupplierItemPriceListQuery,
  ): Promise<SupplierItemPriceList> {
    const result = await procurementTransactionsRepository.listSupplierItemPriceSummaries(supplierId, query);
    return {
      items: result.records.map(mapSupplierItemSummary),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  },

  async getSupplierPriceAnalytics(
    supplierId: number,
    filter: SupplierPriceFilter,
  ): Promise<SupplierPriceAnalytics> {
    return mapSupplierAnalytics(
      supplierId,
      filter.period,
      await procurementTransactionsRepository.getSupplierPriceAnalytics(supplierId, filter),
    );
  },
};
