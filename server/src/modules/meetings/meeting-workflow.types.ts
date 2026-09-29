import type { MeetingMode, MeetingRoom } from "./meetings.types.js";

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
  meetingMode: MeetingMode;
  room: MeetingRoom | null;
  onlineJoinUrl: string | null;
  cancelledAtUtc?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: MeetingParticipant | null;
  startAtUtc: string;
  endAtUtc: string;
  schedulingNotes: string | null;
  participantCount: number;
  organizerAttending: boolean;
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
  meetingMode: MeetingMode;
  roomId: number | null;
  onlineJoinUrl: string | null;
  cancelledAtUtc?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: MeetingParticipant | null;
  startAtUtc: string;
  endAtUtc: string;
  organizerAttending: boolean;
  attendeeUserIds: number[];
  agendaItems: MeetingAgendaItemInput[];
  followUpOfMeetingId?: number | null;
}

export interface UpdatePendingMeetingScheduleInput {
  revisionId: number;
  revisionRowVersion: string;
  meetingMode: MeetingMode;
  roomId: number | null;
  onlineJoinUrl: string | null;
  cancelledAtUtc?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: MeetingParticipant | null;
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

interface MeetingScheduleSharedEntry {
  organizer: MeetingParticipant;
  meetingMode: MeetingMode;
  room: Pick<MeetingRoom, "id" | "code" | "nameAr" | "nameEn" | "locationText" | "colorKey"> | null;
  startAtUtc: string;
  endAtUtc: string;
}

export interface MeetingScheduleFullEntry extends MeetingScheduleSharedEntry {
  visibility: "FULL";
  meetingId: number;
  title: string;
  onlineJoinUrl: string | null;
  participantCount: number;
  agendaTopicCount: number;
  agendaPlannedMinutes: number;
  hasPendingReschedule: boolean;
}

export interface MeetingSchedulePreviewEntry extends MeetingScheduleSharedEntry {
  visibility: "PREVIEW";
  meetingId: null;
  title: string;
}

export interface MeetingScheduleBusyEntry extends MeetingScheduleSharedEntry {
  visibility: "BUSY";
  meetingId: null;
  title: null;
}

export type MeetingScheduleEntry =
  | MeetingScheduleFullEntry
  | MeetingSchedulePreviewEntry
  | MeetingScheduleBusyEntry;
