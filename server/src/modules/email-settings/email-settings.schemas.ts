import { z } from "zod";

import { NOTIFICATION_TYPES } from "../notifications/notifications.types.js";

export const updateEmailSettingsBodySchema = z
  .object({
    notificationsEnabled: z.boolean().optional(),
    activeEmailSource: z.enum(["PORTAL", "ALTERNATE"]).optional(),
    preferences: z
      .array(
        z.object({
          eventType: z.enum(NOTIFICATION_TYPES),
          enabled: z.boolean(),
        }),
      )
      .max(NOTIFICATION_TYPES.length)
      .optional(),
  })
  .refine(
    (value) =>
      value.notificationsEnabled !== undefined ||
      value.activeEmailSource !== undefined ||
      value.preferences !== undefined,
    { message: "At least one email setting must be provided." },
  );

export const requestAlternateVerificationBodySchema = z.object({
  email: z.string().trim().email().max(320),
});

export const verifyAlternateEmailBodySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
});

export type UpdateEmailSettingsBody = z.infer<typeof updateEmailSettingsBodySchema>;
export type RequestAlternateVerificationBody = z.infer<
  typeof requestAlternateVerificationBodySchema
>;
export type VerifyAlternateEmailBody = z.infer<typeof verifyAlternateEmailBodySchema>;
