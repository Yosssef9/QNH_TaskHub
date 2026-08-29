import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { formatEmailDate, infoPanel, progressPanel } from "./operational-email.helpers.js";

const schema = z.object({
  cycleTitle: z.string().min(1),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysRemaining: z.number().int().min(0).max(3),
  progressPercent: z.number().min(0).max(100),
  totalTasks: z.number().int().min(0),
  completedTasks: z.number().int().min(0),
  overdueTasks: z.number().int().min(0),
  kpiMet: z.number().int().min(0),
  kpiNotMet: z.number().int().min(0),
  kpiNoData: z.number().int().min(0),
  href: z.string().min(1),
});

export function renderCycleEndingSoonEmail(payload: Record<string, unknown>, language: EmailLanguage, context: EmailRenderContext): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const remaining = ar
    ? data.daysRemaining === 0 ? "اليوم" : data.daysRemaining === 1 ? "يوم واحد" : `${data.daysRemaining} أيام`
    : data.daysRemaining === 0 ? "today" : data.daysRemaining === 1 ? "1 day" : `${data.daysRemaining} days`;
  const subject = ar ? `دورة العمل الحالية تقترب من نهايتها — ${data.cycleTitle}` : `Current Work Cycle is ending soon — ${data.cycleTitle}`;
  const preheader = ar ? `متبقي ${remaining} على التاريخ المخطط لانتهاء الدورة.` : `${remaining} remaining until the planned Cycle end date.`;
  const intro = ar ? `اقترب التاريخ المخطط لانتهاء دورة العمل الحالية. إليك ملخص سريع لوضعها قبل الإغلاق.` : `The planned end date of your current Work Cycle is close. Here is a quick status summary before it closes.`;
  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: ar ? "دورة العمل الحالية" : "Current Work Cycle",
    title: data.cycleTitle,
    intro,
    accent: "warning",
    bodyHtml:
      progressPanel(data.progressPercent, language, ar ? "التقدم العام" : "Overall progress") +
      infoPanel([
        { label: ar ? "تاريخ الانتهاء" : "End date", value: formatEmailDate(data.endDate, language) },
        { label: ar ? "الوقت المتبقي" : "Time remaining", value: remaining },
      ], language),
    metrics: [
      { label: ar ? "المهام" : "Tasks", value: `${data.completedTasks}/${data.totalTasks}` },
      { label: ar ? "المتأخرة" : "Overdue", value: String(data.overdueTasks) },
      { label: ar ? "مؤشرات محققة" : "KPIs met", value: String(data.kpiMet) },
      { label: ar ? "دون الهدف" : "Below target", value: String(data.kpiNotMet) },
    ],
    cta: { label: ar ? "متابعة دورة العمل" : "Continue Work Cycle", href: joinAbsoluteUrl(context.taskHubUrl, data.href) },
    footerNote: ar ? `مؤشرات بدون بيانات حالياً: ${data.kpiNoData}.` : `KPIs currently without data: ${data.kpiNoData}.`,
  });
  const text = ar
    ? `QNH TaskHub\n\nدورة العمل الحالية تقترب من نهايتها\n${data.cycleTitle}\n${intro}\nتاريخ الانتهاء: ${formatEmailDate(data.endDate, language)}\nالوقت المتبقي: ${remaining}\nالتقدم: ${Math.round(data.progressPercent)}%\nالمهام: ${data.completedTasks}/${data.totalTasks}\nالمتأخرة: ${data.overdueTasks}\nمؤشرات محققة: ${data.kpiMet}\nدون الهدف: ${data.kpiNotMet}\nبدون بيانات: ${data.kpiNoData}\n\nمتابعة دورة العمل: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`
    : `QNH TaskHub\n\nCurrent Work Cycle is ending soon\n${data.cycleTitle}\n${intro}\nEnd date: ${formatEmailDate(data.endDate, language)}\nTime remaining: ${remaining}\nProgress: ${Math.round(data.progressPercent)}%\nTasks: ${data.completedTasks}/${data.totalTasks}\nOverdue: ${data.overdueTasks}\nKPIs met: ${data.kpiMet}\nBelow target: ${data.kpiNotMet}\nNo data: ${data.kpiNoData}\n\nContinue Work Cycle: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`;
  return { subject, preheader, html, text };
}
