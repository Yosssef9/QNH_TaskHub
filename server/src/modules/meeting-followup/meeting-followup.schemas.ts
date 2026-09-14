import { z } from "zod";

const rowVersionSchema = z.string().regex(/^0x[0-9A-Fa-f]{16}$/);
const agendaItemIdSchema = z.coerce.number().int().positive().nullable().optional();

export const meetingDecisionParamsSchema = z.object({
  meetingId: z.coerce.number().int().positive(),
  decisionId: z.coerce.number().int().positive(),
});

export const createMeetingDecisionBodySchema = z.object({
  decisionText: z.string().trim().min(1).max(10000),
  agendaItemId: agendaItemIdSchema,
});

export const updateMeetingDecisionBodySchema = createMeetingDecisionBodySchema.extend({
  rowVersion: rowVersionSchema,
});

export const saveMeetingFollowUpNotesBodySchema = z.object({
  notesText: z.string().max(50000),
  rowVersion: rowVersionSchema.nullable().optional(),
});

export type MeetingDecisionParams = z.infer<typeof meetingDecisionParamsSchema>;
export type CreateMeetingDecisionBody = z.infer<typeof createMeetingDecisionBodySchema>;
export type UpdateMeetingDecisionBody = z.infer<typeof updateMeetingDecisionBodySchema>;
export type SaveMeetingFollowUpNotesBody = z.infer<typeof saveMeetingFollowUpNotesBodySchema>;
