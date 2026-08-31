import { z } from "zod";

import { EMAIL_PREFERENCE_EVENTS } from "./email-settings.types.js";

export const updateEmailSettingsBodySchema = z
  .object({
    notificationsEnabled: z.boolean().optional(),
    activeEmailSource: z.enum(["PORTAL", "ALTERNATE"]).optional(),
    preferences: z
      .array(
        z.object({
          eventType: z.enum(EMAIL_PREFERENCE_EVENTS),
          enabled: z.boolean(),
        }),
      )
      .max(EMAIL_PREFERENCE_EVENTS.length)
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

