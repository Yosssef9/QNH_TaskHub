import { z } from "zod";

import type {
  EmailLanguage,
  EmailRenderContext,
  EmailTemplateDocument,
  OperationalEmailTemplateKey,
} from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { infoPanel } from "./operational-email.helpers.js";
import {
  meetingScheduleConflictSchema,
  renderMeetingScheduleConflictWarning,
} from "./meeting-schedule-conflict-email.js";

const meetingTypes = [
  "MEETING_REQUEST_SUBMITTED",
  "MEETING_REQUEST_UPDATED",
  "MEETING_APPROVED",
  "MEETING_REJECTED",
  "MEETING_INVITED",
  "MEETING_RESCHEDULED",
  "MEETING_RESCHEDULE_REQUEST_CANCELLED",
  "MEETING_CANCELLED",
] as const;

type MeetingEmailType = (typeof meetingTypes)[number];

const schema = z.object({
  meetingId: z.number().int().positive(),
  revisionId: z.number().int().positive(),
  meetingTitle: z.string().min(1),
  organizerName: z.string().min(1),
  changedByName: z.string().nullable().optional(),
  timeFormat: z.enum(["12H", "24H"]).default("12H"),
  meetingMode: z.enum(["ROOM", "ZOOM"]).default("ROOM"),
  roomNameAr: z.string().nullable(),
  roomNameEn: z.string().nullable(),
  onlineJoinUrl: z.string().url().nullable().optional(),
  startAtUtc: z.string().datetime(),
  endAtUtc: z.string().datetime(),
  previousMeetingMode: z.enum(["ROOM", "ZOOM"]).nullable().optional(),
  previousRoomNameAr: z.string().nullable().optional(),
  previousRoomNameEn: z.string().nullable().optional(),
  previousOnlineJoinUrl: z.string().url().nullable().optional(),
  previousStartAtUtc: z.string().datetime().nullable().optional(),
  previousEndAtUtc: z.string().datetime().nullable().optional(),
  scheduleConflict: meetingScheduleConflictSchema.nullable().optional(),
  href: z.string().min(1),
});

function asMeetingType(value: OperationalEmailTemplateKey): MeetingEmailType {
  if ((meetingTypes as readonly string[]).includes(value)) return value as MeetingEmailType;
  throw new Error(`Unsupported Meeting email type: ${value}`);
}

function formatMeetingDateTime(
  value: string,
  language: EmailLanguage,
  timeFormat: "12H" | "24H",
): string {
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

function labels(type: MeetingEmailType, ar: boolean) {
  const map = {
    MEETING_REQUEST_SUBMITTED: ar
      ? { eyebrow: "طلب اجتماع", subject: "تم إرسال طلب اجتماع", intro: "تم تسجيل طلب الاجتماع وهو بانتظار التنسيق والموافقة." }
      : { eyebrow: "Meeting request", subject: "Meeting request submitted", intro: "A Meeting request has been submitted and is waiting for coordination and approval." },
    MEETING_REQUEST_UPDATED: ar
      ? { eyebrow: "تم تحديث الطلب", subject: "تم تحديث موعد طلب الاجتماع", intro: "تم تحديث الموعد أو القاعة المقترحة، ويمكن للمنسق مراجعة الطلب المحدث." }
      : { eyebrow: "Request updated", subject: "Meeting request schedule updated", intro: "The proposed date, time, or room was updated and is ready for Coordinator review." },
    MEETING_APPROVED: ar
      ? { eyebrow: "تمت الموافقة", subject: "تمت الموافقة على الاجتماع", intro: "تم اعتماد الاجتماع بالموعد والموقع الموضحين أدناه." }
      : { eyebrow: "Approved", subject: "Meeting approved", intro: "The Meeting is scheduled with the date, time, and room shown below." },
    MEETING_REJECTED: ar
      ? { eyebrow: "تم الرفض", subject: "تم رفض طلب الاجتماع", intro: "تم رفض طلب الاجتماع أو طلب إعادة الجدولة المرتبط به." }
      : { eyebrow: "Rejected", subject: "Meeting request rejected", intro: "The Meeting request or related reschedule request was rejected." },
    MEETING_INVITED: ar
      ? { eyebrow: "دعوة اجتماع", subject: "تمت دعوتك إلى اجتماع", intro: "تمت إضافتك كمشارك في الاجتماع المجدول أدناه." }
      : { eyebrow: "Meeting invitation", subject: "You are invited to a Meeting", intro: "You have been added as a participant in the scheduled Meeting below." },
    MEETING_RESCHEDULED: ar
      ? { eyebrow: "إعادة جدولة", subject: "تمت إعادة جدولة الاجتماع", intro: "تم تحديث موعد أو موقع هذا الاجتماع." }
      : { eyebrow: "Rescheduled", subject: "Meeting rescheduled", intro: "The date, time, or location for this Meeting has been updated." },
    MEETING_RESCHEDULE_REQUEST_CANCELLED: ar
      ? { eyebrow: "تم إلغاء الطلب", subject: "تم إلغاء طلب إعادة الجدولة", intro: "ألغى المنظم طلب إعادة الجدولة، وسيبقى الموعد الحالي للاجتماع كما هو." }
      : { eyebrow: "Request cancelled", subject: "Reschedule request cancelled", intro: "The Organizer cancelled the reschedule request. The current approved Meeting schedule remains unchanged." },
    MEETING_CANCELLED: ar
      ? { eyebrow: "تم الإلغاء", subject: "تم إلغاء الاجتماع", intro: "تم إلغاء هذا الاجتماع." }
      : { eyebrow: "Cancelled", subject: "Meeting cancelled", intro: "This Meeting has been cancelled." },
  } as const;
  return map[type];
}

export function renderMeetingLifecycleEmail(
  templateKey: OperationalEmailTemplateKey,
  payload: Record<string, unknown>,
  language: EmailLanguage,
  context: EmailRenderContext,
): EmailTemplateDocument {
  const type = asMeetingType(templateKey);
  const data = schema.parse(payload);
  const ar = language === "ar";
  const copy = labels(type, ar);
  const locationLabel = (mode: "ROOM" | "ZOOM", roomAr?: string | null, roomEn?: string | null) =>
    mode === "ZOOM" ? (ar ? "اجتماع Zoom · عبر الإنترنت" : "Zoom Meeting · Online") : (ar ? roomAr : roomEn) ?? (ar ? "قاعة غير محددة" : "Room not specified");
  const location = locationLabel(data.meetingMode, data.roomNameAr, data.roomNameEn);
  const start = formatMeetingDateTime(data.startAtUtc, language, data.timeFormat);
  const end = formatMeetingDateTime(data.endAtUtc, language, data.timeFormat);
  const taskHubHref = joinAbsoluteUrl(context.taskHubUrl, data.href);
  const joinHref = data.meetingMode === "ZOOM" && data.onlineJoinUrl ? data.onlineJoinUrl : null;
  const href = joinHref && (type === "MEETING_INVITED" || type === "MEETING_RESCHEDULED") ? joinHref : taskHubHref;
  const subject = `${copy.subject} — ${data.meetingTitle}`;
  const preheader = copy.intro;

  const previousMode = data.previousMeetingMode ?? "ROOM";
  const previousLocation = data.previousStartAtUtc ? locationLabel(previousMode, data.previousRoomNameAr, data.previousRoomNameEn) : null;
  const previousStart = data.previousStartAtUtc ? formatMeetingDateTime(data.previousStartAtUtc, language, data.timeFormat) : null;
  const previousEnd = data.previousEndAtUtc ? formatMeetingDateTime(data.previousEndAtUtc, language, data.timeFormat) : null;
  const showBeforeAfter = type === "MEETING_RESCHEDULED" && previousLocation && previousStart && previousEnd;

  const conflictWarning = data.scheduleConflict && (type === "MEETING_INVITED" || type === "MEETING_RESCHEDULED")
    ? renderMeetingScheduleConflictWarning({
        items: [{ conflict: data.scheduleConflict }],
        language,
        formatDateTime: (value) => formatMeetingDateTime(value, language, data.timeFormat),
      })
    : { html: "", text: "" };

  const bodyRows = showBeforeAfter
    ? [
        { label: ar ? "المنظم" : "Organizer", value: data.organizerName },
        ...(data.changedByName ? [{ label: ar ? "تم التغيير بواسطة" : "Changed by", value: data.changedByName }] : []),
        { label: ar ? "الموقع السابق" : "Previous location", value: previousLocation },
        { label: ar ? "الموعد السابق" : "Previous time", value: `${previousStart} → ${previousEnd}` },
        { label: ar ? "الموقع الجديد" : "New location", value: location },
        { label: ar ? "الموعد الجديد" : "New time", value: `${start} → ${end}` },
      ]
    : [
        { label: ar ? "المنظم" : "Organizer", value: data.organizerName },
        { label: ar ? "نوع الاجتماع" : "Meeting type", value: data.meetingMode === "ZOOM" ? (ar ? "Zoom" : "Zoom") : (ar ? "حضوري" : "Meeting Room") },
        { label: ar ? "الموقع" : "Location", value: location },
        { label: ar ? "البداية" : "Starts", value: start },
        { label: ar ? "النهاية" : "Ends", value: end },
      ];

  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: copy.eyebrow,
    title: data.meetingTitle,
    intro: copy.intro,
    accent:
      type === "MEETING_CANCELLED" ||
      type === "MEETING_REJECTED" ||
      type === "MEETING_RESCHEDULE_REQUEST_CANCELLED"
        ? "warning"
        : "primary",
    bodyHtml: `${infoPanel(bodyRows, language)}${conflictWarning.html}`,
    cta: {
      label: joinHref && (type === "MEETING_INVITED" || type === "MEETING_RESCHEDULED")
        ? (ar ? "الانضمام إلى اجتماع Zoom" : "Join Zoom Meeting")
        : (ar ? "فتح الاجتماع" : "Open Meeting"),
      href,
    },
  });

  const scheduleText = showBeforeAfter
    ? ar
      ? `الموقع السابق: ${previousLocation}\nالموعد السابق: ${previousStart} → ${previousEnd}\nالموقع الجديد: ${location}\nالموعد الجديد: ${start} → ${end}`
      : `Previous location: ${previousLocation}\nPrevious time: ${previousStart} → ${previousEnd}\nNew location: ${location}\nNew time: ${start} → ${end}`
    : ar
      ? `الموقع: ${location}\nالبداية: ${start}\nالنهاية: ${end}`
      : `Location: ${location}\nStarts: ${start}\nEnds: ${end}`;

  const changedByText = type === "MEETING_RESCHEDULED" && data.changedByName
    ? ar
      ? `\nتم التغيير بواسطة: ${data.changedByName}`
      : `\nChanged by: ${data.changedByName}`
    : "";

  const warningText = conflictWarning.text ? `\n\n${conflictWarning.text}` : "";
  const text = ar
    ? `QNH TaskHub\n\n${copy.eyebrow}\n${data.meetingTitle}\n${copy.intro}\nالمنظم: ${data.organizerName}${changedByText}\n${scheduleText}${warningText}\n\n${joinHref && (type === "MEETING_INVITED" || type === "MEETING_RESCHEDULED") ? "الانضمام إلى اجتماع Zoom" : "فتح الاجتماع"}: ${href}`
    : `QNH TaskHub\n\n${copy.eyebrow}\n${data.meetingTitle}\n${copy.intro}\nOrganizer: ${data.organizerName}${changedByText}\n${scheduleText}${warningText}\n\n${joinHref && (type === "MEETING_INVITED" || type === "MEETING_RESCHEDULED") ? "Join Zoom Meeting" : "Open Meeting"}: ${href}`;

  return { subject, preheader, html, text };
}


