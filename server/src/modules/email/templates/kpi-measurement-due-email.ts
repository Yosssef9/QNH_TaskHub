import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { formatEmailDate, infoPanel } from "./operational-email.helpers.js";

const schema = z.object({
  kpiTitle: z.string().min(1),
  cycleTitle: z.string().min(1),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysRemaining: z.number().int().min(0).max(3),
  href: z.string().min(1),
});

export function renderKpiMeasurementDueEmail(payload: Record<string, unknown>, language: EmailLanguage, context: EmailRenderContext): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const remaining = ar
    ? data.daysRemaining === 0 ? "تنتهي اليوم" : data.daysRemaining === 1 ? "متبقي يوم واحد" : `متبقي ${data.daysRemaining} أيام`
    : data.daysRemaining === 0 ? "Ends today" : data.daysRemaining === 1 ? "1 day remaining" : `${data.daysRemaining} days remaining`;
  const subject = ar ? `قياس مؤشر الأداء ما زال مطلوباً — ${data.kpiTitle}` : `KPI measurement is still required — ${data.kpiTitle}`;
  const preheader = ar ? `${remaining} على نهاية الفترة ولم يتم تسجيل القياس المطلوب.` : `${remaining} until the period ends and the required measurement has not been recorded.`;
  const intro = ar ? "تقترب الفترة الحالية من الانتهاء ولم يتم تسجيل القياس اليدوي لهذا المؤشر حتى الآن." : "The current reporting period is close to ending, but this KPI's manual measurement has not been recorded yet.";
  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: ar ? "قياس مطلوب" : "Measurement required",
    title: data.kpiTitle,
    intro,
    accent: "warning",
    bodyHtml: infoPanel([
      { label: ar ? "دورة العمل" : "Work Cycle", value: data.cycleTitle },
      { label: ar ? "نهاية الفترة" : "Period ends", value: formatEmailDate(data.periodEnd, language) },
      { label: ar ? "الوقت المتبقي" : "Time remaining", value: remaining },
    ], language),
    cta: { label: ar ? "إدخال القياس" : "Enter measurement", href: joinAbsoluteUrl(context.taskHubUrl, data.href) },
    footerNote: ar ? "لن يتم احتساب نتيجة نهائية للمؤشر حتى تتوفر البيانات المطلوبة." : "A final KPI result cannot be calculated until the required measurement is available.",
  });
  const text = ar
    ? `QNH TaskHub\n\nقياس مؤشر الأداء ما زال مطلوباً\n${data.kpiTitle}\nدورة العمل: ${data.cycleTitle}\nنهاية الفترة: ${formatEmailDate(data.periodEnd, language)}\n${remaining}\n\nإدخال القياس: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`
    : `QNH TaskHub\n\nKPI measurement is still required\n${data.kpiTitle}\nWork Cycle: ${data.cycleTitle}\nPeriod ends: ${formatEmailDate(data.periodEnd, language)}\n${remaining}\n\nEnter measurement: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`;
  return { subject, preheader, html, text };
}
