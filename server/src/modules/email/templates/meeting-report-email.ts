import { z } from "zod";
import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { infoPanel } from "./operational-email.helpers.js";

const count = z.number().int().nonnegative();
const schema = z.object({
  meetingId: z.number().int().positive(), title: z.string(), room: z.string(),
  startAtUtc: z.string(), endAtUtc: z.string(), generatedAtUtc: z.string(),
  timeZone: z.string(), timeFormat: z.enum(["12H", "24H"]),
  attended: count, absent: count, notMarked: count, decisions: count, actionItems: count,
  fileName: z.string(),
});

/** Payload is created from the exact authorized PDF model, not from arbitrary outbox HTML. */
export function renderMeetingReportEmail(payload: Record<string, unknown>, language: EmailLanguage, context: EmailRenderContext): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const format = (value: string) => new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", {
    calendar: "gregory", numberingSystem: "latn", timeZone: data.timeZone,
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: data.timeFormat === "12H",
  }).format(new Date(value));
  const title = data.title.replace(/[\r\n]+/g, " ");
  const subject = ar ? `تقرير الاجتماع — ${title}` : `Meeting Report — ${title}`;
  const intro = ar
    ? "انتهى الموعد المجدول للاجتماع. أُرفق تقريره الحالي بعد مهلة الثلاثين دقيقة. يعكس التقرير المعلومات المسجلة وقت إنشائه، ويمكن تصدير نسخة أحدث من TaskHub في أي وقت."
    : "The scheduled Meeting has ended. Its current report is attached after the 30-minute grace period. It reflects the information recorded when generated; you can export a newer copy from TaskHub at any time.";
  const href = joinAbsoluteUrl(context.taskHubUrl, `/meetings/${data.meetingId}`);
  const rows = [
    { label: ar ? "رقم الاجتماع" : "Meeting", value: `#${data.meetingId}` },
    { label: ar ? "البداية" : "Start", value: format(data.startAtUtc) },
    { label: ar ? "النهاية" : "End", value: format(data.endAtUtc) },
    { label: ar ? "القاعة" : "Room", value: data.room },
    { label: ar ? "الحضور" : "Attendance", value: ar ? `${data.attended} حاضر · ${data.absent} غائب · ${data.notMarked} لم يُسجل` : `${data.attended} attended · ${data.absent} absent · ${data.notMarked} not marked` },
    { label: ar ? "القرارات" : "Decisions", value: String(data.decisions) },
    { label: ar ? "الإجراءات والمهام" : "Action Items", value: String(data.actionItems) },
    { label: ar ? "أُنشئ التقرير" : "Report generated", value: `${format(data.generatedAtUtc)} (${data.timeZone})` },
    { label: ar ? "المرفق" : "Attachment", value: data.fileName },
  ];
  const html = renderEmailLayout({
    language, logoUrl: context.logoUrl, preheader: intro,
    eyebrow: ar ? "تقرير الاجتماع" : "Meeting Report", title: data.title, intro, accent: "primary",
    bodyHtml: infoPanel(rows, language),
    cta: { label: ar ? "فتح الاجتماع في TaskHub" : "Open Meeting in TaskHub", href },
  });
  return { subject, preheader: intro, html, text: `QNH TaskHub\n\n${title}\n\n${intro}\n\n${rows.map((row) => `${row.label}: ${row.value}`).join("\n")}\n\n${href}` };
}
