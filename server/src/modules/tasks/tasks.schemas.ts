import { z } from "zod";

import {
  SORT_DIRECTIONS,
  TASK_DUE_FILTERS,
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  TASK_STATUSES,
} from "./tasks.constants.js";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parts = value.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Invalid date.");

function validateDateRange(
  input: { startDate?: string | null | undefined; dueDate?: string | null | undefined },
  context: z.RefinementCtx,
) {
  if (input.startDate && input.dueDate && input.startDate > input.dueDate) {
    context.addIssue({
      code: "custom",
      message: "Start date must not be after due date.",
      path: ["dueDate"],
    });
  }
}

export const listTasksParamsSchema = z.object({
  listId: z.coerce.number().int().positive(),
});

export const taskParamsSchema = z.object({
  taskId: z.coerce.number().int().positive(),
});

export const taskListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  due: z.enum(TASK_DUE_FILTERS).default("ALL"),
  sortBy: z.enum(TASK_SORT_FIELDS).default("createdAt"),
  sortDirection: z.enum(SORT_DIRECTIONS).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const createTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(1000),
    description: z.string().trim().max(4000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
    startDate: dateOnlySchema.nullable().optional(),
    dueDate: dateOnlySchema.nullable().optional(),
  })
  .superRefine(validateDateRange);

export const updateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(1000).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    startDate: dateOnlySchema.nullable().optional(),
    dueDate: dateOnlySchema.nullable().optional(),
    listId: z.number().int().positive().optional(),
    referenceDate: dateOnlySchema.nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { message: "A task change is required." })
  .superRefine(validateDateRange);

export const changeTaskStatusBodySchema = z
  .object({
    status: z.enum(TASK_STATUSES),
    cancellationReason: z.string().trim().min(1).max(1000).optional(),
  })
  .superRefine((input, context) => {
    if (input.status === "CANCELLED" && !input.cancellationReason) {
      context.addIssue({
        code: "custom",
        message: "A cancellation reason is required.",
        path: ["cancellationReason"],
      });
    }
    if (input.status !== "CANCELLED" && input.cancellationReason !== undefined) {
      context.addIssue({
        code: "custom",
        message: "A cancellation reason is only valid for cancelled tasks.",
        path: ["cancellationReason"],
      });
    }
  });

export type ListTasksParams = z.infer<typeof listTasksParamsSchema>;
export type TaskParams = z.infer<typeof taskParamsSchema>;
export type TaskListQueryInput = z.infer<typeof taskListQuerySchema>;
export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;
export type ChangeTaskStatusBody = z.infer<typeof changeTaskStatusBodySchema>;
