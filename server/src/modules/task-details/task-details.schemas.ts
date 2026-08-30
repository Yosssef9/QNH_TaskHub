import { z } from "zod";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const taskIdParamsSchema = z.object({ taskId: z.coerce.number().int().positive() });
export const subtaskIdParamsSchema = z.object({ subtaskId: z.coerce.number().int().positive() });
const sqlServerGuidSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid attachment ID.",
  );

export const attachmentIdParamsSchema = z.object({ attachmentId: sqlServerGuidSchema });
export const createSubtaskBodySchema = z.object({
  title: z.string().trim().min(1).max(1000),
  dueDate: dateOnlySchema.optional(),
});
export const updateSubtaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(1000).optional(),
    dueDate: dateOnlySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "A subtask change is required.");
export const completeSubtaskBodySchema = z.object({ isCompleted: z.boolean() });
export const reorderSubtasksBodySchema = z.object({
  subtaskIds: z.array(z.number().int().positive()).min(1).max(500),
});

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;
export type SubtaskIdParams = z.infer<typeof subtaskIdParamsSchema>;
export type AttachmentIdParams = z.infer<typeof attachmentIdParamsSchema>;
export type CreateSubtaskBody = z.infer<typeof createSubtaskBodySchema>;
export type UpdateSubtaskBody = z.infer<typeof updateSubtaskBodySchema>;
export type CompleteSubtaskBody = z.infer<typeof completeSubtaskBodySchema>;
export type ReorderSubtasksBody = z.infer<typeof reorderSubtasksBodySchema>;
