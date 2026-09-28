import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { AppError } from "../../src/shared/errors/app-error.js";
import {
  meetingReportDedupeKey, projectMeetingReportSchedule,
} from "../../src/modules/meeting-reports/meeting-report-schedule.policy.js";
import { createMeetingReportScheduleReader } from "../../src/modules/meeting-reports/meeting-report-schedule.reader.js";
import type { MeetingReportScheduleSources, ReportRecipientEvidence } from "../../src/modules/meeting-reports/meeting-report-schedule.types.js";
import { recordedEmail, reportRecipient, reportSnapshot } from "../fixtures/meeting-report-schedule.fixture.js";

const options = { automaticDeliveryEnabled: false, timeZone: "Asia/Riyadh" };
const access = { roleCode: "USER" as const, permissions: [] };
function delivery(rows: ReportRecipientEvidence[]) {
  return projectMeetingReportSchedule(reportSnapshot({ recipients: rows, observedAtUtc: "2026-09-27T08:00:00Z" }), options).delivery;
}

describe("Meeting report timing and truthful delivery projection", () => {
  it("shows enabled scheduling without inventing delivery evidence", () => {
    const result = projectMeetingReportSchedule(reportSnapshot(), { ...options, automaticDeliveryEnabled: true });
    assert.equal(result.automaticDeliveryEnabled, true);
    assert.equal(result.delivery.state, "NOT_QUEUED");
  });
  it("does not advertise automatic delivery for historical Meetings before activation", () => {
    const result = projectMeetingReportSchedule(reportSnapshot(), { ...options, automaticDeliveryEnabled: true, activatedAtUtc: "2026-09-27T07:01:00Z" });
    assert.equal(result.scheduleState, "BEFORE_ACTIVATION");
    assert.equal(result.reportDueAtUtc, null);
  });
  it("uses approved end + 30 minutes and never treats due time as sent", () => {
    const before = projectMeetingReportSchedule(reportSnapshot(), options);
    const at = projectMeetingReportSchedule(reportSnapshot({ observedAtUtc: "2026-09-27T07:30:00.000Z" }), options);
    assert.equal(before.reportDueAtUtc, "2026-09-27T07:30:00.000Z");
    assert.equal(before.scheduleState, "WAITING");
    assert.equal(at.scheduleState, "DUE");
    assert.equal(at.delivery.state, "NOT_QUEUED");
    assert.equal(at.delivery.lastSentAtUtc, null);
    assert.equal(at.automaticDeliveryEnabled, false);
  });
  for (const [status, expected] of [["PENDING_APPROVAL", "AWAITING_APPROVAL"], ["REJECTED", "REJECTED"], ["CANCELLED", "CANCELLED"]] as const) {
    it(`does not schedule automatic reports for ${status}`, () => {
      const result = projectMeetingReportSchedule(reportSnapshot({ meetingStatus: status }), options);
      assert.equal(result.scheduleState, expected);
      assert.equal(result.reportDueAtUtc, null);
    });
  }
  it("ignores pending proposals and recalculates when the approved revision changes", () => {
    const pending = projectMeetingReportSchedule(reportSnapshot({ hasPendingReschedule: true }), options);
    assert.equal(pending.reportDueAtUtc, "2026-09-27T07:30:00.000Z");
    const changed = projectMeetingReportSchedule(reportSnapshot({ approvedRevisionId: 13, approvedEndAtUtc: "2026-09-27T08:00:00Z" }), options);
    assert.equal(changed.reportDueAtUtc, "2026-09-27T08:30:00.000Z");
  });
  for (const bad of [null, "bad", "2026-09-27T05:00:00Z"]) {
    it(`fails safely for invalid approved end ${bad}`, () => {
      assert.equal(projectMeetingReportSchedule(reportSnapshot({ approvedEndAtUtc: bad }), options).scheduleState, "INVALID_SCHEDULE");
    });
  }
  it("requires an approved revision, not a proposed schedule", () => {
    assert.equal(projectMeetingReportSchedule(reportSnapshot({ approvedRevisionId: null }), options).reportDueAtUtc, null);
  });
  it("handles a UTC date boundary without using the browser's local timezone", () => {
    const result = projectMeetingReportSchedule(reportSnapshot({ approvedStartAtUtc: "2026-09-27T23:00:00Z", approvedEndAtUtc: "2026-09-27T23:45:00Z" }), options);
    assert.equal(result.reportDueAtUtc, "2026-09-28T00:15:00.000Z");
  });
  it("uses separate occurrence identities and stable recipient dedupe", () => {
    assert.notEqual(meetingReportDedupeKey(127, 100), meetingReportDedupeKey(128, 100));
    assert.equal(meetingReportDedupeKey(127, 100), "MEETING_REPORT:127:100");
    assert.throws(() => meetingReportDedupeKey(0, 100));
  });
  it("does not double-count an attending Organizer or claim success for zero recipients", () => {
    assert.equal(delivery([reportRecipient(), reportRecipient()]).totalRecipients, 1);
    assert.equal(delivery([]).state, "NOT_QUEUED");
  });
  for (const [status, expected] of [["PENDING", "QUEUED"], ["PROCESSING", "PROCESSING"], ["FAILED", "FAILED"], ["CANCELED", "SKIPPED"], ["SENT", "SENT"]] as const) {
    it(`projects real ${status} outbox evidence as ${expected}`, () => {
      assert.equal(delivery([recordedEmail(status)]).state, expected);
    });
  }
  it("recognizes PENDING with previous attempts as retrying", () => {
    const result = delivery([recordedEmail("PENDING", { attemptCount: 2, nextAttemptAtUtc: "2026-09-27T08:05:00Z" })]);
    assert.equal(result.state, "RETRYING");
    assert.equal(result.nextAttemptAtUtc, "2026-09-27T08:05:00.000Z");
  });
  for (const second of [recordedEmail("FAILED", { userId: 200 }), recordedEmail("CANCELED", { userId: 200 }), reportRecipient({ userId: 200 })]) {
    it(`does not call partial ${second.outboxStatus ?? "unqueued"} delivery all-sent`, () => {
      const result = delivery([recordedEmail("SENT"), second]);
      assert.equal(result.state, "PARTIAL");
      assert.equal(result.sent, 1);
      assert.equal(result.lastSentAtUtc, "2026-09-27T07:31:00.000Z");
    });
  }
  it("reports ongoing processing when some emails are already sent", () => {
    assert.equal(delivery([recordedEmail("SENT"), recordedEmail("PROCESSING", { userId: 200 })]).state, "PROCESSING");
  });
  for (const bad of [
    recordedEmail("SENT", { sentAtUtc: null }),
    recordedEmail("SENT", { sentAtUtc: "2026-09-28T08:00:00Z" }),
    recordedEmail("SENT", { sentAtUtc: "2026-09-27T07:29:00Z" }),
    recordedEmail("SENT", { revisionId: 11 }),
    recordedEmail("SENT", { scheduledEndAtUtc: "2026-09-26T07:00:00Z" }),
    recordedEmail("UNRECOGNIZED"),
  ]) {
    it(`does not accept stale or malformed send evidence ${JSON.stringify(bad)}`, () => {
      const result = delivery([bad]);
      assert.equal(result.state, "REVIEW_REQUIRED");
      assert.equal(result.sent, 0);
      assert.equal(result.lastSentAtUtc, null);
    });
  }
  it("returns aggregates only, not recipient identities or SMTP internals", () => {
    const result = projectMeetingReportSchedule(reportSnapshot(), options);
    assert.equal('recipients' in result, false);
    assert.equal('userId' in result.delivery, false);
    assert.equal('lastError' in result.delivery, false);
  });
});

describe("Meeting report status authorization", () => {
  function arrange() {
    const snap = reportSnapshot();
    const calls: string[] = [];
    const sources: MeetingReportScheduleSources = {
      authorize: async () => { calls.push("authorize"); return { context: { status: snap.meetingStatus, currentRevisionId: snap.approvedRevisionId, meetingRowVersion: snap.meetingRowVersion } }; },
      snapshot: async () => { calls.push("snapshot"); return snap; },
    };
    return { sources, calls, read: () => createMeetingReportScheduleReader(sources, options)(100, access, 127) };
  }
  it("authorizes before any read and after the snapshot", async () => {
    const test = arrange(); await test.read();
    assert.deepEqual(test.calls, ["authorize", "snapshot", "authorize"]);
  });
  it("does not read or change anything after access denial", async () => {
    const test = arrange();
    test.sources.authorize = async () => { throw new AppError({ statusCode: 404, code: "MEETING_NOT_FOUND", message: "Denied" }); };
    await assert.rejects(test.read, { statusCode: 404 });
    assert.deepEqual(test.calls, []);
  });
  it("does not return a snapshot after membership revocation", async () => {
    const test = arrange(); const original = test.sources.authorize; let checks = 0;
    test.sources.authorize = async (...args) => { if (++checks === 2) throw new Error("REVOKED"); return original(...args); };
    await assert.rejects(test.read, /REVOKED/);
  });
  it("does not disguise a failed query as zero sent emails", async () => {
    const test = arrange(); test.sources.snapshot = async () => { throw new Error("DATABASE_DOWN"); };
    await assert.rejects(test.read, /DATABASE_DOWN/);
  });
  it("rejects stale status when rescheduled during the read", async () => {
    const test = arrange();
    test.sources.authorize = async () => ({ context: { status: "SCHEDULED", currentRevisionId: 13, meetingRowVersion: "0x0000000000000002" } });
    await assert.rejects(test.read, { code: "MEETING_REPORT_SCHEDULE_STALE", statusCode: 409 });
  });
  it("rejects a missing Meeting and invalid IDs", async () => {
    const test = arrange(); test.sources.snapshot = async () => null;
    await assert.rejects(test.read, { code: "MEETING_NOT_FOUND" });
    await assert.rejects(createMeetingReportScheduleReader(test.sources, options)(100, access, -1), { statusCode: 400 });
  });
});

