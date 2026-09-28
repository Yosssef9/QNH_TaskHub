import type { DatabaseTransaction } from "../../database/types.js";

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

export interface MeetingParticipantConflictWindow {
  startAtUtc: string;
  endAtUtc: string;
}

export interface MeetingParticipantScheduleConflict {
  participant: {
    userId: number;
    userCode: string;
    userName: string;
  };
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
  overlaps: MeetingParticipantConflictWindow[];
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
  roomId: number;
  startAtUtc: Date;
  endAtUtc: Date;
  participantCount: number;
}

export type SchedulingTransaction = DatabaseTransaction;
