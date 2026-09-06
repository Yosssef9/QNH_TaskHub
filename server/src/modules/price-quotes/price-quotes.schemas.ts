import { z } from "zod";

const nonZeroId = z.coerce.number().int().refine((value) => value !== 0, "ID cannot be zero.");
const period = z.enum(["1M", "3M", "6M", "1Y", "ALL"]);

export const priceQuoteIdParamsSchema = z.object({
  quoteId: z.coerce.number().int().positive(),
});

export const priceQuoteInputSchema = z.object({
  itemId: nonZeroId,
  supplierId: nonZeroId,
  quoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quotedUnitCost: z.coerce.number().positive().max(9999999999999),
  unitName: z.string().trim().min(1).max(100),
  quoteNumber: z.string().trim().max(120).nullable().default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
});

export const createPriceQuoteBodySchema = priceQuoteInputSchema;
export const updatePriceQuoteBodySchema = priceQuoteInputSchema.extend({
  rowVersion: z.string().trim().min(1).max(64),
});
export const lifecyclePriceQuoteBodySchema = z.object({
  rowVersion: z.string().trim().min(1).max(64),
});


export const priceQuoteContextQuerySchema = z.object({
  itemId: nonZeroId,
  supplierId: nonZeroId.optional(),
});

export const priceQuoteListQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  itemId: nonZeroId.optional(),
  supplierId: nonZeroId.optional(),
  supplierIds: z.preprocess(ids, z.array(nonZeroId).max(100).optional()),
  period: period.default("1Y"),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  sortBy: z.enum(["quoteDate", "item", "supplier", "quotedUnitCost", "difference", "status"]).default("quoteDate"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

function ids(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",").filter(Boolean);
  return value;
}

export const priceQuoteAnalyticsQuerySchema = z.object({
  itemId: nonZeroId.optional(),
  supplierId: nonZeroId.optional(),
  supplierIds: z.preprocess(ids, z.array(nonZeroId).max(100).optional()),
  period: period.default("1Y"),
}).refine((value) => value.itemId !== undefined || value.supplierId !== undefined, "Item or Supplier scope is required.");

export const priceQuoteSummaryBodySchema = z.object({
  itemIds: z.array(nonZeroId).max(1000).default([]),
  supplierIds: z.array(nonZeroId).max(500).default([]),
  period: period.default("1Y"),
});

export type PriceQuoteIdParams = z.infer<typeof priceQuoteIdParamsSchema>;
export type CreatePriceQuoteBody = z.infer<typeof createPriceQuoteBodySchema>;
export type UpdatePriceQuoteBody = z.infer<typeof updatePriceQuoteBodySchema>;
export type LifecyclePriceQuoteBody = z.infer<typeof lifecyclePriceQuoteBodySchema>;
export type PriceQuoteContextQueryInput = z.infer<typeof priceQuoteContextQuerySchema>;
export type PriceQuoteListQueryInput = z.infer<typeof priceQuoteListQuerySchema>;
export type PriceQuoteAnalyticsQueryInput = z.infer<typeof priceQuoteAnalyticsQuerySchema>;
export type PriceQuoteSummaryBody = z.infer<typeof priceQuoteSummaryBodySchema>;
