import { z } from "zod";
import {
  SORT_DIRECTIONS,
  TASK_DUE_FILTERS,
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  TASK_STATUSES,
} from "../tasks/tasks.constants.js";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date.");

export const kpiWorkParamsSchema = z.object({ instanceId: z.coerce.number().int().positive() });

export const kpiTaskListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  due: z.enum(TASK_DUE_FILTERS).default("ALL"),
  sortBy: z.enum(TASK_SORT_FIELDS).default("createdAt"),
  sortDirection: z.enum(SORT_DIRECTIONS).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const kpiTaskFields = {
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(4000).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  startDate: date.nullable().optional(),
  dueDate: date.nullable().optional(),
  referenceDate: date.nullable().optional(),
};

const validTaskDateRange = (value: {
  startDate?: string | null | undefined;
  dueDate?: string | null | undefined;
}) => !value.startDate || !value.dueDate || value.startDate <= value.dueDate;
const taskDateRangeIssue = {
  path: ["dueDate"],
  message: "Start date must not be after due date.",
};

const kpiTaskObjectSchema = z.object(kpiTaskFields);
export const createKpiTaskBodySchema = kpiTaskObjectSchema.refine(
  validTaskDateRange,
  taskDateRangeIssue,
);
export const createGlobalKpiTaskBodySchema = kpiTaskObjectSchema
  .extend({ cycleId: z.number().int().positive(), kpiInstanceId: z.number().int().positive() })
  .refine(validTaskDateRange, taskDateRangeIssue);

export const globalKpiTaskListQuerySchema = kpiTaskListQuerySchema.extend({
  cycleId: z.coerce.number().int().positive().optional(),
  kpiId: z.coerce.number().int().positive().optional(),
});

export const kpiTaskDeadlineQuerySchema = z.object({
  referenceDate: date,
});

export const kpiPeriodQuerySchema = z
  .object({ periodStart: date, periodEnd: date })
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: "Period start must not be after period end.",
  });

export const saveManualMeasurementBodySchema = z.object({
  periodStart: date,
  periodEnd: date,
  numeratorValue: z.number().min(0).nullable(),
  denominatorValue: z.number().positive().nullable(),
  manualValue: z.number().min(0).nullable(),
});

export type KpiWorkParams = z.infer<typeof kpiWorkParamsSchema>;
export type KpiTaskListQuery = z.infer<typeof kpiTaskListQuerySchema>;
export type CreateKpiTaskBody = z.infer<typeof createKpiTaskBodySchema>;
export type CreateGlobalKpiTaskBody = z.infer<typeof createGlobalKpiTaskBodySchema>;
export type GlobalKpiTaskListQuery = z.infer<typeof globalKpiTaskListQuerySchema>;
export type KpiTaskDeadlineQuery = z.infer<typeof kpiTaskDeadlineQuerySchema>;
export type KpiPeriodQuery = z.infer<typeof kpiPeriodQuerySchema>;
export type SaveManualMeasurementBody = z.infer<typeof saveManualMeasurementBodySchema>;
