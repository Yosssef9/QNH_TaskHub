import type { DatabaseTransaction } from "../../database/types.js";
import type { MeetingMode, MeetingRoomColorKey } from "./meetings.types.js";

export interface MeetingAvailabilityInput {
  roomId: number;
  startAtUtc: string;
  endAtUtc: string;
  participantCount: number;
}

export interface MeetingAvailability {
  roomId: number;
  startAtUtc: string;
  endAtUtc: string;
  participantCount: number;
  roomCapacity: number;
  isRoomActive: boolean;
  hasCapacity: boolean;
  isAvailable: boolean;
  canSchedule: boolean;
}

export interface MeetingParticipantConflictInput {
  startAtUtc: string;
  endAtUtc: string;
  participantUserIds: number[];
  excludeMeetingId?: number | null;
}

export interface MeetingParticipantConflictMeetingDetail {
  visibility: "FULL" | "PREVIEW";
  meetingId: number | null;
  title: string;
  meetingMode: MeetingMode;
  organizer: { userId: number; userCode: string; userName: string };
  room: {
    id: number;
    code: string | null;
    nameAr: string;
    nameEn: string;
    locationText: string | null;
    colorKey: MeetingRoomColorKey;
  } | null;
}

export interface MeetingParticipantConflictTimeWindow {
  startAtUtc: string;
  endAtUtc: string;
}

export interface MeetingParticipantConflictWindow extends MeetingParticipantConflictTimeWindow {
  meeting?: MeetingParticipantConflictMeetingDetail | null;
}

export interface MeetingParticipantAvailabilityViewer {
  userId: number;
  canCoordinateMeetings: boolean;
  canPreviewRoomMeetings: boolean;
}

export interface MeetingParticipantScheduleConflict {
  participant: { userId: number; userCode: string; userName: string };
  conflictCount: number;
  overlaps: MeetingParticipantConflictWindow[];
}

export interface MeetingParticipantAvailability {
  startAtUtc: string;
  endAtUtc: string;
  participantCount: number;
  conflictParticipantCount: number;
  conflicts: MeetingParticipantScheduleConflict[];
}

export interface MeetingParticipantConflictMeetingWindow {
  meetingId: number;
  startAtUtc: string;
  endAtUtc: string;
}

export interface MeetingParticipantConflictMeetingResult {
  meetingId: number;
  conflictCount: number;
  overlaps: MeetingParticipantConflictTimeWindow[];
}

export interface LockedScheduleInput {
  roomId: number;
  startAtUtc: Date;
  endAtUtc: Date;
  participantCount: number;
  excludeMeetingId?: number | null;
}

export interface ScheduledRevisionResult {
  meetingId: number;
  revisionId: number;
  meetingMode: MeetingMode;
  roomId: number | null;
  onlineJoinUrl: string | null;
  startAtUtc: Date;
  endAtUtc: Date;
  participantCount: number;
}

export type SchedulingTransaction = DatabaseTransaction;
