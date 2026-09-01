export const MEETING_PERMISSION_CODES = [
  "MEETING_ORGANIZE",
  "MEETING_COORDINATE",
] as const;

export type MeetingPermissionCode = (typeof MEETING_PERMISSION_CODES)[number];

export interface MeetingRoom {
  id: number;
  code: string | null;
  nameAr: string;
  nameEn: string;
  locationText: string | null;
  capacity: number;
  equipmentNotes: string | null;
  isActive: boolean;
  rowVersion: string;
}

export interface SaveMeetingRoomInput {
  code?: string | null;
  nameAr: string;
  nameEn: string;
  locationText?: string | null;
  capacity: number;
  equipmentNotes?: string | null;
  isActive: boolean;
}

export interface UpdateMeetingRoomInput extends SaveMeetingRoomInput {
  rowVersion: string;
}
