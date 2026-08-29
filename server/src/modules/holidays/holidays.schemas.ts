import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
export const holidayParamsSchema = z.object({ holidayId: z.coerce.number().int().positive() });
export const saveHolidayBodySchema = z.object({
  holidayDate: date,
  nameAr: z.string().trim().min(1).max(150),
  nameEn: z.string().trim().min(1).max(150),
  isActive: z.boolean().default(true),
});
export type HolidayParams = z.infer<typeof holidayParamsSchema>;
export type SaveHolidayBody = z.infer<typeof saveHolidayBodySchema>;
