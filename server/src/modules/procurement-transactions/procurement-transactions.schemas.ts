import { z } from "zod";

function parseIds(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!value.trim()) return [];
  return value.split(",").map((part) => Number(part.trim()));
}

const nonZeroId = z.coerce.number().int().refine((value) => value !== 0, "ID cannot be zero.");
const supplierIds = z.preprocess(
  parseIds,
  z.array(nonZeroId).max(500).refine((values) => new Set(values).size === values.length, "Supplier IDs must be unique.").optional(),
);

const priceFilters = {
  period: z.enum(["1M", "3M", "6M", "1Y", "ALL"]).default("ALL"),
  supplierIds,
  currencyCode: z.string().trim().min(1).max(30).optional(),
  unitName: z.string().trim().min(1).max(100).optional(),
} as const;

export const itemAnalyticsQuerySchema = z.object(priceFilters);

export const itemTransactionsQuerySchema = z.object({
  ...priceFilters,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["transactionDate", "unitCost", "supplier", "quantity", "invoiceNo"]).default("transactionDate"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const itemSupplierComparisonQuerySchema = z.object({
  ...priceFilters,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["supplier", "latest", "lowest", "highest", "average", "transactions", "lastPurchase"]).default("latest"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

export const itemPriceHistoryQuerySchema = z.object({
  ...priceFilters,
  maxPoints: z.coerce.number().int().min(50).max(2000).default(1000),
});


export const supplierAnalyticsQuerySchema = z.object({
  period: z.enum(["1M", "3M", "6M", "1Y", "ALL"]).default("1Y"),
});

export const supplierItemsQuerySchema = z.object({
  period: z.enum(["1M", "3M", "6M", "1Y", "ALL"]).default("1Y"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z
    .enum(["item", "latest", "lowest", "highest", "average", "difference", "transactions", "lastPurchase"])
    .default("difference"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type ItemAnalyticsQueryInput = z.infer<typeof itemAnalyticsQuerySchema>;
export type ItemTransactionsQueryInput = z.infer<typeof itemTransactionsQuerySchema>;
export type ItemSupplierComparisonQueryInput = z.infer<typeof itemSupplierComparisonQuerySchema>;
export type ItemPriceHistoryQueryInput = z.infer<typeof itemPriceHistoryQuerySchema>;
export type SupplierAnalyticsQueryInput = z.infer<typeof supplierAnalyticsQuerySchema>;
export type SupplierItemsQueryInput = z.infer<typeof supplierItemsQuerySchema>;
