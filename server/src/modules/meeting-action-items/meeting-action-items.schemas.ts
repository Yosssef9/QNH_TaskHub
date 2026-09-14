import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "../tasks/tasks.constants.js";

const optionalDate = z.string().date().nullable().optional();
const rowVersionSchema = z.string().regex(/^0x[0-9A-Fa-f]{16}$/);

export const meetingActionItemParamsSchema = z.object({
  meetingId: z.coerce.number().int().positive(),
  taskId: z.coerce.number().int().positive(),
});

export const createMeetingActionItemBodySchema = z
  .object({
    title: z.string().trim().min(1).max(250),
    description: z.string().max(10000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
    startDate: optionalDate,
    dueDate: optionalDate,
    assigneeUserId: z.coerce.number().int().positive(),
    agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.startDate && value.dueDate && value.startDate > value.dueDate) {
      context.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Due date must not be before start date.",
      });
    }
  });

export const reassignMeetingActionItemBodySchema = z.object({
  assigneeUserId: z.coerce.number().int().positive(),
  rowVersion: rowVersionSchema,
});

export const assignedActionItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  meetingId: z.coerce.number().int().positive().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  due: z.enum(["ALL", "OVERDUE", "TODAY", "UPCOMING", "NO_DATE"]).default("ALL"),
  sortBy: z.enum(["assignedAt", "dueDate", "priority", "title", "status", "meeting"]).default("assignedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  groupBy: z.enum(["NONE", "MEETING", "DUE_DATE", "PRIORITY", "STATUS"]).default("NONE"),
});

export type MeetingActionItemParams = z.infer<typeof meetingActionItemParamsSchema>;
export type CreateMeetingActionItemBody = z.infer<typeof createMeetingActionItemBodySchema>;
export type ReassignMeetingActionItemBody = z.infer<typeof reassignMeetingActionItemBodySchema>;
export type AssignedActionItemsQuery = z.infer<typeof assignedActionItemsQuerySchema>;
