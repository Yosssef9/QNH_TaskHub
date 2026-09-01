import { z } from "zod";

const nullableTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

const roomFields = {
  code: nullableTrimmed(50),
  nameAr: z.string().trim().min(1).max(150),
  nameEn: z.string().trim().min(1).max(150),
  locationText: nullableTrimmed(300),
  capacity: z.coerce.number().int().min(1).max(10000),
  equipmentNotes: nullableTrimmed(1000),
  isActive: z.boolean().default(true),
};

export const meetingRoomParamsSchema = z.object({
  roomId: z.coerce.number().int().positive(),
});

export const createMeetingRoomBodySchema = z.object(roomFields);

export const updateMeetingRoomBodySchema = z.object({
  ...roomFields,
  rowVersion: z.string().regex(/^0x[0-9A-Fa-f]{16}$/),
});

export type MeetingRoomParams = z.infer<typeof meetingRoomParamsSchema>;
export type CreateMeetingRoomBody = z.infer<typeof createMeetingRoomBodySchema>;
export type UpdateMeetingRoomBody = z.infer<typeof updateMeetingRoomBodySchema>;
