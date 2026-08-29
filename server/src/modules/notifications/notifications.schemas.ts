import { z } from "zod";

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const notificationParamsSchema = z.object({
  notificationId: z.coerce.number().int().positive(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationParams = z.infer<typeof notificationParamsSchema>;
