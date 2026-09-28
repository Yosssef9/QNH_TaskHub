import { z } from "zod";

export const meetingReportParamsSchema = z.object({
  meetingId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export const meetingReportQuerySchema = z.object({
  language: z.enum(["ar", "en"]).optional(),
}).strict();
export const meetingReportScheduleQuerySchema = z.object({}).strict();
export type MeetingReportParams = z.infer<typeof meetingReportParamsSchema>;
export type MeetingReportQuery = z.infer<typeof meetingReportQuerySchema>;

