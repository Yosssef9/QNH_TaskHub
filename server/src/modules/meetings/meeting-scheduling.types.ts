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
