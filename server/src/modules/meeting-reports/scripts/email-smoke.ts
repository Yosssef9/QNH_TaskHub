import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { AppError } from "../../../shared/errors/app-error.js";
import type { EmailMessage, EmailOutboxRecord } from "../../email/email.types.js";
import { createReportEmailProcessor } from "../meeting-report-email.processor.js";
import type { ReportEmailProcessorDependencies, ReportRecipientResolution } from "../meeting-report-email.processor.js";
import { parseMeetingReportEmailPayload, reportEmailDisposition, reportRecipientFingerprint } from "../meeting-report-email.policy.js";
import type { MeetingReportEmailPayload, ReportDeliveryContext } from "../meeting-report-email.policy.js";
import { meetingReportDedupeKey, projectMeetingReportSchedule } from "../meeting-report-schedule.policy.js";
import type { MeetingReportRequest } from "../meeting-report.types.js";
import { renderMeetingReportDocument } from "../meeting-report.template.js";
import { sampleMeetingReport } from "./sample-data.js";

// Deterministic fictional fixtures. No env, DB, browser, SMTP or real addresses are used here.
const payload: MeetingReportEmailPayload = { meetingId: 127, recipientUserId: 200, revisionId: 12, scheduledEndAtUtc: "2026-09-27T07:00:00.000Z" };
const current = (): ReportDeliveryContext => ({
  meetingId: 127, status: "SCHEDULED", revisionId: 12,
  startAtUtc: "2026-09-27T06:00:00.000Z", endAtUtc: payload.scheduledEndAtUtc,
  observedAtUtc: "2026-09-27T07:30:00.000Z", activatedAtUtc: "2026-09-27T00:00:00.000Z",
  isRecipient: true, portalActive: true, portalUserCode: "DEMO200", ownerUserId: 200,
});
function fixture() {
  const data = sampleMeetingReport("en");
  data.generationMode = "AUTOMATIC";
  const request: MeetingReportRequest = {
    meetingId: 127, actor: data.generatedBy,
    access: { roleCode: "USER", permissions: [], meetingCoordinateEnabled: false, meetingOrganizeEnabled: false },
    language: "en", timeFormat: "12H", timeZone: "Asia/Riyadh", generationMode: "AUTOMATIC",
  };
  const ready: Extract<ReportRecipientResolution, { kind: "READY" }> = {
    kind: "READY", request,
    delivery: { language: "en", recipient: { email: "fictional@example.invalid", name: "Fictional recipient", source: "PORTAL" } },
    observedAtUtc: current().observedAtUtc,
  };
  const row: EmailOutboxRecord = {
    id: 99, ownerUserId: 200, recipientEmail: null, recipientName: null, languageCode: "en",
    templateKey: "MEETING_REPORT_AVAILABLE", templatePayloadJson: JSON.stringify(payload),
    dedupeKey: meetingReportDedupeKey(127, 200), attemptCount: 1,
  };
  const calls = { renders: 0, renews: 0, resolved: 0, messages: [] as EmailMessage[], envelopes: [] as Record<string, unknown>[],
    cancellations: [] as string[], deferrals: [] as { payload: Record<string, unknown>; next: string; reason: string }[],
    failures: [] as { max: number; attempt: number; delay: number; reason: string }[], sent: 0 };
  let owned = true;
  const deps: ReportEmailProcessorDependencies = {
    resolve: async () => { calls.resolved += 1; return structuredClone(ready); },
    render: async () => { calls.renders += 1; return { pdf: { buffer: Buffer.from("%PDF-1.7\nfictional-orchestration-test"), fileName: "Meeting-127-Report-EN.pdf" }, data }; },
    authorizeRelated: async () => undefined,
    template: (input) => { assert.equal(input.actionItems, data.actionItems.length); return { subject: "Report", preheader: "Report", html: "<p>Report</p>", text: "Report" }; },
    send: async (message) => { calls.messages.push(message); return { provider: "FAKE", messageId: "fake-id" }; },
    renew: async () => { calls.renews += 1; return owned; },
    saveEnvelope: async (_id, _worker, input) => { calls.envelopes.push(input.payload); return owned; },
    defer: async (_id, _worker, value, next, reason) => { calls.deferrals.push({ payload: value, next, reason }); },
    cancel: async (_id, _worker, reason) => { calls.cancellations.push(reason); },
    sent: async () => { owned = false; calls.sent += 1; return true; },
    failed: async (_id, _worker, attempt, max, delay, reason) => { calls.failures.push({ attempt, max, delay, reason }); },
  };
  return { row, ready, data, calls, deps, run: (maxPdfBytes = 1024) => createReportEmailProcessor(deps, { maxAttempts: 4, maxPdfBytes, leaseHeartbeatMs: 3 })(row, "fictional-lease") };
}

export const meetingReportEmailChecks: { name: string; run(): void | Promise<void> }[] = [];
const check = (name: string, run: () => void | Promise<void>) => { meetingReportEmailChecks.push({ name, run }); };
check("payload accepts only its identity/schedule projection", () => {
  assert.deepEqual(parseMeetingReportEmailPayload(JSON.stringify({ ...payload, html: "untrusted", url: "https://invalid.test/" })), payload);
});
for (const value of ["bad", "[]", "null", "{}", JSON.stringify({ ...payload, recipientUserId: -1 }), JSON.stringify({ ...payload, meetingId: "127" }), JSON.stringify({ ...payload, revisionId: 1.5 }), JSON.stringify({ ...payload, scheduledEndAtUtc: "2026-09-27" })]) {
  check(`malformed payload rejected: ${value.slice(0, 45)}`, () => { assert.throws(() => parseMeetingReportEmailPayload(value)); });
}
check("exact approved-end plus 30-minute boundary is eligible", () => { assert.equal(reportEmailDisposition(payload, current()).kind, "READY"); });
check("one millisecond before due time is deferred", () => {
  const result = reportEmailDisposition(payload, { ...current(), observedAtUtc: "2026-09-27T07:29:59.999Z" });
  assert.equal(result.kind, "DEFER");
});
check("new approved revision updates unsent intent without changing its recipient dedupe", () => {
  const result = reportEmailDisposition(payload, { ...current(), revisionId: 13, endAtUtc: "2026-09-28T07:00:00Z" });
  assert.equal(result.kind, "DEFER");
  if (result.kind === "DEFER") { assert.equal(result.payload.revisionId, 13); assert.equal(result.nextAttemptAtUtc, "2026-09-28T07:30:00.000Z"); }
  assert.equal(meetingReportDedupeKey(127, 200), "MEETING_REPORT:127:200");
  assert.notEqual(meetingReportDedupeKey(127, 200), meetingReportDedupeKey(128, 200));
});
for (const state of ["PENDING_APPROVAL", "REJECTED", "CANCELLED"]) {
  check(`${state} never produces a post-Meeting email`, () => { assert.equal(reportEmailDisposition(payload, { ...current(), status: state }).kind, "SKIP"); });
}
for (const patch of [{ isRecipient: false }, { portalActive: false }, { ownerUserId: null }, { revisionId: null }, { endAtUtc: "bad" }, { startAtUtc: "2026-09-27T08:00:00Z" }, { activatedAtUtc: "2026-09-27T07:00:00.001Z" }]) {
  check(`ineligible report context: ${JSON.stringify(patch)}`, () => { assert.equal(reportEmailDisposition(payload, { ...current(), ...patch }).kind, "SKIP"); });
}
check("missing Meeting skipped", () => { assert.equal(reportEmailDisposition(payload, null).kind, "SKIP"); });
check("all attendance values are irrelevant to recipient eligibility", () => {
  for (const attendance of ["ATTENDED", "ABSENT", "NOT_MARKED"]) {
    const context = { ...current(), attendance };
    assert.equal(reportEmailDisposition(payload, context).kind, "READY");
  }
});
check("permission and language changes alter the render access fingerprint", () => {
  const { ready } = fixture();
  assert.notEqual(reportRecipientFingerprint(ready.request), reportRecipientFingerprint({ ...ready.request, language: "ar" }));
  assert.notEqual(reportRecipientFingerprint(ready.request), reportRecipientFingerprint({ ...ready.request, access: { ...ready.request.access, meetingCoordinateEnabled: true } }));
});
check("successful message contains exactly one real Buffer attachment and no persisted PDF content", async () => {
  const f = fixture(); assert.equal(await f.run(), "SENT");
  assert.equal(f.calls.messages.length, 1); assert.equal(f.calls.renders, 1); assert.equal(f.calls.resolved, 2);
  const email = f.calls.messages[0]!;
  assert.equal(email.to, "fictional@example.invalid"); assert.equal(email.messageId, "<meeting-report-99@taskhub.local>");
  assert.equal(email.attachments?.length, 1); assert(Buffer.isBuffer(email.attachments![0]!.content));
  assert.equal(email.attachments![0]!.contentType, "application/pdf");
  assert.equal(f.calls.envelopes[0]!.pdfSha256?.toString().length, 64);
  assert(!JSON.stringify(f.calls.envelopes).includes("fictional-orchestration-test"));
});
check("a processed row cannot be resent without a new owned lease", async () => {
  const f = fixture(); assert.equal(await f.run(), "SENT"); assert.equal(await f.run(), "LEASE_LOST"); assert.equal(f.calls.messages.length, 1);
});
check("missing follow-up content does not block sending", async () => {
  const f = fixture(); f.data.followUp.notes = null; f.data.followUp.decisions = []; f.data.actionItems = [];
  f.data.attendanceSummary = { total: 4, ATTENDED: 0, ABSENT: 0, NOT_MARKED: 4 };
  assert.equal(await f.run(), "SENT");
});
check("unresolved email and inactive/no-access recipients are canceled before PDF work", async () => {
  const f = fixture(); f.row.ownerUserId = null; f.deps.resolve = async () => ({ kind: "SKIP", reason: "RECIPIENT_EMAIL_NOT_ELIGIBLE" });
  assert.equal(await f.run(), "SKIPPED"); assert.equal(f.calls.renders, 0); assert.equal(f.calls.messages.length, 0);
});
check("future reschedule defers same job without using a send attempt", async () => {
  const f = fixture(); f.deps.resolve = async () => ({ kind: "DEFER", payload: { ...payload, revisionId: 13 }, nextAttemptAtUtc: "2026-09-28T07:30:00Z", reason: "APPROVED_SCHEDULE_CHANGED" });
  assert.equal(await f.run(), "DEFERRED"); assert.equal(f.calls.renders, 0); assert.equal(f.calls.failures.length, 0);
});
for (const reason of ["RECIPIENT_EMAIL_NOT_ELIGIBLE", "RECIPIENT_UNAVAILABLE", "MEETING_NOT_SCHEDULED"]) {
  check(`send-time revalidation cancels after PDF: ${reason}`, async () => {
    const f = fixture(); let calls = 0;
    f.deps.resolve = async () => ++calls === 1 ? f.ready : { kind: "SKIP", reason };
    assert.equal(await f.run(), "SKIPPED"); assert.equal(f.calls.renders, 1); assert.equal(f.calls.messages.length, 0);
  });
}
check("recipient's newly verified destination is used at send time", async () => {
  const f = fixture(); let calls = 0;
  f.deps.resolve = async () => ++calls === 1 ? f.ready : { ...f.ready, delivery: { ...f.ready.delivery, recipient: { ...f.ready.delivery.recipient, email: "new@example.invalid", source: "ALTERNATE" } } };
  assert.equal(await f.run(), "SENT"); assert.equal(f.calls.messages[0]!.to, "new@example.invalid");
});
for (const mode of ["language", "permissions"] as const) {
  check(`changed ${mode} during render causes a fresh report`, async () => {
    const f = fixture(); let calls = 0;
    const changed = structuredClone(f.ready);
    if (mode === "language") changed.request.language = "ar";
    else changed.request.access.meetingCoordinateEnabled = true;
    f.deps.resolve = async () => ++calls === 1 ? f.ready : changed;
    assert.equal(await f.run(), "DEFERRED"); assert.equal(f.calls.messages.length, 0);
  });
}
for (const code of ["MEETING_REPORT_BUSY", "MEETING_REPORT_SCHEDULE_CHANGED", "MEETING_REPORT_RELATED_ACCESS_CHANGED"]) {
  check(`${code} is deferred instead of exhausted`, async () => {
    const f = fixture(); f.deps.render = async () => { throw new AppError({ code, statusCode: 409, message: "fictional" }); };
    assert.equal(await f.run(), "DEFERRED"); assert.equal(f.calls.failures.length, 0); assert.equal(f.calls.messages.length, 0);
  });
}
check("lost Related Meeting visibility after render prevents its disclosure", async () => {
  const f = fixture(); f.deps.authorizeRelated = async () => { throw new AppError({ code: "MEETING_REPORT_RELATED_ACCESS_CHANGED", statusCode: 409, message: "fictional" }); };
  assert.equal(await f.run(), "DEFERRED"); assert.equal(f.calls.messages.length, 0);
});
check("PDF generation failure remains a retryable outbox failure", async () => {
  const f = fixture(); f.deps.render = async () => { throw new Error("private body must never be logged"); };
  assert.equal(await f.run(), "FAILED"); assert.equal(f.calls.messages.length, 0);
  assert.equal(f.calls.failures[0]!.max, 4); assert.equal(f.calls.failures[0]!.reason, "MEETING_REPORT_DELIVERY_FAILED");
});
check("oversized PDF is terminal without SMTP", async () => {
  const f = fixture(); assert.equal(await f.run(5), "FAILED"); assert.equal(f.calls.failures[0]!.max, 1); assert.equal(f.calls.messages.length, 0);
});
check("SMTP failure does not become SENT", async () => {
  const f = fixture(); f.deps.send = async () => { throw new Error("fake SMTP failure"); };
  assert.equal(await f.run(), "FAILED"); assert.equal(f.calls.sent, 0); assert.equal(f.calls.failures[0]!.delay, 60);
});
check("later retries use the existing backoff and stable Message-ID", async () => {
  const f = fixture(); f.row.attemptCount = 3; f.deps.send = async () => { throw new Error("fake SMTP failure"); };
  assert.equal(await f.run(), "FAILED"); assert.equal(f.calls.failures[0]!.delay, 1800);
});
check("wrong owner/dedupe cannot send another user's report", async () => {
  const f = fixture(); f.row.ownerUserId = 300; assert.equal(await f.run(), "FAILED"); assert.equal(f.calls.renders, 0);
  const g = fixture(); g.row.dedupeKey = "MEETING_REPORT:127:300"; assert.equal(await g.run(), "FAILED"); assert.equal(g.calls.renders, 0);
});
check("malformed persisted payload is terminal", async () => {
  const f = fixture(); f.row.templatePayloadJson = "[]"; assert.equal(await f.run(), "FAILED"); assert.equal(f.calls.failures[0]!.max, 1);
});
check("lease loss before work blocks resolution and sending", async () => {
  const f = fixture(); f.deps.renew = async () => false; assert.equal(await f.run(), "LEASE_LOST"); assert.equal(f.calls.resolved, 0);
});
check("lease loss while saving envelope blocks SMTP", async () => {
  const f = fixture(); f.deps.saveEnvelope = async () => false; assert.equal(await f.run(), "LEASE_LOST"); assert.equal(f.calls.messages.length, 0);
});
check("heartbeat renews a slow render and stops cleanly", async () => {
  const f = fixture(); const render = f.deps.render;
  f.deps.render = async (...args) => { await new Promise((resolve) => setTimeout(resolve, 24)); return render(...args); };
  assert.equal(await f.run(), "SENT"); assert(f.calls.renews > 3);
});
check("heartbeat database failure aborts PDF work and prevents send", async () => {
  const f = fixture(); let renews = 0;
  f.deps.renew = async () => { if (++renews > 1) throw new Error("fake unavailable DB"); return true; };
  f.deps.render = async (_request, _expected, signal) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert(signal.aborted); throw new Error("render aborted");
  };
  assert.equal(await f.run(), "LEASE_LOST"); assert.equal(f.calls.messages.length, 0); assert.equal(f.calls.failures.length, 0);
});
check("automatic metadata does not falsely say the recipient manually exported", () => {
  for (const language of ["en", "ar"] as const) {
    const data = sampleMeetingReport(language); data.generationMode = "AUTOMATIC";
    const document = renderMeetingReportDocument(data);
    assert(document.html.includes(language === "en" ? "Generated automatically by QNH TaskHub" : "أُنشئ تلقائياً"));
    assert(document.html.includes(language === "en" ? "Prepared for" : "أُعدّ للمستخدم"));
  }
});
check("activation cutoff and partial/skipped delivery remain truthful", () => {
  const snapshot = {
    meetingId: 127, meetingStatus: "SCHEDULED" as const, meetingRowVersion: "0x1", approvedRevisionId: 12,
    approvedStartAtUtc: current().startAtUtc, approvedEndAtUtc: current().endAtUtc,
    hasPendingReschedule: false, observedAtUtc: "2026-09-27T08:00:00Z",
    recipients: [
      { userId: 200, outboxStatus: "SENT", revisionId: 12, scheduledEndAtUtc: payload.scheduledEndAtUtc, attemptCount: 1, sentAtUtc: "2026-09-27T07:31:00Z", nextAttemptAtUtc: null },
      { userId: 300, outboxStatus: "CANCELED", revisionId: 12, scheduledEndAtUtc: payload.scheduledEndAtUtc, attemptCount: 1, sentAtUtc: null, nextAttemptAtUtc: null },
    ],
  };
  const options = { automaticDeliveryEnabled: true, timeZone: "Asia/Riyadh", activatedAtUtc: "2026-09-27T00:00:00Z" };
  assert.equal(projectMeetingReportSchedule(snapshot, options).delivery.state, "PARTIAL");
  assert.equal(projectMeetingReportSchedule(snapshot, { ...options, activatedAtUtc: "2026-09-27T07:01:00Z" }).scheduleState, "BEFORE_ACTIVATION");
  assert.equal(projectMeetingReportSchedule({ ...snapshot, approvedRevisionId: 13 }, options).delivery.state, "REVIEW_REQUIRED");
});

export async function runMeetingReportEmailSmoke(): Promise<number> {
  for (const item of meetingReportEmailChecks) await item.run();
  return meetingReportEmailChecks.length;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const total = await runMeetingReportEmailSmoke();
  console.log(`PASS: ${total} Meeting report email policy/processor checks. No DB, browser or SMTP was used.`);
}
