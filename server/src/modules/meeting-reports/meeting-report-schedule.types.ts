import type { TaskHubAccess } from "../auth/auth.types.js";

export type ReportMeetingStatus = "PENDING_APPROVAL" | "SCHEDULED" | "REJECTED" | "CANCELLED";
export type ReportScheduleState = "WAITING" | "DUE" | "AWAITING_APPROVAL" | "REJECTED" | "CANCELLED" | "INVALID_SCHEDULE" | "BEFORE_ACTIVATION";
export type ReportDeliveryState = "NOT_QUEUED" | "QUEUED" | "PROCESSING" | "RETRYING" | "SENT" | "PARTIAL" | "FAILED" | "SKIPPED" | "REVIEW_REQUIRED";

/** Internal outbox evidence. Never return identities, addresses, payloads or raw errors to the client. */
export interface ReportRecipientEvidence {
  userId: number;
  outboxStatus: string | null;
  revisionId: number | null;
  scheduledEndAtUtc: string | null;
  attemptCount: number;
  sentAtUtc: string | null;
  nextAttemptAtUtc: string | null;
}

export interface ReportScheduleSnapshot {
  meetingId: number;
  meetingStatus: ReportMeetingStatus;
  meetingRowVersion: string;
  approvedRevisionId: number | null;
  approvedStartAtUtc: string | null;
  approvedEndAtUtc: string | null;
  hasPendingReschedule: boolean;
  observedAtUtc: string;
  recipients: ReportRecipientEvidence[];
}

export interface ReportDeliverySummary {
  state: ReportDeliveryState;
  totalRecipients: number;
  sent: number;
  queued: number;
  processing: number;
  retrying: number;
  failed: number;
  skipped: number;
  notQueued: number;
  needsReview: number;
  lastSentAtUtc: string | null;
  nextAttemptAtUtc: string | null;
}

export interface ReportAutomationRuntime {
  automaticDeliveryEnabled: boolean;
  automaticDeliveryReason: "ENABLED" | "DISABLED" | "EMAIL_DISABLED" | "MIGRATION_REQUIRED";
  activatedAtUtc: string | null;
  lastAutomaticScanAtUtc: string | null;
}

export interface MeetingReportSchedule {
  meetingId: number;
  meetingStatus: ReportMeetingStatus;
  approvedRevisionId: number | null;
  approvedStartAtUtc: string | null;
  approvedEndAtUtc: string | null;
  reportDueAtUtc: string | null;
  graceMinutes: number;
  scheduleState: ReportScheduleState;
  hasPendingReschedule: boolean;
  checkedAtUtc: string;
  timeZone: string;
  automaticDeliveryEnabled: boolean;
  automaticDeliveryReason?: ReportAutomationRuntime["automaticDeliveryReason"];
  activatedAtUtc?: string | null;
  lastAutomaticScanAtUtc?: string | null;
  delivery: ReportDeliverySummary;
}

export interface MeetingReportScheduleSources {
  runtime?(): Promise<ReportAutomationRuntime>;
  authorize(actorUserId: number, access: TaskHubAccess, meetingId: number): Promise<{
    context: { status: ReportMeetingStatus; currentRevisionId: number | null; meetingRowVersion: string };
  }>;
  snapshot(meetingId: number): Promise<ReportScheduleSnapshot | null>;
}

