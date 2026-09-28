import type { ReportRecipientEvidence, ReportScheduleSnapshot } from "../../src/modules/meeting-reports/meeting-report-schedule.types.js";

export function reportRecipient(overrides: Partial<ReportRecipientEvidence> = {}): ReportRecipientEvidence {
  return {
    userId: 100, outboxStatus: null, revisionId: null, scheduledEndAtUtc: null,
    attemptCount: 0, sentAtUtc: null, nextAttemptAtUtc: null, ...overrides,
  };
}
export function reportSnapshot(overrides: Partial<ReportScheduleSnapshot> = {}): ReportScheduleSnapshot {
  return {
    meetingId: 127, meetingStatus: "SCHEDULED", meetingRowVersion: "0x0000000000000001",
    approvedRevisionId: 12, approvedStartAtUtc: "2026-09-27T06:00:00.000Z",
    approvedEndAtUtc: "2026-09-27T07:00:00.000Z", hasPendingReschedule: false,
    observedAtUtc: "2026-09-27T07:29:59.999Z", recipients: [reportRecipient(), reportRecipient({ userId: 200 })],
    ...overrides,
  };
}
export function recordedEmail(status: string, overrides: Partial<ReportRecipientEvidence> = {}): ReportRecipientEvidence {
  return reportRecipient({
    outboxStatus: status, revisionId: 12, scheduledEndAtUtc: "2026-09-27T07:00:00.000Z",
    attemptCount: status === "PENDING" ? 0 : 1,
    sentAtUtc: status === "SENT" ? "2026-09-27T07:31:00.000Z" : null,
    nextAttemptAtUtc: status === "PENDING" ? "2026-09-27T07:30:00.000Z" : null,
    ...overrides,
  });
}
