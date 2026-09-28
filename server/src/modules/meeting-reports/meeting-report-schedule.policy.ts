import type {
  MeetingReportSchedule, ReportDeliverySummary, ReportScheduleSnapshot, ReportScheduleState, ReportAutomationRuntime,
} from "./meeting-report-schedule.types.js";

export const MEETING_REPORT_GRACE_MINUTES = 30;
export const MEETING_REPORT_EMAIL_TEMPLATE = "MEETING_REPORT_AVAILABLE";

export function meetingReportDedupeKey(meetingId: number, recipientUserId: number): string {
  if (!Number.isSafeInteger(meetingId) || meetingId <= 0 || !Number.isSafeInteger(recipientUserId) || recipientUserId <= 0) {
    throw new RangeError("Meeting and recipient IDs must be positive safe integers.");
  }
  return `MEETING_REPORT:${meetingId}:${recipientUserId}`;
}

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** UTC scheduling only; proposed/pending revisions never replace the approved schedule. */
export function projectMeetingReportSchedule(
  snapshot: ReportScheduleSnapshot,
  options: { automaticDeliveryEnabled: boolean; timeZone: string } & Partial<ReportAutomationRuntime>,
): MeetingReportSchedule {
  const now = timestamp(snapshot.observedAtUtc);
  if (now === null) throw new Error("Invalid report status observation time.");
  const start = timestamp(snapshot.approvedStartAtUtc);
  const end = timestamp(snapshot.approvedEndAtUtc);
  const validSchedule = snapshot.approvedRevisionId !== null && start !== null && end !== null && end > start;
  const due = validSchedule ? end! + MEETING_REPORT_GRACE_MINUTES * 60_000 : null;
  const safeDue = due !== null && Number.isFinite(new Date(due).getTime()) ? due : null;
  const scheduleState: ReportScheduleState = snapshot.meetingStatus === "PENDING_APPROVAL"
    ? "AWAITING_APPROVAL"
    : snapshot.meetingStatus === "CANCELLED" ? "CANCELLED"
    : snapshot.meetingStatus === "REJECTED" ? "REJECTED"
    : safeDue === null ? "INVALID_SCHEDULE"
    : options.activatedAtUtc && end! < Date.parse(options.activatedAtUtc) ? "BEFORE_ACTIVATION"
    : now >= safeDue ? "DUE" : "WAITING";

  const delivery: ReportDeliverySummary = {
    state: "NOT_QUEUED", totalRecipients: 0, sent: 0, queued: 0, processing: 0,
    retrying: 0, failed: 0, skipped: 0, notQueued: 0, needsReview: 0,
    lastSentAtUtc: null, nextAttemptAtUtc: null,
  };
  // Organizer + attendee union must not count the attending Organizer twice.
  const recipients = new Map(snapshot.recipients.map((row) => [row.userId, row]));
  delivery.totalRecipients = recipients.size;
  let lastSent: number | null = null;
  let nextAttempt: number | null = null;
  for (const row of recipients.values()) {
    if (row.outboxStatus === null) { delivery.notQueued += 1; continue; }
    // Do not report an old revision's email as this schedule's delivery, or
    // silently promise a resend. Phase 5 must reconcile stale dedupe records.
    if (!validSchedule || row.revisionId !== snapshot.approvedRevisionId || timestamp(row.scheduledEndAtUtc) !== end) {
      delivery.needsReview += 1; continue;
    }
    switch (row.outboxStatus) {
      case "SENT": {
        const sentAt = timestamp(row.sentAtUtc);
        if (sentAt === null || sentAt > now || safeDue === null || sentAt < safeDue) {
          delivery.needsReview += 1; break;
        }
        delivery.sent += 1;
        lastSent = Math.max(lastSent ?? sentAt, sentAt);
        break;
      }
      case "PENDING": {
        if (row.attemptCount > 0) delivery.retrying += 1;
        else delivery.queued += 1;
        const candidate = timestamp(row.nextAttemptAtUtc);
        if (candidate !== null) nextAttempt = Math.min(nextAttempt ?? candidate, candidate);
        break;
      }
      case "PROCESSING": delivery.processing += 1; break;
      case "FAILED": delivery.failed += 1; break;
      case "CANCELED": delivery.skipped += 1; break;
      default: delivery.needsReview += 1;
    }
  }
  delivery.lastSentAtUtc = lastSent === null ? null : new Date(lastSent).toISOString();
  delivery.nextAttemptAtUtc = nextAttempt === null ? null : new Date(nextAttempt).toISOString();
  if (delivery.needsReview) delivery.state = "REVIEW_REQUIRED";
  else if (delivery.processing) delivery.state = "PROCESSING";
  else if (delivery.retrying) delivery.state = "RETRYING";
  else if (delivery.queued) delivery.state = "QUEUED";
  else if (delivery.sent > 0 && delivery.sent === delivery.totalRecipients) delivery.state = "SENT";
  else if (delivery.sent > 0) delivery.state = "PARTIAL";
  else if (delivery.failed > 0) delivery.state = "FAILED";
  else if (delivery.skipped > 0 && delivery.skipped === delivery.totalRecipients) delivery.state = "SKIPPED";
  // Skipped plus unqueued recipients is not a completed batch.
  else if (delivery.skipped > 0) delivery.state = "PARTIAL";

  return {
    meetingId: snapshot.meetingId, meetingStatus: snapshot.meetingStatus,
    approvedRevisionId: snapshot.approvedRevisionId,
    approvedStartAtUtc: validSchedule ? snapshot.approvedStartAtUtc : null,
    approvedEndAtUtc: validSchedule ? snapshot.approvedEndAtUtc : null,
    reportDueAtUtc: scheduleState === "WAITING" || scheduleState === "DUE" ? new Date(safeDue!).toISOString() : null,
    graceMinutes: MEETING_REPORT_GRACE_MINUTES, scheduleState,
    hasPendingReschedule: snapshot.hasPendingReschedule,
    checkedAtUtc: new Date(now).toISOString(), timeZone: options.timeZone,
    automaticDeliveryEnabled: options.automaticDeliveryEnabled,
    automaticDeliveryReason: options.automaticDeliveryReason ?? (options.automaticDeliveryEnabled ? "ENABLED" : "DISABLED"),
    activatedAtUtc: options.activatedAtUtc ?? null, lastAutomaticScanAtUtc: options.lastAutomaticScanAtUtc ?? null,
    delivery,
  };
}

