export const MEETING_PERMISSION_CODES = [
  "MEETING_ORGANIZE_ROOM",
  "MEETING_ORGANIZE_ZOOM",
  "MEETING_COORDINATE",
] as const;

export type MeetingPersistedPermissionCode = (typeof MEETING_PERMISSION_CODES)[number];
export type MeetingPermissionCode = MeetingPersistedPermissionCode | "MEETING_ORGANIZE";

export const MEETING_MODES = ["ROOM", "ZOOM"] as const;
export type MeetingMode = (typeof MEETING_MODES)[number];

export const MEETING_ROOM_COLOR_KEYS = [
  "BLUE",
  "PURPLE",
  "GREEN",
  "ORANGE",
  "RED",
  "GOLD",
  "SLATE",
  "PINK",
] as const;

export type MeetingRoomColorKey = (typeof MEETING_ROOM_COLOR_KEYS)[number];

export interface MeetingRoom {
  id: number;
  code: string | null;
  nameAr: string;
  nameEn: string;
  locationText: string | null;
  colorKey: MeetingRoomColorKey;
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
  colorKey?: MeetingRoomColorKey | null;
  capacity: number;
  equipmentNotes?: string | null;
  isActive: boolean;
}

export interface UpdateMeetingRoomInput extends SaveMeetingRoomInput {
  rowVersion: string;
}
