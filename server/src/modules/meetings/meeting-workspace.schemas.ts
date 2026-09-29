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

function withValidSchedule<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).superRefine((value, ctx) => {
    const candidate = value as { startAtUtc?: unknown; endAtUtc?: unknown; meetingMode?: unknown; roomId?: unknown; onlineJoinUrl?: unknown };
    if (typeof candidate.startAtUtc === "string" && typeof candidate.endAtUtc === "string" && new Date(candidate.endAtUtc).getTime() <= new Date(candidate.startAtUtc).getTime()) {
      ctx.addIssue({ code: "custom", path: ["endAtUtc"], message: "Meeting end time must be after its start time." });
    }
    if (candidate.meetingMode === "ROOM") {
      if (typeof candidate.roomId !== "number") ctx.addIssue({ code: "custom", path: ["roomId"], message: "Choose a Meeting Room." });
      if (candidate.onlineJoinUrl !== null) ctx.addIssue({ code: "custom", path: ["onlineJoinUrl"], message: "Room Meetings cannot store an online join link." });
    } else if (candidate.meetingMode === "ZOOM") {
      if (candidate.roomId !== null) ctx.addIssue({ code: "custom", path: ["roomId"], message: "Zoom Meetings do not use a physical Meeting Room." });
      if (typeof candidate.onlineJoinUrl !== "string" || !isValidZoomJoinUrl(candidate.onlineJoinUrl)) ctx.addIssue({ code: "custom", path: ["onlineJoinUrl"], message: "Enter a valid HTTPS Zoom Meeting link." });
    }
  });
}

const locationFields = {
  meetingMode: z.enum(["ROOM", "ZOOM"]),
  roomId: z.coerce.number().int().positive().nullable(),
  onlineJoinUrl: nullableTrimmed(2048),
};

export const meetingWorkspaceParamsSchema = z.object({
  meetingId: z.coerce.number().int().positive(),
});

export const meetingAttachmentParamsSchema = z.object({
  attachmentId: z.string().uuid(),
});

export const meetingTemplateParamsSchema = z.object({
  templateId: z.coerce.number().int().positive(),
});

export const createMeetingRescheduleBodySchema = withValidSchedule({
  meetingRowVersion: rowVersionSchema,
  ...locationFields,
  startAtUtc: utcDateTimeSchema,
  endAtUtc: utcDateTimeSchema,
});

export const updateMeetingRescheduleBodySchema = withValidSchedule({
  revisionId: z.coerce.number().int().positive(),
  revisionRowVersion: rowVersionSchema,
  ...locationFields,
  startAtUtc: utcDateTimeSchema,
  endAtUtc: utcDateTimeSchema,
  schedulingNotes: nullableTrimmed(1000),
});


export const updateOrganizerRescheduleBodySchema = withValidSchedule({
  revisionId: z.coerce.number().int().positive(),
  revisionRowVersion: rowVersionSchema,
  ...locationFields,
  startAtUtc: utcDateTimeSchema,
  endAtUtc: utcDateTimeSchema,
});

export const coordinatorDirectRescheduleBodySchema = withValidSchedule({
  meetingRowVersion: rowVersionSchema,
  ...locationFields,
  startAtUtc: utcDateTimeSchema,
  endAtUtc: utcDateTimeSchema,
  schedulingNotes: nullableTrimmed(1000),
});

export const decideMeetingRescheduleBodySchema = z.object({
  revisionId: z.coerce.number().int().positive(),
  revisionRowVersion: rowVersionSchema,
});

export const rejectMeetingRescheduleBodySchema = decideMeetingRescheduleBodySchema.extend({
  reason: nullableTrimmed(1000),
});

export const cancelMeetingRescheduleRequestBodySchema = decideMeetingRescheduleBodySchema.extend({
  reason: nullableTrimmed(1000),
});

export const cancelMeetingBodySchema = z.object({
  meetingRowVersion: rowVersionSchema,
  reason: z.string().trim().min(1).max(1000),
});

const meetingAgendaItemBodySchema = z.object({
  id: z.coerce.number().int().positive().nullable().optional(),
  topic: z.string().trim().min(1).max(500),
  presenterUserId: z.coerce.number().int().positive().nullable().optional().transform((value) => value ?? null),
  plannedDurationMinutes: z.coerce.number().int().min(1).max(1440).nullable().optional().transform((value) => value ?? null),
});

export const updateMeetingAgendaBodySchema = z.object({
  meetingRowVersion: rowVersionSchema,
  agendaItems: z.array(meetingAgendaItemBodySchema).max(50),
});

const meetingAttendanceStatusSchema = z.enum(["NOT_MARKED", "ATTENDED", "ABSENT"]);

export const updateMeetingAttendanceBodySchema = z.object({
  participantUserId: z.coerce.number().int().positive(),
  status: meetingAttendanceStatusSchema,
});

export const bulkUpdateMeetingAttendanceBodySchema = z.object({
  status: z.enum(["NOT_MARKED", "ATTENDED"]),
});

const meetingTemplateFields = {
  name: z.string().trim().min(1).max(150),
  title: z.string().trim().min(1).max(250),
  description: nullableTrimmed(10000),
  durationMinutes: z.coerce.number().int().min(30).max(1440),
  meetingMode: z.enum(["ROOM", "ZOOM"]),
  defaultRoomId: z.coerce.number().int().positive().nullable().optional(),
  organizerAttending: z.boolean(),
  attendeeUserIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
};

const validateTemplateLocation = (value: { meetingMode: "ROOM" | "ZOOM"; defaultRoomId?: number | null | undefined }, ctx: z.RefinementCtx) => {
  if (value.meetingMode === "ZOOM" && value.defaultRoomId != null) {
    ctx.addIssue({ code: "custom", path: ["defaultRoomId"], message: "Zoom Meeting Templates cannot reserve a physical room." });
  }
};
export const createMeetingTemplateBodySchema = z.object(meetingTemplateFields).superRefine(validateTemplateLocation);
export const updateMeetingTemplateBodySchema = z.object({ ...meetingTemplateFields, rowVersion: rowVersionSchema }).superRefine(validateTemplateLocation);
export const archiveMeetingTemplateBodySchema = z.object({ rowVersion: rowVersionSchema });

export type MeetingWorkspaceParams = z.infer<typeof meetingWorkspaceParamsSchema>;
export type MeetingAttachmentParams = z.infer<typeof meetingAttachmentParamsSchema>;
export type MeetingTemplateParams = z.infer<typeof meetingTemplateParamsSchema>;
export type CreateMeetingRescheduleBody = z.infer<typeof createMeetingRescheduleBodySchema>;
export type UpdateMeetingRescheduleBody = z.infer<typeof updateMeetingRescheduleBodySchema>;
export type UpdateOrganizerRescheduleBody = z.infer<typeof updateOrganizerRescheduleBodySchema>;
export type CoordinatorDirectRescheduleBody = z.infer<typeof coordinatorDirectRescheduleBodySchema>;
export type DecideMeetingRescheduleBody = z.infer<typeof decideMeetingRescheduleBodySchema>;
export type RejectMeetingRescheduleBody = z.infer<typeof rejectMeetingRescheduleBodySchema>;
export type CancelMeetingRescheduleRequestBody = z.infer<typeof cancelMeetingRescheduleRequestBodySchema>;
export type CancelMeetingBody = z.infer<typeof cancelMeetingBodySchema>;
export type UpdateMeetingAgendaBody = z.infer<typeof updateMeetingAgendaBodySchema>;
export type UpdateMeetingAttendanceBody = z.infer<typeof updateMeetingAttendanceBodySchema>;
export type BulkUpdateMeetingAttendanceBody = z.infer<typeof bulkUpdateMeetingAttendanceBodySchema>;
export type CreateMeetingTemplateBody = z.infer<typeof createMeetingTemplateBodySchema>;
export type UpdateMeetingTemplateBody = z.infer<typeof updateMeetingTemplateBodySchema>;
export type ArchiveMeetingTemplateBody = z.infer<typeof archiveMeetingTemplateBodySchema>;


