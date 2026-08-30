import { z } from "zod";

import { TASK_PRIORITIES, TASK_STATUSES } from "../tasks/tasks.constants.js";
import { CALENDAR_SCOPES } from "./calendar.types.js";

const MAX_CALENDAR_RANGE_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [yearPart, monthPart, dayPart] = value.split("-");
    const year = Number(yearPart);
    const month = Number(monthPart);
    const day = Number(dayPart);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Invalid date.");

function toUtcDay(value: string): number {
  const [yearPart, monthPart, dayPart] = value.split("-");
  return Date.UTC(Number(yearPart), Number(monthPart) - 1, Number(dayPart));
}

export const calendarTasksQuerySchema = z
  .object({
    start: dateOnlySchema,
    end: dateOnlySchema,
    scope: z.enum(CALENDAR_SCOPES),
    search: z.string().trim().max(100).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    listId: z.coerce.number().int().positive().optional(),
    cycleId: z.coerce.number().int().positive().optional(),
    kpiInstanceId: z.coerce.number().int().positive().optional(),
  })
  .superRefine((input, context) => {
    const start = toUtcDay(input.start);
    const end = toUtcDay(input.end);

    if (end <= start) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "Calendar end must be after start.",
      });
    } else if ((end - start) / DAY_MS > MAX_CALENDAR_RANGE_DAYS) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: `Calendar range cannot exceed ${MAX_CALENDAR_RANGE_DAYS} days.`,
      });
    }

    if (input.scope === "PERSONAL" && (input.cycleId !== undefined || input.kpiInstanceId !== undefined)) {
      context.addIssue({
        code: "custom",
        path: [input.cycleId !== undefined ? "cycleId" : "kpiInstanceId"],
        message: "KPI filters are not valid for the personal calendar.",
      });
    }

    if (input.scope === "KPI" && input.listId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["listId"],
        message: "List filters are not valid for the KPI calendar.",
      });
    }
  });

export type CalendarTasksQueryInput = z.infer<typeof calendarTasksQuerySchema>;


export const calendarSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(100),
    scope: z.enum(CALENDAR_SCOPES),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    listId: z.coerce.number().int().positive().optional(),
    cycleId: z.coerce.number().int().positive().optional(),
    kpiInstanceId: z.coerce.number().int().positive().optional(),
  })
  .superRefine((input, context) => {
    if (input.scope === "PERSONAL" && (input.cycleId !== undefined || input.kpiInstanceId !== undefined)) {
      context.addIssue({
        code: "custom",
        path: [input.cycleId !== undefined ? "cycleId" : "kpiInstanceId"],
        message: "KPI filters are not valid for the personal calendar.",
      });
    }

    if (input.scope === "KPI" && input.listId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["listId"],
        message: "List filters are not valid for the KPI calendar.",
      });
    }
  });

export type CalendarSearchQueryInput = z.infer<typeof calendarSearchQuerySchema>;
