import { logger } from "../../config/logger.js";
import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  mapItem,
  mapItemActivity,
  mapItemListRecord,
  mapItemOption,
  mapItemPriceSummary,
  mapItemSupplierMatrixCell,
  mapItemsOverview,
} from "./items.mapper.js";
import { procurementTransactionsService } from "../procurement-transactions/procurement-transactions.service.js";
import type {
  ItemPriceHistoryQuery,
  ItemSupplierListQuery,
  ItemTransactionListQuery,
  ProcurementPriceFilter,
} from "../procurement-transactions/procurement-transactions.types.js";
import { itemsRepository } from "./items.repository.js";
import type {
  Item,
  ItemActivity,
  ItemInput,
  ItemList,
  ItemListQuery,
  ItemOptionList,
  ItemOptionQuery,
  ItemOverviewQuery,
  ItemPriceSummaryBatch,
  ItemPriceSummaryQuery,
  ItemSupplierMatrixBatch,
  ItemSupplierMatrixQuery,
  ItemsOverview,
} from "./items.types.js";

const SLOW_PROCUREMENT_QUERY_MS = 2_000;
const analyticsSorts = new Set(["latest", "lowest", "highest", "change", "suppliers", "lastPurchase"]);

type ReadOperation = "items.list" | "items.options" | "items.price-summaries" | "items.supplier-matrix" | "items.overview";

function logReadDuration(
  operation: ReadOperation,
  startedAt: number,
  context: Record<string, unknown>,
): void {
  const durationMs = Date.now() - startedAt;
  const payload = { operation, durationMs, ...context };
  if (durationMs >= SLOW_PROCUREMENT_QUERY_MS) {
    logger.warn(payload, "Slow Procurement read");
    return;
  }
  logger.debug(payload, "Procurement read completed");
}

function notFound(): AppError {
  return new AppError({ statusCode: 404, code: "ITEM_NOT_FOUND", message: "Item was not found." });
}

function normalize(input: ItemInput): ItemInput {
  const clean = (value: string | null): string | null => value?.trim() || null;
  return {
    name: input.name.trim(),
    parentName: clean(input.parentName),
    categoryName: clean(input.categoryName),
    unit: clean(input.unit),
    pieceUnit: clean(input.pieceUnit),
    factor: input.factor,
    isStockItem: input.isStockItem,
    statusCode: input.statusCode,
    isAsset: input.isAsset,
  };
}

function snapshot(item: Item): Record<string, unknown> {
  return {
    code: item.code,
    name: item.name,
    parentName: item.parentName,
    categoryName: item.categoryName,
    unit: item.unit,
    pieceUnit: item.pieceUnit,
    factor: item.factor,
    isStockItem: item.isStockItem,
    statusCode: item.statusCode,
    isAsset: item.isAsset,
    source: item.source,
  };
}

function inputSnapshot(input: ItemInput): Record<string, unknown> {
  return { ...input };
}

function changed(current: Item, input: ItemInput): boolean {
  const currentEditable = snapshot(current);
  return Object.entries(inputSnapshot(input)).some(([key, value]) => currentEditable[key] !== value);
}

export const itemsService = {
  async listItems(query: ItemListQuery): Promise<ItemList> {
    const startedAt = Date.now();
    const page = await itemsRepository.listItems(query);
    logReadDuration("items.list", startedAt, {
      mode: analyticsSorts.has(query.sortBy) ? "ANALYTICS_SORT" : "MASTER",
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      period: query.period,
      supplierCount: query.supplierIds?.length ?? 0,
      itemFilterCount: query.itemIds?.length ?? 0,
      hasSearch: Boolean(query.search?.trim()),
      returned: page.records.length,
      total: page.total,
    });
    return {
      items: page.records.map(mapItemListRecord),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
    };
  },

  async listOptions(query: ItemOptionQuery): Promise<ItemOptionList> {
    const startedAt = Date.now();
    const page = await itemsRepository.listItemOptions(query);
    logReadDuration("items.options", startedAt, {
      page: query.page,
      pageSize: query.pageSize,
      hasSearch: Boolean(query.search?.trim()),
      source: query.source ?? "ALL",
      returned: page.records.length,
      total: page.total,
    });
    return {
      items: page.records.map(mapItemOption),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
    };
  },

  async getPriceSummaries(query: ItemPriceSummaryQuery): Promise<ItemPriceSummaryBatch> {
    const startedAt = Date.now();
    const records = await itemsRepository.listItemPriceSummaries(query);
    const byId = new Map(records.map((record) => [Number(record.itemId), mapItemPriceSummary(record)]));
    const result: ItemPriceSummaryBatch = {
      items: query.itemIds.map((itemId) => ({ itemId, price: byId.get(itemId) ?? null })),
    };
    logReadDuration("items.price-summaries", startedAt, {
      itemCount: query.itemIds.length,
      supplierCount: query.supplierIds?.length ?? 0,
      period: query.period,
      pricedItems: result.items.filter((entry) => entry.price !== null).length,
    });
    return result;
  },

  async getSupplierMatrix(ownerUserId: number, query: ItemSupplierMatrixQuery): Promise<ItemSupplierMatrixBatch> {
    const startedAt = Date.now();
    const records = await itemsRepository.listSupplierMatrix(ownerUserId, query);
    const grouped = new Map<number, ReturnType<typeof mapItemSupplierMatrixCell>[]>();
    for (const record of records) {
      const cell = mapItemSupplierMatrixCell(record);
      const current = grouped.get(cell.itemId);
      if (current) current.push(cell);
      else grouped.set(cell.itemId, [cell]);
    }
    const result: ItemSupplierMatrixBatch = {
      items: query.itemIds.map((itemId) => ({
        itemId,
        suppliers: grouped.get(itemId) ?? [],
      })),
    };
    logReadDuration("items.supplier-matrix", startedAt, {
      itemCount: query.itemIds.length,
      supplierCount: query.supplierIds.length,
      period: query.period,
      populatedCells: records.length,
    });
    return result;
  },

  async getOverview(query: ItemOverviewQuery): Promise<ItemsOverview> {
    const startedAt = Date.now();
    const overview = mapItemsOverview(await itemsRepository.getItemsOverview(query));
    logReadDuration("items.overview", startedAt, {
      period: query.period,
      supplierCount: query.supplierIds?.length ?? 0,
      itemFilterCount: query.itemIds?.length ?? 0,
      hasSearch: Boolean(query.search?.trim()),
    });
    return overview;
  },

  async getItem(itemId: number): Promise<Item> {
    const row = await itemsRepository.findItem(itemId);
    if (!row) throw notFound();
    return mapItem(row);
  },

  async createItem(actorUserId: number, rawInput: ItemInput): Promise<Item> {
    const input = normalize(rawInput);
    const itemId = await withTransaction(async (transaction) => {
      const id = await itemsRepository.createManualItem(transaction, input);
      const row = await itemsRepository.findItem(id, transaction);
      if (!row) {
        throw new AppError({ statusCode: 500, code: "ITEM_CREATE_FAILED", message: "The created Item could not be loaded." });
      }
      await itemsRepository.addActivity(transaction, {
        itemId: id,
        actorUserId,
        actionType: "CREATED",
        beforeValues: null,
        afterValues: snapshot(mapItem(row)),
      });
      return id;
    });
    return this.getItem(itemId);
  },

  async updateItem(actorUserId: number, itemId: number, rawInput: ItemInput): Promise<Item> {
    const input = normalize(rawInput);
    await withTransaction(async (transaction) => {
      const row = await itemsRepository.findItem(itemId, transaction);
      if (!row) throw notFound();
      const current = mapItem(row);
      if (!changed(current, input)) return;
      if (!(await itemsRepository.updateItem(transaction, itemId, input))) throw notFound();
      const nextRow = await itemsRepository.findItem(itemId, transaction);
      if (!nextRow) throw notFound();
      await itemsRepository.addActivity(transaction, {
        itemId,
        actorUserId,
        actionType: "UPDATED",
        beforeValues: snapshot(current),
        afterValues: snapshot(mapItem(nextRow)),
      });
    });
    return this.getItem(itemId);
  },

  async listActivity(itemId: number): Promise<ItemActivity[]> {
    await this.getItem(itemId);
    return (await itemsRepository.listActivity(itemId)).map(mapItemActivity);
  },

  async listTransactions(itemId: number, query: ItemTransactionListQuery) {
    await this.getItem(itemId);
    return procurementTransactionsService.listItemTransactions(itemId, query);
  },

  async listPriceHistory(itemId: number, query: ItemPriceHistoryQuery) {
    await this.getItem(itemId);
    return procurementTransactionsService.listItemPriceHistory(itemId, query);
  },

  async getAnalytics(itemId: number, query: ProcurementPriceFilter) {
    await this.getItem(itemId);
    return procurementTransactionsService.getItemAnalytics(itemId, query);
  },

  async listSupplierComparison(itemId: number, query: ItemSupplierListQuery) {
    await this.getItem(itemId);
    return procurementTransactionsService.listItemSupplierSummaries(itemId, query);
  },
};

