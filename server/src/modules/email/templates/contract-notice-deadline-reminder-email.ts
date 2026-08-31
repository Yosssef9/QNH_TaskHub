import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { formatEmailDate, infoPanel } from "./operational-email.helpers.js";

const schema = z.object({
  contractId: z.number().int().positive(),
  contractTitle: z.string().min(1),
  contractNumber: z.string().nullable(),
  supplierName: z.string().min(1),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  noticePeriodDays: z.number().int().positive(),
  noticeDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysRemaining: z.number().int().nonnegative(),
  href: z.string().min(1),
});

export function renderContractNoticeDeadlineReminderEmail(
  payload: Record<string, unknown>,
  language: EmailLanguage,
  context: EmailRenderContext,
): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const subject = ar
    ? `موعد إشعار عقد يقترب — ${data.contractTitle}`
    : `Contract notice deadline approaching — ${data.contractTitle}`;
  const preheader = ar
    ? `متبقي ${data.daysRemaining} يوم على موعد الإشعار المسجل.`
    : `${data.daysRemaining} day(s) remain before the recorded Notice Deadline.`;
  const intro = ar
    ? "راجع شروط العقد واتخذ أي إجراء مطلوب قبل موعد الإشعار المسجل. TaskHub يعرض التاريخ المسجل ولا يقرر النتيجة القانونية للعقد."
    : "Review the contract terms and take any required action before the recorded Notice Deadline. TaskHub tracks the recorded date and does not determine the legal outcome of the contract.";
  const href = joinAbsoluteUrl(context.taskHubUrl, data.href);
  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: ar ? "تذكير بموعد إشعار العقد" : "Contract notice reminder",
    title: data.contractTitle,
    intro,
    accent: "warning",
    bodyHtml: infoPanel([
      ...(data.contractNumber ? [{ label: ar ? "رقم العقد" : "Contract No.", value: data.contractNumber }] : []),
      { label: ar ? "المورد" : "Supplier", value: data.supplierName },
      { label: ar ? "تاريخ الانتهاء" : "End Date", value: formatEmailDate(data.endDate, language) },
      { label: ar ? "فترة الإشعار" : "Notice Period", value: ar ? `${data.noticePeriodDays} يوم` : `${data.noticePeriodDays} day(s)` },
      { label: ar ? "موعد الإشعار" : "Notice Deadline", value: formatEmailDate(data.noticeDeadline, language) },
      { label: ar ? "المدة المتبقية" : "Remaining", value: ar ? `${data.daysRemaining} يوم` : `${data.daysRemaining} day(s)` },
    ], language),
    cta: { label: ar ? "عرض العقد" : "View Contract", href },
  });
  const text = ar
    ? `QNH TaskHub\n\nتذكير بموعد إشعار العقد\n${data.contractTitle}\n${intro}\n${data.contractNumber ? `رقم العقد: ${data.contractNumber}\n` : ""}المورد: ${data.supplierName}\nتاريخ الانتهاء: ${formatEmailDate(data.endDate, language)}\nفترة الإشعار: ${data.noticePeriodDays} يوم\nموعد الإشعار: ${formatEmailDate(data.noticeDeadline, language)}\nالمتبقي: ${data.daysRemaining} يوم\n\nعرض العقد: ${href}`
    : `QNH TaskHub\n\nContract notice reminder\n${data.contractTitle}\n${intro}\n${data.contractNumber ? `Contract No.: ${data.contractNumber}\n` : ""}Supplier: ${data.supplierName}\nEnd Date: ${formatEmailDate(data.endDate, language)}\nNotice Period: ${data.noticePeriodDays} day(s)\nNotice Deadline: ${formatEmailDate(data.noticeDeadline, language)}\nRemaining: ${data.daysRemaining} day(s)\n\nView Contract: ${href}`;
  return { subject, preheader, html, text };
}
