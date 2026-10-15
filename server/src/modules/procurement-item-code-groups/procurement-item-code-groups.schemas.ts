import { z } from "zod";

export const groupInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prefix: z.string().regex(/^[0-9]{2,20}$/, "Prefix must contain at least 2 and at most 20 digits."),
});
export const groupIdParamsSchema = z.object({ groupId: z.coerce.number().int().positive() });
export const updateGroupSchema = groupInputSchema.extend({ rowVersion: z.string().trim().min(1).max(64) });
export const deleteGroupQuerySchema = z.object({ rowVersion: z.string().trim().min(1).max(64) });
export type GroupInput = z.infer<typeof groupInputSchema>;
