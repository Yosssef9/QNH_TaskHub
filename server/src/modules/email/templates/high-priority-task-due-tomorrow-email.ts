import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { formatEmailDate, infoPanel } from "./operational-email.helpers.js";

const schema = z.object({
  taskTitle: z.string().min(1),
  contextTitle: z.string().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  href: z.string().min(1),
});

export function renderHighPriorityTaskDueTomorrowEmail(payload: Record<string, unknown>, language: EmailLanguage, context: EmailRenderContext): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const subject = ar ? `تذكير: مهمة عالية الأولوية مستحقة غداً — ${data.taskTitle}` : `Reminder: high-priority task due tomorrow — ${data.taskTitle}`;
  const preheader = ar ? "قد يكون من المناسب مراجعة هذه المهمة اليوم قبل موعدها غداً." : "Consider reviewing this high-priority task today before it is due tomorrow.";
  const intro = ar ? "لديك مهمة عالية الأولوية مستحقة غداً. مراجعتها اليوم تساعد على تجنب التأخير." : "You have a high-priority task due tomorrow. Reviewing it today can help prevent delay.";
  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: ar ? "أولوية عالية" : "High priority",
    title: data.taskTitle,
    intro,
    accent: "warning",
    bodyHtml: infoPanel([
      ...(data.contextTitle ? [{ label: ar ? "السياق" : "Context", value: data.contextTitle }] : []),
      { label: ar ? "الأولوية" : "Priority", value: ar ? "عالية" : "High" },
      { label: ar ? "تاريخ الاستحقاق" : "Due date", value: formatEmailDate(data.dueDate, language) },
    ], language),
    cta: { label: ar ? "مراجعة المهمة" : "Review task", href: joinAbsoluteUrl(context.taskHubUrl, data.href) },
  });
  const text = ar
    ? `QNH TaskHub\n\nمهمة عالية الأولوية مستحقة غداً\n${data.taskTitle}\n${intro}\n${data.contextTitle ? `السياق: ${data.contextTitle}\n` : ""}الأولوية: عالية\nتاريخ الاستحقاق: ${formatEmailDate(data.dueDate, language)}\n\nمراجعة المهمة: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`
    : `QNH TaskHub\n\nHigh-priority task due tomorrow\n${data.taskTitle}\n${intro}\n${data.contextTitle ? `Context: ${data.contextTitle}\n` : ""}Priority: High\nDue date: ${formatEmailDate(data.dueDate, language)}\n\nReview task: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`;
  return { subject, preheader, html, text };
}
