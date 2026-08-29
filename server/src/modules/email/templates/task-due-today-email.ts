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

export function renderTaskDueTodayEmail(payload: Record<string, unknown>, language: EmailLanguage, context: EmailRenderContext): EmailTemplateDocument {
  const data = schema.parse(payload);
  const ar = language === "ar";
  const subject = ar ? `مهمة مستحقة اليوم — ${data.taskTitle}` : `Task due today — ${data.taskTitle}`;
  const preheader = ar ? "لديك مهمة مفتوحة يصل تاريخ استحقاقها اليوم." : "You have an open task due today.";
  const intro = ar ? "هذه المهمة مستحقة اليوم. راجعها الآن إذا كانت ما زالت تحتاج إلى متابعة." : "This task is due today. Review it now if it still needs your attention.";
  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: ar ? "مستحقة اليوم" : "Due today",
    title: data.taskTitle,
    intro,
    accent: "primary",
    bodyHtml: infoPanel([
      ...(data.contextTitle ? [{ label: ar ? "السياق" : "Context", value: data.contextTitle }] : []),
      { label: ar ? "تاريخ الاستحقاق" : "Due date", value: formatEmailDate(data.dueDate, language) },
    ], language),
    cta: { label: ar ? "مراجعة المهمة" : "Review task", href: joinAbsoluteUrl(context.taskHubUrl, data.href) },
  });
  const text = ar
    ? `QNH TaskHub\n\nمهمة مستحقة اليوم\n${data.taskTitle}\n${intro}\n${data.contextTitle ? `السياق: ${data.contextTitle}\n` : ""}تاريخ الاستحقاق: ${formatEmailDate(data.dueDate, language)}\n\nمراجعة المهمة: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`
    : `QNH TaskHub\n\nTask due today\n${data.taskTitle}\n${intro}\n${data.contextTitle ? `Context: ${data.contextTitle}\n` : ""}Due date: ${formatEmailDate(data.dueDate, language)}\n\nReview task: ${joinAbsoluteUrl(context.taskHubUrl, data.href)}`;
  return { subject, preheader, html, text };
}
