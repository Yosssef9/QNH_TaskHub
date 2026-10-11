import { z } from "zod";
export const generalTaskIdSchema = z.object({taskId:z.coerce.number().int().positive()});
export const generalSubtaskIdSchema = z.object({subtaskId:z.coerce.number().int().positive()});
export const generalAssignmentBodySchema = z.object({assigneeUserId:z.number().int().positive().nullable()}).strict();
export const workNotesBodySchema = z.object({workNotes:z.string().max(4000).nullable()}).strict();
export const completionSummaryBodySchema = z.object({completionSummary:z.string().max(10000).nullable()}).strict();
