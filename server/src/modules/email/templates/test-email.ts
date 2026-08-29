import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";

const testEmailPayloadSchema = z.object({
  recipientDisplayName: z.string().trim().min(1).max(200).optional(),
});

export function renderTestEmail(
  payload: Record<string, unknown>,
  language: EmailLanguage,
  context: EmailRenderContext,
): EmailTemplateDocument {
  const parsed = testEmailPayloadSchema.parse(payload);
  const isArabic = language === "ar";
  const name = parsed.recipientDisplayName;

  const subject = isArabic ? "رسالة تجريبية — QNH TaskHub" : "Test email — QNH TaskHub";
  const preheader = isArabic
    ? "تم إعداد قناة البريد الإلكتروني في QNH TaskHub بنجاح."
    : "The QNH TaskHub email channel is configured successfully.";
  const intro = isArabic
    ? `${name ? `${name}، ` : ""}وصلتك هذه الرسالة للتحقق من أن إعدادات البريد الإلكتروني في QNH TaskHub تعمل بصورة صحيحة.`
    : `${name ? `${name}, ` : ""}you received this message to confirm that QNH TaskHub email delivery is configured correctly.`;

  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: isArabic ? "اختبار البريد الإلكتروني" : "Email delivery test",
    title: isArabic ? "تم الاتصال بنجاح" : "Email delivery is connected",
    intro,
    accent: "success",
    metrics: [
      {
        label: isArabic ? "الحالة" : "Status",
        value: isArabic ? "جاهز للإرسال" : "Ready to send",
      },
      {
        label: isArabic ? "النظام" : "System",
        value: "QNH TaskHub",
      },
    ],
    cta: {
      label: isArabic ? "فتح TaskHub" : "Open TaskHub",
      href: context.taskHubUrl,
    },
    footerNote: isArabic
      ? "هذه رسالة اختبار فنية ولا ترتبط بأي مهمة أو مؤشر أداء."
      : "This technical test message is not linked to any task or KPI.",
  });

  const text = isArabic
    ? `QNH TaskHub\n\nتم الاتصال بنجاح\n${intro}\n\nالحالة: جاهز للإرسال\nالنظام: QNH TaskHub\n\nفتح TaskHub: ${context.taskHubUrl}\n\nهذه رسالة اختبار فنية ولا ترتبط بأي مهمة أو مؤشر أداء.`
    : `QNH TaskHub\n\nEmail delivery is connected\n${intro}\n\nStatus: Ready to send\nSystem: QNH TaskHub\n\nOpen TaskHub: ${context.taskHubUrl}\n\nThis technical test message is not linked to any task or KPI.`;

  return { subject, preheader, html, text };
}
