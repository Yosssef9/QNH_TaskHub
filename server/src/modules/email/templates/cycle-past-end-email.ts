import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { formatEmailDate, infoPanel, progressPanel } from "./operational-email.helpers.js";

const schema = z.object({
  cycleTitle: z.string().min(1),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysPastEnd: z.number().int().positive(),
  progressPercent: z.number().min(0).max(100),
  totalTasks: z.number().int().min(0),
  completedTasks: z.number().int().min(0),
  overdueTasks: z.number().int().min(0),
  kpiNotMet: z.number().int().min(0),
  kpiNoData: z.number().int().min(0),
  href: z.string().min(1),
});

export function renderCyclePastEndEmail(payload: Record<string, unknown>, language: EmailLanguage, context: EmailRenderContext): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const late = ar ? data.daysPastEnd === 1 ? "يوم واحد" : `${data.daysPastEnd} أيام` : data.daysPastEnd === 1 ? "1 day" : `${data.daysPastEnd} days`;
  const subject = ar ? `دورة العمل تجاوزت تاريخ الانتهاء وما زالت مفتوحة — ${data.cycleTitle}` : `Work Cycle passed its end date and is still open — ${data.cycleTitle}`;
  const preheader = ar ? `تجاوزت الدورة تاريخ الانتهاء المخطط منذ ${late}.` : `The Cycle passed its planned end date ${late} ago.`;
  const intro = ar ? "انتهى التاريخ المخطط للدورة وما زالت مفتوحة. راجع الأعمال المتبقية قبل إغلاقها أو تعديل الخطة." : "The planned end date has passed and the Cycle is still open. Review remaining work before closing it or adjusting the plan.";
  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: ar ? "تجاوز تاريخ الانتهاء" : "Past planned end date",
    title: data.cycleTitle,
    intro,
    accent: "danger",
    bodyHtml:
      progressPanel(data.progressPercent, language, ar ? "التقدم العام" : "Overall progress") +
      infoPanel([
        { label: ar ? "تاريخ الانتهاء المخطط" : "Planned end date", value: formatEmailDate(data.endDate, language) },
        { label: ar ? "التجاوز" : "Past due by", value: late },
      ], language),
    metrics: [
      { label: ar ? "المهام المفتوحة" : "Open tasks", value: String(Math.max(0, data.totalTasks - data.completedTasks)) },
      { label: ar ? "المهام المتأخرة" : "Overdue tasks", value: String(data.overdueTasks) },
      { label: ar ? "دون الهدف" : "Below target", value: String(data.kpiNotMet) },
      { label: ar ? "بدون بيانات" : "No data", value: String(data.kpiNoData) },
    ],
    cta: { label: ar ? "مراجعة دورة العمل" : "Review Work Cycle", href: joinAbsoluteUrl(context.taskHubUrl, data.href) },
  });
  const text = ar
    ? `QNH TaskHub\n\nدورة العمل تجاوزت تاريخ الانتهاء وما زالت مفتوحة\n${data.cycleTitle}\n${intro}\nتاريخ الانتهاء: ${formatEmailDate(data.endDate, language)}\nالتجاوز: ${late}\nالتقدم: ${Math.round(data.progressPercent)}%\nالمهام المفتوحة: ${Math.max(0, data.totalTasks - data.completedTasks)}\nالمتأخرة: ${data.overdueTasks}\nدون الهدف: ${data.kpiNotMet}\nبدون بيانات: ${data.kpiNoData}\n\nمراجعة الدورة: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`
    : `QNH TaskHub\n\nWork Cycle passed its end date and is still open\n${data.cycleTitle}\n${intro}\nPlanned end date: ${formatEmailDate(data.endDate, language)}\nPast due by: ${late}\nProgress: ${Math.round(data.progressPercent)}%\nOpen tasks: ${Math.max(0, data.totalTasks - data.completedTasks)}\nOverdue tasks: ${data.overdueTasks}\nBelow target: ${data.kpiNotMet}\nNo data: ${data.kpiNoData}\n\nReview Work Cycle: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`;
  return { subject, preheader, html, text };
}
