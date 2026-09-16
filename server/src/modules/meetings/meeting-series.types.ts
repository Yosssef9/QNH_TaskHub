import type { MeetingAgendaItemInput, MeetingParticipant } from "./meeting-workflow.types.js";
import type { MeetingSeriesPreviewBody } from "./meeting-series.schemas.js";

export const MEETING_SERIES_TIME_ZONE = "Asia/Riyadh" as const;
export const MEETING_SERIES_MAX_OCCURRENCES = 100;
export const MEETING_SERIES_MAX_RANGE_MONTHS = 12;

export const MEETING_SERIES_WEEKDAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

export type MeetingSeriesWeekday = (typeof MEETING_SERIES_WEEKDAYS)[number];
export type MeetingSeriesCreationMode = "PATTERN" | "CUSTOM";
export type MeetingSeriesOccurrenceSource = "PATTERN" | "CUSTOM" | "ADDED";
export type MeetingSeriesOverrideKind =
  | "DATE"
  | "TIME"
  | "ROOM"
  | "TITLE"
  | "DESCRIPTION"
  | "ATTENDEES"
  | "ORGANIZER_ATTENDANCE"
  | "AGENDA"
  | "ATTACHMENTS";

export interface MeetingSeriesResolvedOccurrence {
  occurrenceKey: string;
  sequenceNumber: number;
  sourceType: MeetingSeriesOccurrenceSource;
  originalDate: string | null;
  originalStartTime: string | null;
  originalEndTime: string | null;
  originalStartAtUtc: string | null;
  originalEndAtUtc: string | null;
  date: string;
  startTime: string;
  endTime: string;
  startAtUtc: string;
  endAtUtc: string;
  roomId: number;
  title: string;
  description: string | null;
  organizerAttending: boolean;
  attendeeUserIds: number[];
  agendaItems: MeetingAgendaItemInput[];
  overrideKinds: MeetingSeriesOverrideKind[];
  isCustomized: boolean;
}

export interface MeetingSeriesInternalConflict {
  roomId: number;
  firstOccurrenceKey: string;
  secondOccurrenceKey: string;
}

export interface MeetingSeriesValidationIssue {
  code: string;
  message: string;
  details?: unknown;
}

export interface MeetingSeriesPreviewOccurrence extends MeetingSeriesResolvedOccurrence {
  participantCount: number;
  roomCapacity: number | null;
  validation: {
    isValid: boolean;
    issues: MeetingSeriesValidationIssue[];
  };
}

export interface MeetingSeriesPreview {
  creationMode: MeetingSeriesCreationMode;
  timeZone: typeof MEETING_SERIES_TIME_ZONE;
  occurrenceCount: number;
  customizedCount: number;
  canCreate: boolean;
  occurrences: MeetingSeriesPreviewOccurrence[];
}

export interface MeetingSeriesIdentity {
  seriesId: number;
  creationRequestId: string;
  rowVersion: string;
}

export interface MeetingSeriesExistingIdentity extends MeetingSeriesIdentity {
  createdByUserId: number;
  requestFingerprint: string;
}

export interface MeetingSeriesCreateResult {
  seriesId: number;
  creationRequestId: string;
  meetingIds: number[];
  replayed: boolean;
}

export interface MeetingSeriesAttachmentUploadResult {
  seriesId: number;
  attachmentRequestId: string;
  scope: "COMMON" | "OCCURRENCE";
  occurrenceKey: string | null;
  associatedMeetingCount: number;
  replayed: boolean;
}

export type MeetingSeriesDerivedState = "UPCOMING" | "COMPLETED" | "ALL_CANCELLED";

export interface MeetingSeriesNextMeetingSummary {
  meetingId: number;
  title: string;
  status: "PENDING_APPROVAL" | "SCHEDULED" | "REJECTED" | "CANCELLED";
  startAtUtc: string;
  endAtUtc: string;
  roomId: number;
  roomNameAr: string;
  roomNameEn: string;
}

export interface MeetingSeriesListItem {
  seriesId: number;
  creationMode: MeetingSeriesCreationMode;
  title: string;
  createdAtUtc: string;
  originalStartAtUtc: string;
  originalEndAtUtc: string;
  meetingCount: number;
  upcomingCount: number;
  cancelledCount: number;
  customizedCount: number;
  state: MeetingSeriesDerivedState;
  nextMeeting: MeetingSeriesNextMeetingSummary | null;
}

export interface MeetingSeriesListResult {
  items: MeetingSeriesListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MeetingSeriesMemberSummary {
  meetingId: number;
  sequenceNumber: number;
  occurrenceKey: string;
  sourceType: MeetingSeriesOccurrenceSource;
  title: string;
  description: string | null;
  status: "PENDING_APPROVAL" | "SCHEDULED" | "REJECTED" | "CANCELLED";
  currentStartAtUtc: string | null;
  currentEndAtUtc: string | null;
  currentRoomId: number | null;
  currentRoomNameAr: string | null;
  currentRoomNameEn: string | null;
  originalStartAtUtc: string | null;
  originalEndAtUtc: string | null;
  initialStartAtUtc: string;
  initialEndAtUtc: string;
  initialRoomId: number;
  initialRoomNameAr: string;
  initialRoomNameEn: string;
  customizationJson: string | null;
  wasCustomizedAtCreation: boolean;
}

export interface MeetingSeriesDetail {
  seriesId: number;
  createdByUserId: number;
  creationMode: MeetingSeriesCreationMode;
  timeZone: typeof MEETING_SERIES_TIME_ZONE;
  createdAtUtc: string;
  rowVersion: string;
  defaults: MeetingSeriesPreviewBody["defaults"];
  schedule: MeetingSeriesPreviewBody["schedule"];
  exceptions: MeetingSeriesPreviewBody["exceptions"];
  defaultAttendees: MeetingParticipant[];
  meetingCount: number;
  upcomingCount: number;
  cancelledCount: number;
  customizedCount: number;
  state: MeetingSeriesDerivedState;
  members: MeetingSeriesMemberSummary[];
}

export interface MeetingSeriesMembershipLink {
  seriesId: number;
  seriesTitle: string;
  sequenceNumber: number;
  meetingCount: number;
}


