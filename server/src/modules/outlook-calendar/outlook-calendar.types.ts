export const OUTLOOK_SYNC_STATUSES = ["NOT_SYNCED","SYNCING","IN_SYNC","SYNCED_WITH_WARNINGS","OUTLOOK_CHANGED","OUTLOOK_DELETED","SYNC_FAILED"] as const;
export type OutlookSyncStatus = (typeof OUTLOOK_SYNC_STATUSES)[number];
export const OUTLOOK_SYNC_OPERATIONS = ["CREATE","UPDATE","CANCEL","RESTORE","RECREATE"] as const;
export type OutlookSyncOperation = (typeof OUTLOOK_SYNC_OPERATIONS)[number];
export const OUTLOOK_SYNC_JOB_STATUSES = ["PENDING","PROCESSING","SUCCEEDED","FAILED","CANCELED"] as const;
export type OutlookSyncJobStatus = (typeof OUTLOOK_SYNC_JOB_STATUSES)[number];
export const OUTLOOK_SYNC_TRIGGER_TYPES = ["LIFECYCLE","MANUAL","RECOVERY"] as const;
export type OutlookSyncTriggerType = (typeof OUTLOOK_SYNC_TRIGGER_TYPES)[number];

export type OutlookSyncDifferenceField =
  | "SUBJECT"
  | "START"
  | "END"
  | "LOCATION"
  | "ATTENDEES"
  | "TASKHUB_LINK"
  | "ZOOM_URL"
  | "DESCRIPTION";

export interface OutlookSyncDifference {
  field: OutlookSyncDifferenceField;
  taskHubValue: string;
  outlookValue: string;
}

export interface OutlookObservedEventProjection {
  subject: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  location: string;
  attendeeEmails: string[];
  taskHubLinkPresent: boolean;
  zoomLinkPresent: boolean;
  descriptionPresent: boolean;
}

export interface OutlookCalendarRuntimeState { enabled: boolean; authMode: "DISABLED" | "CLIENT_SECRET"; workerIntervalMs: number; pollIntervalMinutes: number; graphRequestTimeoutMs: number; maxAttempts: number; processingTimeoutMinutes: number; }
export interface OutlookCalendarFoundationState { installed: boolean; databaseEnabled: boolean; activatedAtUtc: string | null; lastWorkerAtUtc: string | null; lastPollAtUtc: string | null; }
export interface OutlookSyncJobRecord { id: number; meetingId: number; operation: OutlookSyncOperation; targetRevisionId: number | null; attemptCount: number; }
export interface OutlookMeetingAttendeeProjection { userId: number; userName: string; email: string | null; }
export interface OutlookMeetingProjection {
  meetingId: number; title: string; description: string | null; status: "SCHEDULED" | "CANCELLED" | "PENDING_APPROVAL" | "REJECTED";
  organizerUserId: number; organizerName: string; organizerEmail: string | null; revisionId: number; meetingMode: "ROOM" | "ZOOM";
  roomNameAr: string | null; roomNameEn: string | null; roomLocationText: string | null; onlineJoinUrl: string | null;
  startAtUtc: string; endAtUtc: string; attendees: OutlookMeetingAttendeeProjection[];
}
export interface OutlookSyncStatusView {
  meetingId: number; organizerUserId: number; organizerEmail: string | null; organizerUserPrincipalName: string | null; status: OutlookSyncStatus;
  graphWebLink: string | null; desiredRevisionId: number | null; syncedRevisionId: number | null; missingEmailParticipantCount: number;
  lastSyncedAtUtc: string | null; lastCheckedAtUtc: string | null; lastErrorCode: string | null; lastErrorMessage: string | null;
  differences: OutlookSyncDifference[];
}
