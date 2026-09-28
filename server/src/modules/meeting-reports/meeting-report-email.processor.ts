import { emailRetryDelaySeconds } from "../email/email-retry.policy.js";
import { createHash } from "node:crypto";
import { AppError } from "../../shared/errors/app-error.js";
import { startEmailLeaseGuard } from "../email/email-lease.js";
import type { EmailMessage, EmailOutboxRecord, EmailSendResult, EmailTemplateDocument } from "../email/email.types.js";
import type { OperationalEmailDelivery } from "../email-settings/email-settings.types.js";
import { meetingReportDedupeKey, MEETING_REPORT_EMAIL_TEMPLATE } from "./meeting-report-schedule.policy.js";
import { parseMeetingReportEmailPayload, reportRecipientFingerprint } from "./meeting-report-email.policy.js";
import type { MeetingReportEmailPayload } from "./meeting-report-email.policy.js";
import type { MeetingReportData, MeetingReportPdf, MeetingReportRequest } from "./meeting-report.types.js";

export type ReportRecipientResolution =
  | { kind: "READY"; request: MeetingReportRequest; delivery: OperationalEmailDelivery; observedAtUtc: string }
  | { kind: "SKIP"; reason: string }
  | { kind: "DEFER"; payload: MeetingReportEmailPayload; nextAttemptAtUtc: string; reason: string };

export interface ReportEmailProcessorDependencies {
  resolve(payload: MeetingReportEmailPayload, ownerUserId: number | null): Promise<ReportRecipientResolution>;
  render(request: MeetingReportRequest, expected: MeetingReportEmailPayload, signal: AbortSignal): Promise<{ pdf: MeetingReportPdf; data: MeetingReportData }>;
  authorizeRelated(data: MeetingReportData, request: MeetingReportRequest): Promise<void>;
  template(payload: Record<string, unknown>, language: "ar" | "en"): EmailTemplateDocument;
  send(message: EmailMessage): Promise<EmailSendResult>;
  renew(id: number, workerId: string): Promise<boolean>;
  saveEnvelope(id: number, workerId: string, input: { ownerUserId: number; email: string; name: string; language: "ar" | "en"; payload: Record<string, unknown> }): Promise<boolean>;
  defer(id: number, workerId: string, payload: Record<string, unknown>, nextAttemptAtUtc: string, reason: string): Promise<void>;
  cancel(id: number, workerId: string, reason: string): Promise<void>;
  sent(id: number, workerId: string, messageId: string | null): Promise<boolean>;
  failed(id: number, workerId: string, attemptCount: number, maxAttempts: number, delaySeconds: number, reason: string): Promise<void>;
}

export type ReportEmailOutcome = "SENT" | "SKIPPED" | "DEFERRED" | "FAILED" | "LEASE_LOST";

/** One independently claimed recipient. No DB transaction is held while rendering or sending. */
export function createReportEmailProcessor(deps: ReportEmailProcessorDependencies, options: {
  maxAttempts: number; maxPdfBytes: number; leaseHeartbeatMs?: number;
}) {
  return async (row: EmailOutboxRecord, workerId: string): Promise<ReportEmailOutcome> => {
    const id = Number(row.id);
    const lease = startEmailLeaseGuard(() => deps.renew(id, workerId), options.leaseHeartbeatMs);
    let payload: MeetingReportEmailPayload | undefined;
    const handleResolution = async (resolution: Exclude<ReportRecipientResolution, { kind: "READY" }>): Promise<ReportEmailOutcome> => {
      await lease.assertOwned();
      if (resolution.kind === "SKIP") {
        await deps.cancel(id, workerId, resolution.reason);
        return "SKIPPED";
      }
      await deps.defer(id, workerId, { ...resolution.payload }, resolution.nextAttemptAtUtc, resolution.reason);
      return "DEFERRED";
    };
    try {
      await lease.assertOwned();
      if (row.templateKey !== MEETING_REPORT_EMAIL_TEMPLATE) throw new Error("INVALID_REPORT_TEMPLATE");
      payload = parseMeetingReportEmailPayload(row.templatePayloadJson);
      if (row.dedupeKey !== meetingReportDedupeKey(payload.meetingId, payload.recipientUserId) ||
          (row.ownerUserId !== null && row.ownerUserId !== payload.recipientUserId)) {
        throw new Error("INVALID_REPORT_IDENTITY");
      }
      const initial = await deps.resolve(payload, row.ownerUserId);
      if (initial.kind !== "READY") return await handleResolution(initial);

      const report = await deps.render(initial.request, payload, lease.signal);
      if (!Buffer.isBuffer(report.pdf.buffer) || report.pdf.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("INVALID_REPORT_PDF");
      }
      if (report.pdf.buffer.length > options.maxPdfBytes) {
        throw new AppError({ statusCode: 413, code: "MEETING_REPORT_TOO_LARGE", message: "The PDF exceeds the automatic email attachment limit." });
      }
      // Long PDF work must not preserve old preferences, destinations, permissions or schedules.
      const final = await deps.resolve(payload, row.ownerUserId);
      if (final.kind !== "READY") return await handleResolution(final);
      if (reportRecipientFingerprint(initial.request) !== reportRecipientFingerprint(final.request)) {
        return await handleResolution({ kind: "DEFER", payload, reason: "RECIPIENT_CONTEXT_CHANGED", nextAttemptAtUtc: new Date(Date.parse(final.observedAtUtc) + 5_000).toISOString() });
      }
      await deps.authorizeRelated(report.data, final.request);
      await lease.assertOwned();
      const data = report.data;
      const meeting = data.detail.meeting;
      const document = deps.template({
        meetingId: meeting.id, title: meeting.title,
        room: data.language === "ar" ? meeting.room.nameAr : meeting.room.nameEn,
        startAtUtc: meeting.startAtUtc, endAtUtc: meeting.endAtUtc,
        generatedAtUtc: data.generatedAtUtc, timeZone: data.timeZone, timeFormat: data.timeFormat,
        attended: data.attendanceSummary.ATTENDED, absent: data.attendanceSummary.ABSENT,
        notMarked: data.attendanceSummary.NOT_MARKED,
        decisions: data.followUp.decisions.length, actionItems: data.actionItems.length,
        fileName: report.pdf.fileName,
      }, final.delivery.language);
      const saved = await deps.saveEnvelope(id, workerId, {
        ownerUserId: payload.recipientUserId, email: final.delivery.recipient.email,
        name: final.delivery.recipient.name, language: final.delivery.language,
        payload: {
          ...payload, generatedAtUtc: data.generatedAtUtc, fileName: report.pdf.fileName,
          pdfBytes: report.pdf.buffer.length,
          pdfSha256: createHash("sha256").update(report.pdf.buffer).digest("hex"),
        },
      });
      if (!saved || lease.signal.aborted) throw new Error("EMAIL_LEASE_LOST");
      // Stable Message-ID helps trace retries; SMTP itself cannot guarantee exactly-once inbox delivery.
      const result = await deps.send({
        to: final.delivery.recipient.email, toName: final.delivery.recipient.name,
        messageId: `<meeting-report-${id}@taskhub.local>`,
        subject: document.subject, html: document.html, text: document.text,
        attachments: [{ filename: report.pdf.fileName, content: report.pdf.buffer, contentType: "application/pdf" }],
      });
      if (!(await deps.sent(id, workerId, result.messageId))) return "LEASE_LOST";
      return "SENT";
    } catch (error) {
      if (lease.signal.aborted || (error instanceof Error && error.message === "EMAIL_LEASE_LOST")) return "LEASE_LOST";
      const code = error instanceof AppError ? error.code : "MEETING_REPORT_DELIVERY_FAILED";
      if (code === "MEETING_NOT_FOUND") {
        await deps.cancel(id, workerId, "RECIPIENT_ACCESS_REVOKED");
        return "SKIPPED";
      }
      if (payload && ["MEETING_REPORT_BUSY", "MEETING_REPORT_SCHEDULE_CHANGED", "MEETING_REPORT_RELATED_ACCESS_CHANGED"].includes(code)) {
        await deps.defer(id, workerId, { ...payload }, new Date(Date.now() + 30_000).toISOString(), code);
        return "DEFERRED";
      }
      const permanent = !payload || code === "MEETING_REPORT_TOO_LARGE" || (error instanceof Error && error.message.startsWith("INVALID_REPORT_"));
      // Never persist/log browser HTML, PDF bytes, SMTP credentials or raw recipient addresses.
      await deps.failed(id, workerId, row.attemptCount, permanent ? row.attemptCount : options.maxAttempts,
        emailRetryDelaySeconds(row.attemptCount), code);
      return "FAILED";
    } finally {
      await lease.stop();
    }
  };
}
