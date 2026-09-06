import { z } from "zod";

function nonZeroInteger(value: number): boolean {
  return value !== 0;
}

function parseIds(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!value.trim()) return [];
  return value.split(",").map((part) => Number(part.trim()));
}

const nullableTrimmed = (max: number) => z.string().trim().max(max).nullable();
const nonZeroId = z.coerce.number().int().refine(nonZeroInteger, "ID cannot be zero.");
const uniqueIds = (max: number) =>
  z
    .array(nonZeroId)
    .max(max)
    .refine((values) => new Set(values).size === values.length, "IDs must be unique.");
const periodSchema = z.enum(["1M", "3M", "6M", "1Y", "ALL"]);

const itemFilters = {
  search: z.string().trim().max(120).optional(),
  source: z.enum(["ORACLE", "MANUAL"]).optional(),
  category: z.string().trim().max(150).optional(),
  statusCode: z.coerce.number().int().optional(),
  itemIds: z.preprocess(parseIds, uniqueIds(1000).optional()),
  period: periodSchema.default("ALL"),
  supplierIds: z.preprocess(parseIds, uniqueIds(500).optional()),
  currencyCode: z.string().trim().min(1).max(30).optional(),
  unitName: z.string().trim().min(1).max(100).optional(),
} as const;

export const itemIdParamsSchema = z.object({
  itemId: nonZeroId,
});

export const itemListQuerySchema = z.object({
  ...itemFilters,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum([
    "code",
    "name",
    "category",
    "unit",
    "status",
    "source",
    "latest",
    "lowest",
    "highest",
    "change",
    "suppliers",
    "lastPurchase",
  ]).default("name"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

export const itemOptionsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  source: z.enum(["ORACLE", "MANUAL"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const itemPriceSummariesQuerySchema = z.object({
  itemIds: z.preprocess(parseIds, uniqueIds(100).min(1, "At least one Item ID is required.")),
  period: periodSchema.default("1Y"),
  supplierIds: z.preprocess(parseIds, uniqueIds(500).optional()),
  currencyCode: z.string().trim().min(1).max(30).optional(),
  unitName: z.string().trim().min(1).max(100).optional(),
});

export const itemSupplierMatrixQuerySchema = z.object({
  itemIds: z.preprocess(parseIds, uniqueIds(100).min(1, "At least one Item ID is required.")),
  supplierIds: z.preprocess(parseIds, uniqueIds(50).min(1, "At least one Supplier ID is required.")),
  period: periodSchema.default("1Y"),
});

export const itemOverviewQuerySchema = z.object(itemFilters);

const itemFields = {
  name: z.string().trim().min(1).max(500),
  parentName: nullableTrimmed(500),
  categoryName: nullableTrimmed(250),
  unit: nullableTrimmed(100),
  pieceUnit: nullableTrimmed(100),
  factor: z.number().finite().nonnegative().nullable(),
  isStockItem: z.boolean(),
  statusCode: z.number().int().nullable(),
  isAsset: z.boolean(),
} as const;

export const createItemBodySchema = z.object(itemFields);
export const updateItemBodySchema = z.object(itemFields);

export type ItemIdParams = z.infer<typeof itemIdParamsSchema>;
export type ItemListQueryInput = z.infer<typeof itemListQuerySchema>;
export type ItemOptionsQueryInput = z.infer<typeof itemOptionsQuerySchema>;
export type ItemPriceSummariesQueryInput = z.infer<typeof itemPriceSummariesQuerySchema>;
export type ItemSupplierMatrixQueryInput = z.infer<typeof itemSupplierMatrixQuerySchema>;
export type ItemOverviewQueryInput = z.infer<typeof itemOverviewQuerySchema>;
export type CreateItemBody = z.infer<typeof createItemBodySchema>;
export type UpdateItemBody = z.infer<typeof updateItemBodySchema>;

