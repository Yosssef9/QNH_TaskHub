import { z } from "zod";
import { KPI_COLORS, KPI_ICON_KEYS } from "../kpis/kpis.constants.js";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date.");

const cycleFields = {
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1500).nullable().optional().transform((value) => value || null),
  iconKey: z.enum(KPI_ICON_KEYS),
  color: z.enum(KPI_COLORS),
  startDate: date.nullable().optional(),
  endDate: date.nullable().optional(),
};

const validDates = (value: { startDate?: string | null | undefined; endDate?: string | null | undefined }) =>
  !value.startDate || !value.endDate || value.startDate <= value.endDate;

export const cycleParamsSchema = z.object({ cycleId: z.coerce.number().int().positive() });
export const instanceParamsSchema = z.object({
  cycleId: z.coerce.number().int().positive(),
  instanceId: z.coerce.number().int().positive(),
});
export const directInstanceParamsSchema = z.object({
  instanceId: z.coerce.number().int().positive(),
});
export const createCycleBodySchema = z
  .object({ ...cycleFields, kpiIds: z.array(z.number().int().positive()).min(1).max(50) })
  .refine(validDates, { path: ["endDate"], message: "Start date must not be after end date." })
  .refine((value) => new Set(value.kpiIds).size === value.kpiIds.length, {
    path: ["kpiIds"],
    message: "A KPI template may be selected only once.",
  });
export const updateCycleBodySchema = z
  .object(cycleFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "A Cycle change is required.")
  .refine(validDates, { path: ["endDate"], message: "Start date must not be after end date." });
export const addCycleKpisBodySchema = z.object({
  kpiIds: z.array(z.number().int().positive()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length),
});
export const reorderCyclesBodySchema = z.object({
  cycleIds: z.array(z.number().int().positive()).refine((ids) => new Set(ids).size === ids.length),
});
export const reorderInstancesBodySchema = z.object({
  instanceIds: z.array(z.number().int().positive()).refine((ids) => new Set(ids).size === ids.length),
});

export type CreateCycleBody = z.infer<typeof createCycleBodySchema>;
export type UpdateCycleBody = z.infer<typeof updateCycleBodySchema>;
export type AddCycleKpisBody = z.infer<typeof addCycleKpisBodySchema>;
