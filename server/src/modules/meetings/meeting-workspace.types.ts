import type { MeetingMode, MeetingRoom } from "./meetings.types.js";
import type { MeetingParticipant, MeetingSummary } from "./meeting-workflow.types.js";

export interface MeetingRevisionDetail {
  id: number;
  revisionNumber: number;
  revisionType: "INITIAL" | "RESCHEDULE";
  revisionStatus: "PENDING" | "APPROVED" | "REJECTED";
  meetingMode: MeetingMode;
  room: MeetingRoom | null;
  onlineJoinUrl: string | null;
  startAtUtc: string;
  endAtUtc: string;
  schedulingNotes: string | null;
  requestedBy: MeetingParticipant;
  approvedBy: MeetingParticipant | null;
  rejectedBy: MeetingParticipant | null;
  createdAtUtc: string;
  decidedAtUtc: string | null;
  rowVersion: string;
}

export interface MeetingAgendaItem {
  id: number;
  topic: string;
  presenter: MeetingParticipant | null;
  plannedDurationMinutes: number | null;
  sortOrder: number;
  rowVersion: string;
}

export interface MeetingAgendaItemInput {
  id?: number | null | undefined;
  topic: string;
  presenterUserId: number | null;
  plannedDurationMinutes: number | null;
}

export interface UpdateMeetingAgendaInput {
  meetingRowVersion: string;
  agendaItems: MeetingAgendaItemInput[];
}

export type MeetingAttendanceStatus = "NOT_MARKED" | "ATTENDED" | "ABSENT";
export type MeetingAttendanceRole = "ORGANIZER" | "ATTENDEE";

export interface MeetingAttendanceParticipant {
  participant: MeetingParticipant;
  role: MeetingAttendanceRole;
  status: MeetingAttendanceStatus;
  markedBy: MeetingParticipant | null;
  markedAtUtc: string | null;
}

export interface UpdateMeetingAttendanceInput {
  participantUserId: number;
  status: MeetingAttendanceStatus;
}

export interface BulkUpdateMeetingAttendanceInput {
  status: Extract<MeetingAttendanceStatus, "NOT_MARKED" | "ATTENDED">;
}

export interface MeetingActivityItem {
  id: number;
  activityType: string;
  actor: MeetingParticipant;
  changes: Record<string, unknown> | null;
  createdAtUtc: string;
}

export interface MeetingDetailPermissions {
  canCancel: boolean;
  canReschedule: boolean;
  canEditPendingSchedule: boolean;
  canEditPendingReschedule: boolean;
  canCancelPendingReschedule: boolean;
  canDecidePendingRequest: boolean;
  canCoordinatorReschedule: boolean;
  canDecidePendingReschedule: boolean;
  canManageAgenda: boolean;
  canManageAttachments: boolean;
  canSaveAsTemplate: boolean;
  canManageAttendance: boolean;
}

export interface MeetingDetail {
  meeting: MeetingSummary;
  agendaItems: MeetingAgendaItem[];
  revisions: MeetingRevisionDetail[];
  activity: MeetingActivityItem[];
  attendance: MeetingAttendanceParticipant[];
  pendingReschedule: MeetingRevisionDetail | null;
  permissions: MeetingDetailPermissions;
}

export interface CreateMeetingRescheduleInput {
  meetingRowVersion: string;
  meetingMode: MeetingMode;
  roomId: number | null;
  onlineJoinUrl: string | null;
  startAtUtc: string;
  endAtUtc: string;
}

export interface UpdateMeetingRescheduleInput {
  revisionId: number;
  revisionRowVersion: string;
  meetingMode: MeetingMode;
  roomId: number | null;
  onlineJoinUrl: string | null;
  startAtUtc: string;
  endAtUtc: string;
  schedulingNotes?: string | null;
}

export interface UpdateOrganizerRescheduleInput {
  revisionId: number;
  revisionRowVersion: string;
  meetingMode: MeetingMode;
  roomId: number | null;
  onlineJoinUrl: string | null;
  startAtUtc: string;
  endAtUtc: string;
}

export interface CoordinatorDirectRescheduleInput {
  meetingRowVersion: string;
  meetingMode: MeetingMode;
  roomId: number | null;
  onlineJoinUrl: string | null;
  startAtUtc: string;
  endAtUtc: string;
  schedulingNotes?: string | null;
}

export interface DecideMeetingRescheduleInput {
  revisionId: number;
  revisionRowVersion: string;
}

export interface RejectMeetingRescheduleInput extends DecideMeetingRescheduleInput {
  reason?: string | null;
}

export interface CancelMeetingRescheduleRequestInput extends DecideMeetingRescheduleInput {
  reason?: string | null;
}

export interface CancelMeetingInput {
  meetingRowVersion: string;
  reason: string;
}

export interface MeetingRescheduleQueueItem {
  meeting: MeetingSummary;
  requestedRevision: MeetingRevisionDetail;
}

export interface MeetingAttachment {
  id: string;
  meetingId: number;
  originalFileName: string;
  mimeType: string;
  fileExtension: string;
  sizeBytes: number;
  uploadedBy: MeetingParticipant;
  createdAtUtc: string;
}

export interface MeetingTemplate {
  id: number;
  name: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  meetingMode: MeetingMode;
  defaultRoom: MeetingRoom | null;
  organizerAttending: boolean;
  attendees: MeetingParticipant[];
  rowVersion: string;
}

export interface SaveMeetingTemplateInput {
  name: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  meetingMode: MeetingMode;
  defaultRoomId?: number | null;
  organizerAttending: boolean;
  attendeeUserIds: number[];
}

export interface UpdateMeetingTemplateInput extends SaveMeetingTemplateInput {
  rowVersion: string;
}


