import { z } from "zod";

import {
  MEETING_SERIES_MAX_OCCURRENCES,
  MEETING_SERIES_TIME_ZONE,
  MEETING_SERIES_WEEKDAYS,
} from "./meeting-series.types.js";

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for Meeting Series dates.");
const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm for Meeting Series times.");
const positiveUserIdSchema = z.coerce.number().int().positive();
const nullableDescriptionValueSchema = z
  .string()
  .trim()
  .max(10000)
  .nullable()
  .transform((value) => (value && value.length > 0 ? value : null));
const nullableDescriptionSchema = nullableDescriptionValueSchema.optional().transform((value) => value ?? null);
const optionalDescriptionOverrideSchema = nullableDescriptionValueSchema.optional();

const agendaItemSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  presenterUserId: positiveUserIdSchema.nullable().optional().transform((value) => value ?? null),
  plannedDurationMinutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const meetingSeriesDefaultsSchema = z.object({
  title: z.string().trim().min(1).max(250),
  description: nullableDescriptionSchema,
  organizerAttending: z.boolean(),
  attendeeUserIds: z.array(positiveUserIdSchema).max(500).default([]),
  agendaItems: z.array(agendaItemSchema).max(50).default([]),
  roomId: z.coerce.number().int().positive(),
  startTime: localTimeSchema,
  endTime: localTimeSchema,
});

const rangeEndDateSchema = z.object({
  type: z.literal("END_DATE"),
  startDate: localDateSchema,
  endDate: localDateSchema,
});

const rangeCountSchema = z.object({
  type: z.literal("COUNT"),
  startDate: localDateSchema,
  count: z.coerce.number().int().min(1).max(MEETING_SERIES_MAX_OCCURRENCES),
});

const patternRangeSchema = z.discriminatedUnion("type", [rangeEndDateSchema, rangeCountSchema]);

const dailyPatternSchema = z.object({
  type: z.literal("DAILY"),
  interval: z.coerce.number().int().min(1).max(365).default(1),
});

const weeklyPatternSchema = z.object({
  type: z.literal("WEEKLY"),
  interval: z.coerce.number().int().min(1).max(52).default(1),
  daysOfWeek: z.array(z.enum(MEETING_SERIES_WEEKDAYS)).min(1).max(7),
});

const monthlyDatePatternSchema = z.object({
  type: z.literal("MONTHLY_DATE"),
  interval: z.coerce.number().int().min(1).max(12).default(1),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
});

const monthlyRelativePatternSchema = z.object({
  type: z.literal("MONTHLY_RELATIVE"),
  interval: z.coerce.number().int().min(1).max(12).default(1),
  ordinal: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
  dayOfWeek: z.enum(MEETING_SERIES_WEEKDAYS),
});

const recurrencePatternSchema = z.discriminatedUnion("type", [
  dailyPatternSchema,
  weeklyPatternSchema,
  monthlyDatePatternSchema,
  monthlyRelativePatternSchema,
]);

const patternScheduleSchema = z.object({
  mode: z.literal("PATTERN"),
  pattern: recurrencePatternSchema,
  range: patternRangeSchema,
});

const customScheduleSchema = z.object({
  mode: z.literal("CUSTOM"),
  dates: z.array(localDateSchema).min(1).max(MEETING_SERIES_MAX_OCCURRENCES),
});

const detailOverrideFields = {
  title: z.string().trim().min(1).max(250).optional(),
  description: optionalDescriptionOverrideSchema,
  organizerAttending: z.boolean().optional(),
  attendeeUserIds: z.array(positiveUserIdSchema).max(500).optional(),
  agendaItems: z.array(agendaItemSchema).max(50).optional(),
};

const occurrenceOverrideSchema = z
  .object({
    action: z.literal("OVERRIDE"),
    occurrenceKey: z.string().trim().min(1).max(120),
    date: localDateSchema.optional(),
    startTime: localTimeSchema.optional(),
    endTime: localTimeSchema.optional(),
    roomId: z.coerce.number().int().positive().optional(),
    ...detailOverrideFields,
  })
  .superRefine((value, ctx) => {
    const overrideFieldNames = [
      "date",
      "startTime",
      "endTime",
      "roomId",
      "title",
      "description",
      "organizerAttending",
      "attendeeUserIds",
      "agendaItems",
    ] as const;
    if (overrideFieldNames.some((field) => value[field] !== undefined)) return;

    ctx.addIssue({
      code: "custom",
      message: "Occurrence override must change at least one value.",
    });
  });

const occurrenceRemoveSchema = z.object({
  action: z.literal("REMOVE"),
  occurrenceKey: z.string().trim().min(1).max(120),
});

const occurrenceAddSchema = z.object({
  action: z.literal("ADD"),
  clientOccurrenceId: z.string().uuid(),
  date: localDateSchema,
  startTime: localTimeSchema.optional(),
  endTime: localTimeSchema.optional(),
  roomId: z.coerce.number().int().positive().optional(),
  ...detailOverrideFields,
});

const occurrenceExceptionSchema = z.discriminatedUnion("action", [
  occurrenceOverrideSchema,
  occurrenceRemoveSchema,
  occurrenceAddSchema,
]);

export const meetingSeriesPreviewBodySchema = z
  .object({
    timeZone: z.literal(MEETING_SERIES_TIME_ZONE).default(MEETING_SERIES_TIME_ZONE),
    defaults: meetingSeriesDefaultsSchema,
    schedule: z.discriminatedUnion("mode", [patternScheduleSchema, customScheduleSchema]),
    exceptions: z.array(occurrenceExceptionSchema).max(300).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.schedule.mode === "PATTERN" && value.schedule.range.type === "END_DATE") {
      if (value.schedule.range.endDate < value.schedule.range.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule", "range", "endDate"],
          message: "Meeting Series end date cannot be before its start date.",
        });
      }
    }

    if (value.schedule.mode === "CUSTOM") {
      const uniqueDates = new Set(value.schedule.dates);
      if (uniqueDates.size !== value.schedule.dates.length) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule", "dates"],
          message: "Custom Meeting Series dates must be unique.",
        });
      }
    }

    if (value.schedule.mode === "PATTERN" && value.schedule.pattern.type === "WEEKLY") {
      const uniqueDays = new Set(value.schedule.pattern.daysOfWeek);
      if (uniqueDays.size !== value.schedule.pattern.daysOfWeek.length) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule", "pattern", "daysOfWeek"],
          message: "Weekly Meeting Series weekdays must be unique.",
        });
      }
    }
  });

export const createMeetingSeriesBodySchema = meetingSeriesPreviewBodySchema.safeExtend({
  creationRequestId: z.string().uuid().transform((value) => value.toLowerCase()),
});

export type MeetingSeriesPreviewBody = z.infer<typeof meetingSeriesPreviewBodySchema>;
export type CreateMeetingSeriesBody = z.infer<typeof createMeetingSeriesBodySchema>;
export type MeetingSeriesOccurrenceException = MeetingSeriesPreviewBody["exceptions"][number];



export const meetingSeriesParamsSchema = z.object({
  seriesId: z.coerce.number().int().positive(),
});

export const meetingSeriesMeetingParamsSchema = z.object({
  meetingId: z.coerce.number().int().positive(),
});

export const meetingSeriesListQuerySchema = z.object({
  search: z.string().trim().max(250).optional().transform((value) => value || null),
  state: z.enum(["ALL", "UPCOMING", "COMPLETED", "ALL_CANCELLED"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});


export const meetingSeriesAttachmentBodySchema = z.object({
  attachmentRequestId: z.string().uuid().transform((value) => value.toLowerCase()),
  scope: z.enum(["COMMON", "OCCURRENCE"]),
  occurrenceKey: z.string().trim().min(1).max(120).optional(),
}).superRefine((value, ctx) => {
  if (value.scope === "OCCURRENCE" && !value.occurrenceKey) {
    ctx.addIssue({ code: "custom", path: ["occurrenceKey"], message: "Occurrence key is required for an occurrence attachment." });
  }
  if (value.scope === "COMMON" && value.occurrenceKey) {
    ctx.addIssue({ code: "custom", path: ["occurrenceKey"], message: "Common Series attachments must not specify an occurrence key." });
  }
});

export type MeetingSeriesAttachmentBody = z.infer<typeof meetingSeriesAttachmentBodySchema>;

export type MeetingSeriesParams = z.infer<typeof meetingSeriesParamsSchema>;
export type MeetingSeriesMeetingParams = z.infer<typeof meetingSeriesMeetingParamsSchema>;
export type MeetingSeriesListQuery = z.infer<typeof meetingSeriesListQuerySchema>;

