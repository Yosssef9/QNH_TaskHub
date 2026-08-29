import { z } from "zod";
import {
  KPI_COLORS,
  KPI_DEADLINE_DIRECTIONS,
  KPI_DEADLINE_SOURCES,
  KPI_DIRECTIONS,
  KPI_ICON_KEYS,
  KPI_METHODS,
  KPI_PERIODS,
} from "./kpis.constants.js";

export const kpiParamsSchema = z.object({ kpiId: z.coerce.number().int().positive() });

export const saveKpiBodySchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: z
      .string()
      .trim()
      .max(1500)
      .nullable()
      .optional()
      .transform((value) => value || null),
    iconKey: z.enum(KPI_ICON_KEYS),
    color: z.enum(KPI_COLORS),
    calculationMethod: z.enum(KPI_METHODS),
    periodType: z.enum(KPI_PERIODS),
    targetValue: z.number().min(0).max(999999999999999).nullable(),
    targetDirection: z.enum(KPI_DIRECTIONS).nullable(),
    deadlineSource: z.enum(KPI_DEADLINE_SOURCES).nullable(),
    businessDayOffset: z.number().int().min(0).max(365).nullable(),
    deadlineDirection: z.enum(KPI_DEADLINE_DIRECTIONS).nullable(),
    referenceDateLabel: z.string().trim().min(1).max(100).nullable(),
    numeratorLabel: z.string().trim().min(1).max(100).nullable(),
    denominatorLabel: z.string().trim().min(1).max(100).nullable(),
    valueLabel: z.string().trim().min(1).max(100).nullable(),
  })
  .superRefine((value, context) => {
    if ((value.targetValue === null) !== (value.targetDirection === null)) {
      context.addIssue({
        code: "custom",
        path: ["targetValue"],
        message: "Target value and direction must be provided together.",
      });
    }

    if (value.calculationMethod === "ON_TIME_RATE") {
      if (value.deadlineSource === null) {
        context.addIssue({
          code: "custom",
          path: ["deadlineSource"],
          message: "On-time KPIs require a deadline source.",
        });
      } else if (value.deadlineSource === "REFERENCE_DATE") {
        if (
          value.businessDayOffset === null ||
          value.deadlineDirection === null ||
          value.referenceDateLabel === null
        ) {
          context.addIssue({
            code: "custom",
            path: ["businessDayOffset"],
            message: "Reference-date on-time KPIs require a business-day deadline configuration.",
          });
        }
      } else if (
        value.businessDayOffset !== null ||
        value.deadlineDirection !== null ||
        value.referenceDateLabel !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["deadlineSource"],
          message: "Task-due-date on-time KPIs cannot use reference-date deadline settings.",
        });
      }
    } else if (
      value.deadlineSource !== null ||
      value.businessDayOffset !== null ||
      value.deadlineDirection !== null ||
      value.referenceDateLabel !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["deadlineSource"],
        message: "Deadline configuration is only valid for on-time KPIs.",
      });
    }

    if (value.calculationMethod === "MANUAL_RATIO") {
      if (
        value.numeratorLabel === null ||
        value.denominatorLabel === null ||
        value.valueLabel !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["numeratorLabel"],
          message: "Manual ratios require achieved and total labels.",
        });
      }
    } else if (value.calculationMethod === "MANUAL_NUMBER") {
      if (
        value.valueLabel === null ||
        value.numeratorLabel !== null ||
        value.denominatorLabel !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["valueLabel"],
          message: "Manual numbers require one value label.",
        });
      }
    } else if (
      value.numeratorLabel !== null ||
      value.denominatorLabel !== null ||
      value.valueLabel !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["valueLabel"],
        message: "Manual labels are not valid for this method.",
      });
    }
  });

export const reorderKpisBodySchema = z.object({
  kpiIds: z.array(z.number().int().positive()).refine((ids) => new Set(ids).size === ids.length),
});
export const updateKpiActiveBodySchema = z.object({ isActive: z.boolean() });

export type KpiParams = z.infer<typeof kpiParamsSchema>;
export type SaveKpiBody = z.infer<typeof saveKpiBodySchema>;
export type ReorderKpisBody = z.infer<typeof reorderKpisBodySchema>;
export type UpdateKpiActiveBody = z.infer<typeof updateKpiActiveBodySchema>;
