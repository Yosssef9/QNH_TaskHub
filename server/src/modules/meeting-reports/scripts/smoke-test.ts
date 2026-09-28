import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { createMeetingReportBuilder, meetingReportStage } from "../meeting-report.builder.js";
import { createMeetingReportLimiter } from "../meeting-report.limits.js";
import { createMeetingReportRenderer } from "../meeting-report.renderer.js";
import { renderMeetingReportDocument } from "../meeting-report.template.js";
import type { MeetingReportRequest, MeetingReportSources } from "../meeting-report.types.js";
import { sampleMeetingReport } from "./sample-data.js";

// No DB, SMTP or application environment is read by this smoke test.
const sample = sampleMeetingReport();
let authChecks = 0;
const sources: MeetingReportSources = {
  authorize: async () => { authChecks += 1; },
  detail: async () => structuredClone(sample.detail),
  followUp: async () => structuredClone(sample.followUp),
  actionItems: async () => ({ items: structuredClone(sample.actionItems), canCreate: false }),
  attachments: async () => structuredClone(sample.attachments),
  relatedMeetings: async () => ({ items: structuredClone(sample.relatedMeetings) }),
};
const request: MeetingReportRequest = { meetingId: 127, actor: sample.generatedBy, access: { roleCode: "USER", permissions: [], meetingOrganizeEnabled: false, meetingCoordinateEnabled: false }, language: "en", timeFormat: "12H", timeZone: "Asia/Riyadh" };
const data = await createMeetingReportBuilder(sources, () => new Date(sample.generatedAtUtc))(request);
assert.equal(authChecks, 2);
assert.equal(data.actionItems.length, 3);
assert.equal(data.actionItems.some((item) => item.assigneeUserId !== request.actor.userId), true);
assert.deepEqual(data.attendanceSummary, { total: 4, ATTENDED: 2, ABSENT: 1, NOT_MARKED: 1 });
assert.equal(data.followUp.summary.completed, 1);
assert.equal(data.generatedBy.userId, request.actor.userId);
let leakedRead = false;
await assert.rejects(createMeetingReportBuilder({ ...sources, authorize: async () => { throw new Error("DENIED"); }, detail: async () => { leakedRead = true; return sample.detail; } })(request), /DENIED/);
assert.equal(leakedRead, false);
await assert.rejects(createMeetingReportBuilder({ ...sources, attachments: async () => { throw new Error("READ_FAILED"); } })(request), /READ_FAILED/);
await assert.rejects(createMeetingReportBuilder(sources)({ ...request, meetingId: Number.MAX_SAFE_INTEGER + 1 }));
for (const status of ["PENDING_APPROVAL", "CANCELLED", "REJECTED"] as const) {
  assert.equal(meetingReportStage({ ...sample.detail, meeting: { ...sample.detail.meeting, status } }, new Date(sample.generatedAtUtc)), status);
}
assert.equal(meetingReportStage(sample.detail, new Date("2026-09-27T05:00:00Z")), "BEFORE_START");
assert.equal(meetingReportStage(sample.detail, new Date("2026-09-27T06:30:00Z")), "IN_PROGRESS");
assert.equal(meetingReportStage(sample.detail, new Date("2026-09-27T07:00:00Z")), "ENDED");
const hostile = structuredClone(data);
hostile.detail.meeting.title = '<script>alert("secret")</script>';
hostile.followUp.notes!.notesText = '<img src="http://169.254.169.254/"> & <iframe src="file:///etc/passwd">';
const escaped = renderMeetingReportDocument(hostile, { logoDataUrl: "https://example.invalid/logo.png" }).html;
assert(!escaped.includes("<script>"));
assert(!escaped.includes('<img src="http'));
assert(!escaped.includes('<iframe'));
assert(escaped.includes("&lt;script&gt;"));
assert(!escaped.includes("example.invalid/logo.png"));
assert(escaped.includes("Content-Security-Policy"));
const emptyData = structuredClone(data);
emptyData.stage = "BEFORE_START";
emptyData.detail.meeting.startAtUtc = "2026-09-28T06:00:00Z";
emptyData.detail.meeting.endAtUtc = "2026-09-28T07:00:00Z";
emptyData.detail.agendaItems = [];
emptyData.detail.revisions = [];
emptyData.detail.activity = [];
emptyData.detail.attendance = emptyData.detail.attendance.map((row) => ({ ...row, status: "NOT_MARKED", markedBy: null, markedAtUtc: null }));
emptyData.attendanceSummary = { total: 4, ATTENDED: 0, ABSENT: 0, NOT_MARKED: 4 };
emptyData.followUp = { summary: { actionItems: 0, completed: 0, overdue: 0, decisions: 0 }, decisions: [], notes: null, canManageContent: false };
emptyData.actionItems = []; emptyData.attachments = []; emptyData.relatedMeetings = [];
const emptyHtml = renderMeetingReportDocument(emptyData).html;
assert.equal((emptyHtml.match(/<section id=/g) ?? []).length, 10);
for (const message of ["No Agenda topics", "No decisions", "No Action Items", "No files", "No related Meetings", "approved Meeting start time"]) assert(emptyHtml.includes(message));
assert(renderMeetingReportDocument(sampleMeetingReport("ar")).html.includes('dir="rtl"'));
const limiter = createMeetingReportLimiter(1);
let release: () => void = () => {};
const held = limiter.run(100, () => new Promise<void>((resolve) => { release = resolve; }));
await assert.rejects(limiter.run(200, async () => undefined), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "MEETING_REPORT_BUSY");
release(); await held;
assert.equal(await limiter.run(200, async () => "available"), "available");
await assert.rejects(limiter.run(200, async () => { throw new Error("operation failed"); }));
assert.equal(await limiter.run(200, async () => "released after error"), "released after error");
console.log("PASS: builder authorization ordering, complete lists, attendance, lifecycle, empty states, escaping and resource limiter.");

if (process.argv.includes("--render")) {
  const getArg = (name: string) => process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const output = getArg("--output") ?? await mkdtemp(path.join(os.tmpdir(), "taskhub-report-smoke-"));
  await mkdir(output, { recursive: true });
  const channel = process.env.MEETING_REPORT_BROWSER_CHANNEL;
  const renderer = createMeetingReportRenderer({
    executablePath: getArg("--browser") ?? process.env.MEETING_REPORT_BROWSER_EXECUTABLE,
    channel: channel === "msedge" || channel === "chrome" || channel === "chromium" ? channel : undefined,
    // Only explicit test invocation can turn this off; production always keeps the sandbox.
    sandbox: !process.argv.includes("--no-sandbox"),
  });
  const long = sampleMeetingReport("ar");
  long.detail.attendance = Array.from({ length: 65 }, (_, index) => ({ ...long.detail.attendance[0]!, participant: { userId: index + 1000, userCode: `LONG${index}`, userName: `المشارك ${index + 1} — Participant with a long mixed-language name` }, role: "ATTENDEE" as const }));
  long.attendanceSummary = { total: 65, ATTENDED: 65, ABSENT: 0, NOT_MARKED: 0 };
  long.followUp.notes!.notesText = Array.from({ length: 35 }, (_, i) => `الفقرة ${i + 1}: تمت مراجعة الملاحظات والقرارات مع الإدارات المعنية، والتأكيد على وضوح المسؤوليات والمواعيد. This is a deliberately long bilingual note to verify wrapping, page breaks and preservation of all report content.`).join("\n\n") + "\n\nEND_OF_LONG_REPORT_NOTES";
  for (const [name, model] of [["Meeting-Report-EN", sample], ["Meeting-Report-AR", sampleMeetingReport("ar")], ["Meeting-Report-Empty", emptyData], ["Meeting-Report-Long-AR", long]] as const) {
    const document = renderMeetingReportDocument(model, { sample: true });
    const pdf = await renderer(document);
    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
    await writeFile(path.join(output, `${name}.pdf`), pdf);
    await writeFile(path.join(output, `${name}.html`), document.html, "utf8");
    console.log(`PASS: ${name}.pdf (${pdf.length} bytes)`);
  }
  // Verify that even a renderer-level remote image does not perform a network request.
  let networkRequests = 0;
  const server = createServer((_req, res) => { networkRequests += 1; res.end("blocked test"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    await renderer({ html: `<html><body><p>Offline security test</p><img src="http://127.0.0.1:${address.port}/private"></body></html>`, headerTemplate: "<div></div>", footerTemplate: "<div></div>" });
    assert.equal(networkRequests, 0);
    console.log("PASS: renderer made zero requests to the test HTTP server.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  console.log(`Fictional reports written to: ${output}`);
} else {
  console.log("Add --render to create fictional English/Arabic/empty/long PDFs using the installed report browser.");
}
