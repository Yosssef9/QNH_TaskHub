import type { MeetingRoom } from "./meetings.types.js";
import type { MeetingParticipant, MeetingSummary } from "./meeting-workflow.types.js";

export interface MeetingRevisionDetail {
  id: number;
  revisionNumber: number;
  revisionType: "INITIAL" | "RESCHEDULE";
  revisionStatus: "PENDING" | "APPROVED" | "REJECTED";
  room: MeetingRoom;
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
  canManageAttachments: boolean;
  canSaveAsTemplate: boolean;
}

export interface MeetingDetail {
  meeting: MeetingSummary;
  revisions: MeetingRevisionDetail[];
  activity: MeetingActivityItem[];
  pendingReschedule: MeetingRevisionDetail | null;
  permissions: MeetingDetailPermissions;
}

export interface CreateMeetingRescheduleInput {
  meetingRowVersion: string;
  roomId: number;
  startAtUtc: string;
  endAtUtc: string;
}

export interface UpdateMeetingRescheduleInput {
  revisionId: number;
  revisionRowVersion: string;
  roomId: number;
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

export interface CancelMeetingInput {
  meetingRowVersion: string;
  reason?: string | null;
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
  defaultRoom: MeetingRoom | null;
  attendees: MeetingParticipant[];
  rowVersion: string;
}

export interface SaveMeetingTemplateInput {
  name: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  defaultRoomId?: number | null;
  attendeeUserIds: number[];
}

export interface UpdateMeetingTemplateInput extends SaveMeetingTemplateInput {
  rowVersion: string;
}
