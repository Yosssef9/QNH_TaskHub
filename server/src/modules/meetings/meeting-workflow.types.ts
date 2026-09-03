import type { MeetingRoom } from "./meetings.types.js";

export type MeetingStatus = "PENDING_APPROVAL" | "SCHEDULED" | "REJECTED" | "CANCELLED";
export type MeetingRevisionType = "INITIAL" | "RESCHEDULE";
export type MeetingRevisionStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface MeetingParticipant {
  userId: number;
  userCode: string;
  userName: string;
}

export interface MeetingParticipantList {
  items: MeetingParticipant[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MeetingSummary {
  id: number;
  title: string;
  description: string | null;
  status: MeetingStatus;
  organizer: MeetingParticipant;
  room: MeetingRoom;
  startAtUtc: string;
  endAtUtc: string;
  schedulingNotes: string | null;
  participantCount: number;
  attendees: MeetingParticipant[];
  hasPendingReschedule: boolean;
  revisionId: number;
  revisionCreatedAtUtc?: string;
  meetingRowVersion: string;
  revisionRowVersion: string;
}

export interface MeetingAgendaItemInput {
  topic: string;
  presenterUserId?: number | null;
  plannedDurationMinutes?: number | null;
}

export interface CreateMeetingInput {
  title: string;
  description?: string | null;
  roomId: number;
  startAtUtc: string;
  endAtUtc: string;
  attendeeUserIds: number[];
  agendaItems: MeetingAgendaItemInput[];
}

export interface UpdatePendingMeetingScheduleInput {
  revisionId: number;
  revisionRowVersion: string;
  roomId: number;
  startAtUtc: string;
  endAtUtc: string;
  schedulingNotes?: string | null;
}

export interface DecideMeetingRequestInput {
  revisionId: number;
  revisionRowVersion: string;
}

export interface RejectMeetingRequestInput extends DecideMeetingRequestInput {
  reason?: string | null;
}

export interface MeetingScheduleFullEntry {
  visibility: "FULL";
  meetingId: number;
  title: string;
  organizer: MeetingParticipant;
  room: Pick<MeetingRoom, "id" | "code" | "nameAr" | "nameEn" | "locationText" | "colorKey">;
  startAtUtc: string;
  endAtUtc: string;
  participantCount: number;
  agendaTopicCount: number;
  agendaPlannedMinutes: number;
  hasPendingReschedule: boolean;
}

export interface MeetingSchedulePreviewEntry {
  visibility: "PREVIEW";
  meetingId: null;
  title: string;
  organizer: MeetingParticipant;
  room: Pick<MeetingRoom, "id" | "code" | "nameAr" | "nameEn" | "locationText" | "colorKey">;
  startAtUtc: string;
  endAtUtc: string;
}

export interface MeetingScheduleBusyEntry {
  visibility: "BUSY";
  meetingId: null;
  title: null;
  organizer: MeetingParticipant;
  room: Pick<MeetingRoom, "id" | "code" | "nameAr" | "nameEn" | "locationText" | "colorKey">;
  startAtUtc: string;
  endAtUtc: string;
}

export type MeetingScheduleEntry =
  | MeetingScheduleFullEntry
  | MeetingSchedulePreviewEntry
  | MeetingScheduleBusyEntry;


