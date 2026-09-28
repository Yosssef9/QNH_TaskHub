import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pool: vi.fn(), sendMail: vi.fn(), verify: vi.fn(),
  env: { EMAIL_FROM_NAME: "QNH TaskHub", EMAIL_FROM_ADDRESS: "sender@example.invalid", SMTP_HOST: "unused", SMTP_PORT: 587, SMTP_REQUIRE_TLS: true },
}));
vi.mock("../../src/database/sql.js", () => ({
  getDatabasePool: mocks.pool,
  sql: { Int: "Int", BigInt: "BigInt", Char: (n: number) => `Char(${n})`, VarChar: (n: number) => `VarChar(${n})`, NVarChar: (n: number) => `NVarChar(${n})`, DateTime2: (n: number) => `DateTime2(${n})`, MAX: -1 },
}));
vi.mock("../../src/config/env.js", () => ({ env: mocks.env }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mocks.sendMail, verify: mocks.verify }) } }));
import { meetingReportEmailRepository } from "../../src/modules/meeting-reports/meeting-report-email.repository.js";
import { emailRepository } from "../../src/modules/email/email.repository.js";
import { SmtpEmailTransport } from "../../src/modules/email/transports/smtp.transport.js";
import { renderMeetingReportEmail } from "../../src/modules/email/templates/meeting-report-email.js";

function sqlCapture(recordsets: unknown[][] = [[]]) {
  const statements: string[] = [];
  const inputs: [string, unknown, unknown][] = [];
  let count = 0;
  const request = {
    input: (name: string, type: unknown, value: unknown) => { inputs.push([name, type, value]); return request; },
    query: async (statement: string) => { statements.push(statement); return { recordset: recordsets[count++] ?? [] }; },
  };
  mocks.pool.mockResolvedValue({ request: () => request });
  return { statements, inputs };
}
beforeEach(() => { mocks.sendMail.mockResolvedValue({ messageId: "fake", accepted: ["recipient@example.invalid"], rejected: [] }); });
afterEach(() => { vi.clearAllMocks(); });

describe("Automatic report SQL/SMTP contracts (mocked adapters, not live integration)", () => {
  it("detects missing migration without querying a missing config table", async () => {
    const captured = sqlCapture([[{ installed: false }]]);
    assert.equal(await meetingReportEmailRepository.settings(), null);
    assert.equal(captured.statements.length, 1);
  });
  it("preserves the persisted activation cutoff", async () => {
    sqlCapture([[{ installed: true }], [{ enabled: true, activatedAtUtc: new Date("2026-09-27T12:00:00Z"), lastScanAtUtc: null }]]);
    assert.deepEqual(await meetingReportEmailRepository.settings(), { enabled: true, activatedAtUtc: "2026-09-27T12:00:00.000Z", lastScanAtUtc: null });
  });
  it("queues a bounded deduplicated Organizer/attendee union only for approved due schedules", async () => {
    const captured = sqlCapture([[{ queued: 3 }]]);
    assert.equal(await meetingReportEmailRepository.enqueueDue(100), 3);
    const text = captured.statements[0]!;
    for (const pattern of [/sp_getapplock/, /LockOwner = 'Transaction'/, /TOP \(@batchSize\)/, /UNION/, /meeting\.status = 'SCHEDULED'/,
      /revision\.revision_status = 'APPROVED'/, /revision\.end_at_utc >= @cutoff/, /DATEADD\(MINUTE, -@grace, @now\)/,
      /UPDLOCK, HOLDLOCK/, /existing\.dedupe_key/, /INSERT dbo\.TM_email_outbox/]) assert.match(text, pattern);
    assert.doesNotMatch(text, /attendance_status|organizer_attending\s*=\s*1/i);
    assert.equal(captured.inputs.find((row) => row[0] === "grace")?.[2], 30);
  });
  it("defers an unsent intent under its existing row and lease without creating another key", async () => {
    const captured = sqlCapture();
    await meetingReportEmailRepository.defer(99, "lease", { meetingId: 127 }, "2026-09-28T10:00:00Z", "APPROVED_SCHEDULE_CHANGED");
    assert.match(captured.statements[0]!, /attempt_count - 1/);
    assert.match(captured.statements[0]!, /locked_by = @worker/);
    assert.doesNotMatch(captured.statements[0]!, /INSERT|dedupe_key\s*=/i);
  });
  it("claims report rows separately and returns their exact dedupe identity", async () => {
    const captured = sqlCapture([[{ id: "99", ownerUserId: null, languageCode: "ar", attemptCount: 1, dedupeKey: "MEETING_REPORT:127:200" }]]);
    const rows = await emailRepository.claimBatch("unique-lease", 1, 10, 4, "REPORT");
    assert.equal(rows[0]!.id, 99);
    assert.equal(captured.inputs.find((row) => row[0] === "scope")?.[2], "REPORT");
    assert.match(captured.statements[0]!, /READCOMMITTEDLOCK/);
    assert.match(captured.statements[0]!, /inserted\.dedupe_key AS dedupeKey/);
    assert.match(captured.statements[0]!, /@scope = 'OTHER' AND template_key <> 'MEETING_REPORT_AVAILABLE'/);
  });
  it("cannot mark a send after the lease was lost", async () => {
    sqlCapture([[{ affected: 0 }]]);
    assert.equal(await emailRepository.markSent(99, "expired", "fake"), false);
  });
  it("sends the in-memory PDF alongside the existing inline logo", async () => {
    const transport = new SmtpEmailTransport();
    const content = Buffer.from("%PDF-1.7\nfake");
    await transport.send({
      to: "recipient@example.invalid", subject: "Report", text: "Report", html: '<img src="cid:qnh-taskhub-logo@qnhospital.com">',
      messageId: "<meeting-report-99@taskhub.local>", attachments: [{ filename: "Meeting-127-Report-EN.pdf", content, contentType: "application/pdf" }],
    });
    const mail = mocks.sendMail.mock.calls[0]![0];
    assert.equal(mail.messageId, "<meeting-report-99@taskhub.local>");
    assert.equal(mail.attachments.length, 2);
    assert.equal(mail.attachments[0].cid, "qnh-taskhub-logo@qnhospital.com");
    assert.equal(mail.attachments[1].content, content);
    assert.equal(mail.attachments[1].contentDisposition, "attachment");
    assert.equal(mail.attachments[1].path, undefined);
  });
  it("rejects invalid PDF content and SMTP rejection rather than claiming sent", async () => {
    const transport = new SmtpEmailTransport();
    await assert.rejects(transport.send({ to: "recipient@example.invalid", subject: "Report", text: "x", html: "x", attachments: [
      { filename: "Meeting-127-Report-EN.pdf", content: Buffer.from("not-pdf"), contentType: "application/pdf" },
    ] }));
    mocks.sendMail.mockResolvedValue({ messageId: "fake", rejected: ["recipient@example.invalid"] });
    await assert.rejects(transport.send({ to: "recipient@example.invalid", subject: "Report", text: "x", html: "x" }));
  });
  it("renders both languages using safe content and a numeric Meeting link", () => {
    const payload = { meetingId: 127, title: '<script>Title</script>\r\nInjected', room: "Main room", startAtUtc: "2026-09-27T09:00:00Z", endAtUtc: "2026-09-27T10:00:00Z", generatedAtUtc: "2026-09-27T10:30:00Z", timeZone: "Asia/Riyadh", timeFormat: "12H", attended: 2, absent: 1, notMarked: 1, decisions: 0, actionItems: 3, fileName: "Meeting-127-Report-EN.pdf" };
    for (const language of ["ar", "en"] as const) {
      const result = renderMeetingReportEmail(payload, language, { taskHubUrl: "https://example.invalid/TaskHub/", logoUrl: "cid:qnh-taskhub-logo@qnhospital.com" });
      assert(!result.subject.includes("\n"));
      assert(!result.html.includes("<script>"));
      assert(result.html.includes("&lt;script&gt;"));
      assert(result.text.includes("https://example.invalid/TaskHub/meetings/127"));
      assert(result.html.includes(language === "ar" ? 'dir="rtl"' : 'dir="ltr"'));
    }
  });
  it("migration preserves defaults, cutoff and outbox dedupe while restricting null addresses", async () => {
    const sql = await readFile(new URL("../../database/migrations/044_add_meeting_report_email.sql", import.meta.url), "utf8");
    assert.match(sql, /MEETING_REPORT_AVAILABLE/);
    assert.match(sql, /WHERE NOT EXISTS/);
    assert.match(sql, /recipient_email IS NULL AND template_key = 'MEETING_REPORT_AVAILABLE'/);
    assert.match(sql, /IF NOT EXISTS \(SELECT 1 FROM dbo\.TM_meeting_report_delivery_config/);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|DROP CONSTRAINT UQ_TM_email_outbox_dedupe/i);
  });
});
