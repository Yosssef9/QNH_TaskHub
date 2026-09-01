import { z } from "zod";

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
    const candidate = value as { startAtUtc?: unknown; endAtUtc?: unknown };
    if (typeof candidate.startAtUtc !== "string" || typeof candidate.endAtUtc !== "string") return;
    if (new Date(candidate.endAtUtc).getTime() <= new Date(candidate.startAtUtc).getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["endAtUtc"],
        message: "Meeting end time must be after its start time.",
      });
    }
  });
}

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
  roomId: z.coerce.number().int().positive(),
  startAtUtc: utcDateTimeSchema,
  endAtUtc: utcDateTimeSchema,
});

export const updateMeetingRescheduleBodySchema = withValidSchedule({
  revisionId: z.coerce.number().int().positive(),
  revisionRowVersion: rowVersionSchema,
  roomId: z.coerce.number().int().positive(),
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

export const cancelMeetingBodySchema = z.object({
  meetingRowVersion: rowVersionSchema,
  reason: nullableTrimmed(1000),
});

const meetingTemplateFields = {
  name: z.string().trim().min(1).max(150),
  title: z.string().trim().min(1).max(250),
  description: nullableTrimmed(10000),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  defaultRoomId: z.coerce.number().int().positive().nullable().optional(),
  attendeeUserIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
};

export const createMeetingTemplateBodySchema = z.object(meetingTemplateFields);
export const updateMeetingTemplateBodySchema = z.object({
  ...meetingTemplateFields,
  rowVersion: rowVersionSchema,
});
export const archiveMeetingTemplateBodySchema = z.object({ rowVersion: rowVersionSchema });

export type MeetingWorkspaceParams = z.infer<typeof meetingWorkspaceParamsSchema>;
export type MeetingAttachmentParams = z.infer<typeof meetingAttachmentParamsSchema>;
export type MeetingTemplateParams = z.infer<typeof meetingTemplateParamsSchema>;
export type CreateMeetingRescheduleBody = z.infer<typeof createMeetingRescheduleBodySchema>;
export type UpdateMeetingRescheduleBody = z.infer<typeof updateMeetingRescheduleBodySchema>;
export type DecideMeetingRescheduleBody = z.infer<typeof decideMeetingRescheduleBodySchema>;
export type RejectMeetingRescheduleBody = z.infer<typeof rejectMeetingRescheduleBodySchema>;
export type CancelMeetingBody = z.infer<typeof cancelMeetingBodySchema>;
export type CreateMeetingTemplateBody = z.infer<typeof createMeetingTemplateBodySchema>;
export type UpdateMeetingTemplateBody = z.infer<typeof updateMeetingTemplateBodySchema>;
export type ArchiveMeetingTemplateBody = z.infer<typeof archiveMeetingTemplateBodySchema>;
