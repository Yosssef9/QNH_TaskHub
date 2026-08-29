import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { formatEmailDate, infoPanel } from "./operational-email.helpers.js";

const schema = z.object({
  taskTitle: z.string().min(1),
  contextTitle: z.string().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysOverdue: z.number().int().positive(),
  href: z.string().min(1),
});

export function renderTaskOverdueEmail(payload: Record<string, unknown>, language: EmailLanguage, context: EmailRenderContext): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const overdueText = ar
    ? data.daysOverdue === 1 ? "يوم واحد" : `${data.daysOverdue} أيام`
    : data.daysOverdue === 1 ? "1 day" : `${data.daysOverdue} days`;
  const subject = ar ? `مهمة متأخرة تحتاج إلى انتباهك — ${data.taskTitle}` : `Overdue task needs your attention — ${data.taskTitle}`;
  const preheader = ar ? `تأخرت المهمة ${overdueText} وما زالت مفتوحة.` : `This task is ${overdueText} overdue and is still open.`;
  const intro = ar
    ? `كان من المفترض إكمال هذه المهمة في ${formatEmailDate(data.dueDate, language)}، وما زالت تحتاج إلى إجراء.`
    : `This task was due on ${formatEmailDate(data.dueDate, language)} and still needs action.`;

  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: ar ? "مهمة متأخرة" : "Overdue task",
    title: data.taskTitle,
    intro,
    accent: "danger",
    bodyHtml: infoPanel([
      ...(data.contextTitle ? [{ label: ar ? "السياق" : "Context", value: data.contextTitle }] : []),
      { label: ar ? "تاريخ الاستحقاق" : "Due date", value: formatEmailDate(data.dueDate, language) },
      { label: ar ? "مدة التأخير" : "Overdue by", value: overdueText },
    ], language),
    cta: { label: ar ? "فتح المهمة" : "Open task", href: joinAbsoluteUrl(context.taskHubUrl, data.href) },
    footerNote: ar ? "يمكنك تعديل المهمة أو إكمالها مباشرة من TaskHub." : "Open TaskHub to update or complete this task.",
  });

  const text = ar
    ? `QNH TaskHub\n\nمهمة متأخرة تحتاج إلى انتباهك\n${data.taskTitle}\n${intro}\n${data.contextTitle ? `السياق: ${data.contextTitle}\n` : ""}تاريخ الاستحقاق: ${formatEmailDate(data.dueDate, language)}\nمدة التأخير: ${overdueText}\n\nفتح المهمة: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`
    : `QNH TaskHub\n\nOverdue task needs your attention\n${data.taskTitle}\n${intro}\n${data.contextTitle ? `Context: ${data.contextTitle}\n` : ""}Due date: ${formatEmailDate(data.dueDate, language)}\nOverdue by: ${overdueText}\n\nOpen task: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`;
  return { subject, preheader, html, text };
}
