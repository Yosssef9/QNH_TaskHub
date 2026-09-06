import { z } from "zod";

const nonZeroId = z.number().int().refine((value) => value !== 0, "ID cannot be zero.");
const uniqueIds = (max: number) => z.array(nonZeroId).max(max).refine((values) => new Set(values).size === values.length, "IDs must be unique.");

export const savedViewConfigSchema = z.object({
  itemIds: uniqueIds(1000).default([]),
  supplierIds: uniqueIds(500).default([]),
  period: z.enum(["1M", "3M", "6M", "1Y", "ALL"]).default("1Y"),
  category: z.string().trim().max(250).nullable().default(null),
  source: z.enum(["ORACLE", "MANUAL"]).nullable().default(null),
  statusCode: z.number().int().nullable().default(null),
  sortBy: z.string().trim().max(80).nullable().default("name"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  columns: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  matrixPriceSource: z.enum(["actual", "quote", "compare"]).default("actual"),
  matrixMetric: z.enum(["latest", "previous", "lowest", "highest", "average"]).default("latest"),
});

export const savedViewIdParamsSchema = z.object({
  savedViewId: z.coerce.number().int().positive(),
});

export const createSavedViewBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  config: savedViewConfigSchema,
  isDefault: z.boolean().default(false),
});

export const updateSavedViewBodySchema = createSavedViewBodySchema.extend({
  rowVersion: z.string().trim().min(1).max(64),
});

export const deleteSavedViewQuerySchema = z.object({
  rowVersion: z.string().trim().min(1).max(64),
});

export const duplicateSavedViewBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

export type SavedViewIdParams = z.infer<typeof savedViewIdParamsSchema>;
export type CreateSavedViewBody = z.infer<typeof createSavedViewBodySchema>;
export type UpdateSavedViewBody = z.infer<typeof updateSavedViewBodySchema>;
export type DeleteSavedViewQuery = z.infer<typeof deleteSavedViewQuerySchema>;
export type DuplicateSavedViewBody = z.infer<typeof duplicateSavedViewBodySchema>;
