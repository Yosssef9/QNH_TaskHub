import { z } from "zod";

import { isValidZoomJoinUrl } from "./meeting-online-location.js";

const utcDateTimeSchema = z.string().datetime({ offset: true });
const rowVersionSchema = z.string().regex(/^0x[0-9A-Fa-f]{16}$/);

const nullableTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

const meetingLocationFields = {
  meetingMode: z.enum(["ROOM", "ZOOM"]).default("ROOM"),
  roomId: z.coerce.number().int().positive().nullable().optional().transform((value) => value ?? null),
  onlineJoinUrl: nullableTrimmed(2048),
};

function validateLocation(
  value: { meetingMode: "ROOM" | "ZOOM"; roomId: number | null; onlineJoinUrl: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.meetingMode === "ROOM") {
    if (value.roomId === null) {
      ctx.addIssue({ code: "custom", path: ["roomId"], message: "Meeting Room is required." });
    }
    if (value.onlineJoinUrl !== null) {
      ctx.addIssue({ code: "custom", path: ["onlineJoinUrl"], message: "Room Meetings cannot store an online join link." });
    }
    return;
  }

  if (value.roomId !== null) {
    ctx.addIssue({ code: "custom", path: ["roomId"], message: "Zoom Meetings do not reserve a Meeting Room." });
  }
  if (value.onlineJoinUrl === null || !isValidZoomJoinUrl(value.onlineJoinUrl)) {
    ctx.addIssue({ code: "custom", path: ["onlineJoinUrl"], message: "Enter a valid HTTPS Zoom Meeting link." });
  }
}

function withValidSchedule<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).superRefine((value, ctx) => {
    const candidate = value as {
      startAtUtc?: unknown;
      endAtUtc?: unknown;
      meetingMode?: unknown;
      roomId?: unknown;
      onlineJoinUrl?: unknown;
    };
    if (typeof candidate.startAtUtc === "string" && typeof candidate.endAtUtc === "string") {
      if (new Date(candidate.endAtUtc).getTime() <= new Date(candidate.startAtUtc).getTime()) {
        ctx.addIssue({
          code: "custom",
          path: ["endAtUtc"],
          message: "Meeting end time must be after its start time.",
        });
      }
    }
    if (
      (candidate.meetingMode === "ROOM" || candidate.meetingMode === "ZOOM") &&
      (typeof candidate.roomId === "number" || candidate.roomId === null) &&
      (typeof candidate.onlineJoinUrl === "string" || candidate.onlineJoinUrl === null)
    ) {
      validateLocation(candidate as { meetingMode: "ROOM" | "ZOOM"; roomId: number | null; onlineJoinUrl: string | null }, ctx);
    }
  });
}

const meetingAgendaItemSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  presenterUserId: z.coerce.number().int().positive().nullable().optional().transform((value) => value ?? null),
  plannedDurationMinutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

const meetingContentFields = {
  title: z.string().trim().min(1).max(250),
  description: nullableTrimmed(10000),
  ...meetingLocationFields,
  startAtUtc: utcDateTimeSchema,
  endAtUtc: utcDateTimeSchema,
  organizerAttending: z.boolean(),
  attendeeUserIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  agendaItems: z.array(meetingAgendaItemSchema).max(50).default([]),
  followUpOfMeetingId: z.coerce.number().int().positive().nullable().optional().transform((value) => value ?? null),
};

export const meetingParticipantQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(30),
});

export const createMeetingBodySchema = withValidSchedule(meetingContentFields);

export const meetingRequestParamsSchema = z.object({
  meetingId: z.coerce.number().int().positive(),
});

export const updateMeetingScheduleBodySchema = withValidSchedule({
  revisionId: z.coerce.number().int().positive(),
  revisionRowVersion: rowVersionSchema,
  ...meetingLocationFields,
  startAtUtc: utcDateTimeSchema,
  endAtUtc: utcDateTimeSchema,
  schedulingNotes: nullableTrimmed(1000),
});

export const decideMeetingRequestBodySchema = z.object({
  revisionId: z.coerce.number().int().positive(),
  revisionRowVersion: rowVersionSchema,
});

export const rejectMeetingRequestBodySchema = z.object({
  revisionId: z.coerce.number().int().positive(),
  revisionRowVersion: rowVersionSchema,
  reason: nullableTrimmed(1000),
});

export const meetingScheduleQuerySchema = z
  .object({
    fromAtUtc: utcDateTimeSchema,
    toAtUtc: utcDateTimeSchema,
    roomId: z.coerce.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    const from = new Date(value.fromAtUtc).getTime();
    const to = new Date(value.toAtUtc).getTime();
    if (to <= from) {
      ctx.addIssue({ code: "custom", path: ["toAtUtc"], message: "Schedule range end must be after its start." });
      return;
    }
    if (to - from > 62 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({ code: "custom", path: ["toAtUtc"], message: "Meeting schedule range cannot exceed 62 days." });
    }
  });

export type MeetingParticipantQuery = z.infer<typeof meetingParticipantQuerySchema>;
export type CreateMeetingBody = z.infer<typeof createMeetingBodySchema>;
export type MeetingRequestParams = z.infer<typeof meetingRequestParamsSchema>;
export type UpdateMeetingScheduleBody = z.infer<typeof updateMeetingScheduleBodySchema>;
export type DecideMeetingRequestBody = z.infer<typeof decideMeetingRequestBodySchema>;
export type RejectMeetingRequestBody = z.infer<typeof rejectMeetingRequestBodySchema>;
export type MeetingScheduleQuery = z.infer<typeof meetingScheduleQuerySchema>;
