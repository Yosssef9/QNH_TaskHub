import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { infoPanel } from "./operational-email.helpers.js";
import {
  meetingScheduleConflictSchema,
  renderMeetingScheduleConflictWarning,
} from "./meeting-schedule-conflict-email.js";

const meetingSchema = z.object({
  meetingId: z.number().int().positive(),
  sequenceNumber: z.number().int().positive(),
  title: z.string().min(1),
  startAtUtc: z.string().datetime(),
  endAtUtc: z.string().datetime(),
  roomNameAr: z.string(),
  roomNameEn: z.string(),
  scheduleConflict: meetingScheduleConflictSchema.nullable().optional(),
});

const schema = z.object({
  seriesId: z.number().int().positive(),
  seriesTitle: z.string().min(1),
  organizerName: z.string().min(1),
  recipientName: z.string().min(1),
  timeFormat: z.enum(["12H", "24H"]).default("12H"),
  meetingCount: z.number().int().positive(),
  meetings: z.array(meetingSchema).min(1).max(100),
  opensSeries: z.boolean(),
  href: z.string().min(1),
});

function formatDateTime(value: string, language: EmailLanguage, timeFormat: "12H" | "24H"): string {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-SA", {
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: timeFormat === "24H" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: timeFormat === "12H",
  }).format(new Date(value));
}

export function renderMeetingSeriesScheduledEmail(
  payload: Record<string, unknown>,
  language: EmailLanguage,
  context: EmailRenderContext,
): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const href = joinAbsoluteUrl(context.taskHubUrl, data.href);
  const visible = data.meetings.slice(0, 10);
  const conflicting = data.meetings.filter((meeting) => meeting.scheduleConflict);
  const conflictWarning = renderMeetingScheduleConflictWarning({
    items: conflicting.slice(0, 10).map((meeting) => ({
      label: `#${meeting.sequenceNumber} — ${meeting.title}`,
      conflict: meeting.scheduleConflict!,
    })),
    language,
    formatDateTime: (value) => formatDateTime(value, language, data.timeFormat),
  });
  const hiddenConflictMeetings = Math.max(0, conflicting.length - 10);
  const conflictOverflowText = hiddenConflictMeetings > 0
    ? ar
      ? `هناك ${hiddenConflictMeetings} اجتماعات أخرى في السلسلة لديها تعارضات في الموعد.`
      : `${hiddenConflictMeetings} more Series Meetings have schedule conflicts.`
    : "";

  const rows = [
    { label: ar ? "المنظم" : "Organizer", value: data.organizerName },
    { label: ar ? "عدد الاجتماعات" : "Meetings", value: String(data.meetingCount) },
    ...visible.map((meeting) => ({
      label: `#${meeting.sequenceNumber}`,
      value: `${formatDateTime(meeting.startAtUtc, language, data.timeFormat)} · ${ar ? meeting.roomNameAr : meeting.roomNameEn}${meeting.scheduleConflict ? (ar ? " · ⚠ تعارض في الموعد" : " · ⚠ Schedule conflict") : ""}`,
    })),
    ...(data.meetingCount > visible.length
      ? [{ label: ar ? "المزيد" : "More", value: ar ? `و${data.meetingCount - visible.length} اجتماعات أخرى` : `${data.meetingCount - visible.length} more Meetings` }]
      : []),
  ];

  const subject = ar
    ? `تمت جدولة سلسلة اجتماعات — ${data.seriesTitle}`
    : `Meeting series scheduled — ${data.seriesTitle}`;
  const intro = ar
    ? `تمت جدولة ${data.meetingCount} اجتماعات لك ضمن هذه السلسلة. تعرض هذه الرسالة فقط الاجتماعات المرتبطة بك.`
    : `${data.meetingCount} Meetings have been scheduled for you in this Series. This message includes only Meetings associated with you.`;

  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader: intro,
    eyebrow: ar ? "سلسلة اجتماعات" : "Meeting Series",
    title: data.seriesTitle,
    intro,
    accent: "primary",
    bodyHtml: `${infoPanel(rows, language)}${conflictWarning.html}${conflictOverflowText ? `<p style="margin:8px 0 18px;font-size:12px;line-height:19px;color:#8B691D;">${conflictOverflowText}</p>` : ""}`,
    cta: {
      label: data.opensSeries
        ? ar ? "فتح سلسلة الاجتماعات" : "Open Meeting Series"
        : ar ? "فتح الاجتماع" : "Open Meeting",
      href,
    },
  });

  const meetingText = visible
    .map((meeting) => `#${meeting.sequenceNumber} — ${formatDateTime(meeting.startAtUtc, language, data.timeFormat)} — ${ar ? meeting.roomNameAr : meeting.roomNameEn}${meeting.scheduleConflict ? (ar ? " — ⚠ تعارض في الموعد" : " — ⚠ Schedule conflict") : ""}`)
    .join("\n");
  const warningText = conflictWarning.text
    ? `\n\n${conflictWarning.text}${conflictOverflowText ? `\n${conflictOverflowText}` : ""}`
    : "";
  const openLabel = data.opensSeries
    ? ar ? "فتح سلسلة الاجتماعات" : "Open Meeting Series"
    : ar ? "فتح الاجتماع" : "Open Meeting";
  const text = ar
    ? `QNH TaskHub\n\nسلسلة اجتماعات\n${data.seriesTitle}\n${intro}\nالمنظم: ${data.organizerName}\n\n${meetingText}${warningText}\n\n${openLabel}: ${href}`
    : `QNH TaskHub\n\nMeeting Series\n${data.seriesTitle}\n${intro}\nOrganizer: ${data.organizerName}\n\n${meetingText}${warningText}\n\n${openLabel}: ${href}`;

  return { subject, preheader: intro, html, text };
}

