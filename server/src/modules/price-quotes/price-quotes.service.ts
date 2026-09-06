import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { itemsRepository } from "../items/items.repository.js";
import { suppliersRepository } from "../suppliers/suppliers.repository.js";
import { mapAnalytics, mapQuote, mapQuoteActivity, mapSummary } from "./price-quotes.mapper.js";
import { priceQuotesRepository as repository } from "./price-quotes.repository.js";
import type {
  PriceQuote,
  PriceQuoteActivity,
  PriceQuoteAnalytics,
  PriceQuoteAnalyticsQuery,
  PriceQuoteInput,
  PriceQuoteList,
  PriceQuoteListQuery,
  PriceQuoteSummary,
  PriceQuoteSummaryInput,
} from "./price-quotes.types.js";

function notFound(): AppError {
  return new AppError({ statusCode: 404, code: "PRICE_QUOTE_NOT_FOUND", message: "Price Quote was not found." });
}
function stale(): AppError {
  return new AppError({ statusCode: 409, code: "PRICE_QUOTE_STALE", message: "Price Quote changed after it was loaded. Reload and try again." });
}
function normalize(input: PriceQuoteInput): PriceQuoteInput {
  return {
    ...input,
    currencyCode: input.currencyCode.trim(),
    unitName: input.unitName.trim(),
    quoteNumber: input.quoteNumber?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}
function snapshot(input: PriceQuote | PriceQuoteInput, active?: boolean): Record<string, unknown> {
  return {
    itemId: input.itemId,
    supplierId: input.supplierId,
    quoteDate: input.quoteDate,
    quotedUnitCost: input.quotedUnitCost,
    currencyCode: input.currencyCode,
    unitName: input.unitName,
    quoteNumber: input.quoteNumber,
    notes: input.notes,
    ...(active === undefined ? {} : { isActive: active }),
  };
}
async function assertReferences(input: PriceQuoteInput): Promise<void> {
  const [item, supplier] = await Promise.all([
    itemsRepository.findItem(input.itemId),
    suppliersRepository.findSupplierIdentity(input.supplierId),
  ]);
  if (!item) throw new AppError({ statusCode: 400, code: "PRICE_QUOTE_ITEM_NOT_FOUND", message: "Selected Item does not exist." });
  if (!supplier) throw new AppError({ statusCode: 400, code: "PRICE_QUOTE_SUPPLIER_NOT_FOUND", message: "Selected Supplier does not exist." });
}

export const priceQuotesService = {
  async list(ownerUserId: number, query: PriceQuoteListQuery): Promise<PriceQuoteList> {
    const result = await repository.listQuotes(ownerUserId, query);
    return { items: result.records.map(mapQuote), page: query.page, pageSize: query.pageSize, total: result.total };
  },

  async get(ownerUserId: number, quoteId: number): Promise<PriceQuote> {
    const row = await repository.findQuote(ownerUserId, quoteId);
    if (!row) throw notFound();
    return mapQuote(row);
  },

  async create(ownerUserId: number, input: PriceQuoteInput): Promise<PriceQuote> {
    const normalized = normalize(input);
    await assertReferences(normalized);
    const quoteId = await withTransaction(async (transaction) => {
      const id = await repository.createQuote(transaction, ownerUserId, normalized);
      await repository.addActivity(transaction, {
        quoteId: id,
        ownerUserId,
        actorUserId: ownerUserId,
        actionType: "CREATED",
        beforeValues: null,
        afterValues: snapshot(normalized, true),
      });
      return id;
    });
    return this.get(ownerUserId, quoteId);
  },

  async update(ownerUserId: number, quoteId: number, input: PriceQuoteInput, rowVersion: string): Promise<PriceQuote> {
    const normalized = normalize(input);
    await assertReferences(normalized);
    const current = await this.get(ownerUserId, quoteId);
    await withTransaction(async (transaction) => {
      if (!(await repository.updateQuote(transaction, ownerUserId, quoteId, normalized, rowVersion))) throw stale();
      await repository.addActivity(transaction, {
        quoteId,
        ownerUserId,
        actorUserId: ownerUserId,
        actionType: "UPDATED",
        beforeValues: snapshot(current, current.isActive),
        afterValues: snapshot(normalized, current.isActive),
      });
    });
    return this.get(ownerUserId, quoteId);
  },

  async setActive(ownerUserId: number, quoteId: number, active: boolean, rowVersion: string): Promise<PriceQuote> {
    const current = await this.get(ownerUserId, quoteId);
    if (current.isActive === active) return current;
    await withTransaction(async (transaction) => {
      if (!(await repository.setQuoteActive(transaction, ownerUserId, quoteId, active, rowVersion))) throw stale();
      await repository.addActivity(transaction, {
        quoteId,
        ownerUserId,
        actorUserId: ownerUserId,
        actionType: active ? "REACTIVATED" : "DEACTIVATED",
        beforeValues: snapshot(current, current.isActive),
        afterValues: snapshot(current, active),
      });
    });
    return this.get(ownerUserId, quoteId);
  },

  async activity(ownerUserId: number, quoteId: number): Promise<PriceQuoteActivity[]> {
    if (!(await repository.findQuote(ownerUserId, quoteId))) throw notFound();
    return (await repository.listActivity(ownerUserId, quoteId)).map(mapQuoteActivity);
  },

  async analytics(ownerUserId: number, query: PriceQuoteAnalyticsQuery): Promise<PriceQuoteAnalytics> {
    const result = await repository.getAnalytics(ownerUserId, query);
    return mapAnalytics(result.analytics, result.points, result.supplierSummaries);
  },

  async summary(ownerUserId: number, input: PriceQuoteSummaryInput): Promise<PriceQuoteSummary> {
    return mapSummary(await repository.getSummary(ownerUserId, input));
  },
};
