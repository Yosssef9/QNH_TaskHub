import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { formatEmailDate, kpiComparisonPanel } from "./operational-email.helpers.js";

const schema = z.object({
  kpiTitle: z.string().min(1),
  cycleTitle: z.string().min(1),
  actualValue: z.number(),
  targetValue: z.number(),
  measurementUnit: z.enum(["PERCENT", "NUMBER"]),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  href: z.string().min(1),
});

export function renderKpiBelowTargetEmail(payload: Record<string, unknown>, language: EmailLanguage, context: EmailRenderContext): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const subject = ar ? `مؤشر أداء دون الهدف — ${data.kpiTitle}` : `KPI below target — ${data.kpiTitle}`;
  const preheader = ar ? "النتيجة الحالية للمؤشر أقل من الهدف المحدد للفترة الحالية." : "The KPI's current result is below its target for the current period.";
  const intro = ar ? `يحتاج مؤشر «${data.kpiTitle}» إلى مراجعة ضمن دورة «${data.cycleTitle}».` : `The KPI “${data.kpiTitle}” needs review in the “${data.cycleTitle}” Work Cycle.`;
  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: ar ? "مؤشر دون الهدف" : "KPI below target",
    title: data.kpiTitle,
    intro,
    accent: "danger",
    bodyHtml: kpiComparisonPanel({
      actual: data.actualValue,
      target: data.targetValue,
      unit: data.measurementUnit,
      language,
    }),
    metrics: [
      { label: ar ? "دورة العمل" : "Work Cycle", value: data.cycleTitle },
      { label: ar ? "نهاية الفترة" : "Period ends", value: formatEmailDate(data.periodEnd, language) },
    ],
    cta: { label: ar ? "فتح المؤشر" : "Open KPI", href: joinAbsoluteUrl(context.taskHubUrl, data.href) },
    footerNote: ar ? "يعرض TaskHub أحدث نتيجة محسوبة للفترة الحالية." : "TaskHub shows the latest calculated result for the current period.",
  });
  const text = ar
    ? `QNH TaskHub\n\nمؤشر أداء دون الهدف\n${data.kpiTitle}\nدورة العمل: ${data.cycleTitle}\nالنتيجة الحالية: ${data.actualValue}${data.measurementUnit === "PERCENT" ? "%" : ""}\nالهدف: ${data.targetValue}${data.measurementUnit === "PERCENT" ? "%" : ""}\nنهاية الفترة: ${formatEmailDate(data.periodEnd, language)}\n\nفتح المؤشر: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`
    : `QNH TaskHub\n\nKPI below target\n${data.kpiTitle}\nWork Cycle: ${data.cycleTitle}\nCurrent result: ${data.actualValue}${data.measurementUnit === "PERCENT" ? "%" : ""}\nTarget: ${data.targetValue}${data.measurementUnit === "PERCENT" ? "%" : ""}\nPeriod ends: ${formatEmailDate(data.periodEnd, language)}\n\nOpen KPI: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`;
  return { subject, preheader, html, text };
}
