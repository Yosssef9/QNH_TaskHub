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
  daysRemaining: z.number().int().nonnegative(),
  href: z.string().min(1),
});

export function renderContractExpirationReminderEmail(
  payload: Record<string, unknown>,
  language: EmailLanguage,
  context: EmailRenderContext,
): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const subject = ar
    ? `عقد يقترب من الانتهاء — ${data.contractTitle}`
    : `Contract expiring soon — ${data.contractTitle}`;
  const preheader = ar
    ? `متبقي ${data.daysRemaining} يوم على تاريخ انتهاء العقد المسجل.`
    : `${data.daysRemaining} day(s) remain until the recorded Contract End Date.`;
  const intro = ar
    ? "راجع العقد وشروطه قبل تاريخ الانتهاء المسجل. TaskHub لا يقرر التجديد أو الإنهاء تلقائياً."
    : "Review the contract and its terms before the recorded End Date. TaskHub does not decide renewal or termination automatically.";
  const href = joinAbsoluteUrl(context.taskHubUrl, data.href);
  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: ar ? "تذكير بانتهاء العقد" : "Contract expiration reminder",
    title: data.contractTitle,
    intro,
    accent: "warning",
    bodyHtml: infoPanel([
      ...(data.contractNumber ? [{ label: ar ? "رقم العقد" : "Contract No.", value: data.contractNumber }] : []),
      { label: ar ? "المورد" : "Supplier", value: data.supplierName },
      { label: ar ? "تاريخ الانتهاء" : "End Date", value: formatEmailDate(data.endDate, language) },
      { label: ar ? "المدة المتبقية" : "Remaining", value: ar ? `${data.daysRemaining} يوم` : `${data.daysRemaining} day(s)` },
    ], language),
    cta: { label: ar ? "عرض العقد" : "View Contract", href },
  });
  const text = ar
    ? `QNH TaskHub\n\nتذكير بانتهاء العقد\n${data.contractTitle}\n${intro}\n${data.contractNumber ? `رقم العقد: ${data.contractNumber}\n` : ""}المورد: ${data.supplierName}\nتاريخ الانتهاء: ${formatEmailDate(data.endDate, language)}\nالمتبقي: ${data.daysRemaining} يوم\n\nعرض العقد: ${href}`
    : `QNH TaskHub\n\nContract expiration reminder\n${data.contractTitle}\n${intro}\n${data.contractNumber ? `Contract No.: ${data.contractNumber}\n` : ""}Supplier: ${data.supplierName}\nEnd Date: ${formatEmailDate(data.endDate, language)}\nRemaining: ${data.daysRemaining} day(s)\n\nView Contract: ${href}`;
  return { subject, preheader, html, text };
}
