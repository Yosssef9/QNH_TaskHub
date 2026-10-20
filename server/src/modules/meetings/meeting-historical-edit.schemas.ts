import { z } from "zod";
import { createMeetingBodySchema } from "./meeting-workflow.schemas.js";

const version = z.string().regex(/^0x[0-9A-Fa-f]{16}$/);

export const updateHistoricalMeetingBodySchema = createMeetingBodySchema.safeExtend({
  meetingRowVersion: version,
  revisionRowVersion: version,
  agendaItems: z.array(z.object({
    id: z.number().int().positive().nullable().optional(),
    topic: z.string().trim().min(1).max(500),
    presenterUserId: z.number().int().positive().nullable(),
    plannedDurationMinutes: z.number().int().min(1).max(1440).nullable(),
  })).max(50),
});

export type UpdateHistoricalMeetingInput = z.infer<typeof updateHistoricalMeetingBodySchema>;
