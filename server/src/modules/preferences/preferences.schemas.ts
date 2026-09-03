import { z } from "zod";

export const updatePreferencesBodySchema = z
  .object({
    languageCode: z.enum(["AR", "EN"]).optional(),
    theme: z.enum(["LIGHT", "DARK", "SYSTEM"]).optional(),
    sidebarCollapsed: z.boolean().optional(),
    calendarShowAdjacentDates: z.boolean().optional(),
    meetingStartReminderEnabled: z.boolean().optional(),
    timeFormat: z.enum(["12H", "24H"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one preference must be provided.",
  });

export type UpdatePreferencesBody = z.infer<typeof updatePreferencesBodySchema>;


