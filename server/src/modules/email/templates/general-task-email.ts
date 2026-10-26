import { z } from "zod";
import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { formatEmailDate, infoPanel } from "./operational-email.helpers.js";

const schema = z.object({
  taskTitle: z.string().optional(),
  subtaskTitle: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  href: z.string().optional(),
  notice: z.string().optional(),
  assignedByName: z.string().optional(),
  senderName: z.string().optional(),
  messagePreview: z.string().optional(),
});

const WORDING: Record<string, { en: [string, string]; ar: [string, string] }> = {
  TASK_DISCUSSION_MESSAGE: {en:['New task message','Someone posted in a task discussion.'],ar:['رسالة في نقاش المهمة','تمت إضافة رسالة جديدة إلى نقاش المهمة.']},
  TASK_DISCUSSION_MENTION: {en:['You were mentioned in a task','A teammate mentioned you in a task discussion.'],ar:['تمت الإشارة إليك في مهمة','أشار إليك أحد الزملاء في نقاش المهمة.']},
  TASK_SHARED: {en:['Task shared with you','A task has been shared with you.'],ar:['تمت مشاركة مهمة معك','تمت مشاركة مهمة جديدة معك.']},
  TASK_SHARE_UPDATED: {en:['Task access updated','Your access to a shared task has changed.'],ar:['تحديث صلاحية المهمة','تم تغيير صلاحياتك للمهمة المشتركة.']},
  TASK_SHARE_REVOKED: {en:['Task access removed','Access to a previously shared task has been removed.'],ar:['إلغاء مشاركة المهمة','تم إلغاء صلاحية الوصول إلى مهمة مشتركة.']},
  GENERAL_TASK_ASSIGNED: {
    en: ["New task assigned", "A new main task was assigned to you."],
    ar: ["تم إسناد مهمة جديدة", "تم إسناد مهمة رئيسية جديدة إليك."],
  },
  GENERAL_SUBTASK_ASSIGNED: {
    en: ["New subtask assigned", "A new subtask was assigned to you."],
    ar: ["تم إسناد مهمة فرعية", "تم إسناد مهمة فرعية جديدة إليك."],
  },
  GENERAL_ASSIGNMENT_REMOVED: {
    en: ["Assignment removed", "A previous task or subtask assignment was removed from your workload. Task details are no longer included."],
    ar: ["تم إلغاء إسناد", "تم نقل إسناد مهمة أو مهمة فرعية من قائمة مسؤولياتك. لا تظهر تفاصيل العمل بعد سحب الصلاحية."],
  },
  GENERAL_TASK_DUE_CHANGED: {
    en: ["Task due date changed", "The due date of a task assigned to you has changed."],
    ar: ["تغيير موعد مهمة", "تم تغيير تاريخ استحقاق مهمة مسندة إليك."],
  },
  GENERAL_SUBTASK_DUE_CHANGED: {
    en: ["Subtask due date changed", "The due date of your assigned subtask has changed."],
    ar: ["تغيير موعد مهمة فرعية", "تم تغيير تاريخ استحقاق مهمة فرعية مسندة إليك."],
  },
  GENERAL_TASK_COMPLETED: {
    en: ["Main task completed", "The main task has been completed."],
    ar: ["اكتمال المهمة الرئيسية", "تم إنجاز المهمة الرئيسية."],
  },
  GENERAL_TASK_REOPENED: {
    en: ["Main task reopened", "The main task has been reopened and requires attention."],
    ar: ["إعادة فتح المهمة", "تمت إعادة فتح المهمة الرئيسية وهي تحتاج إلى المتابعة."],
  },
};

export function renderGeneralTaskEmail(
  templateKey: string,
  payload: Record<string, unknown>,
  language: EmailLanguage,
  context: EmailRenderContext,
): EmailTemplateDocument {
  const wording = WORDING[templateKey];
  if (!wording) throw new Error(`Unsupported general task email: ${templateKey}`);
  const [heading, intro] = language === "ar" ? wording.ar : wording.en;
  const ar = language === "ar";
  const data = schema.parse(payload);
  const removed = templateKey === "GENERAL_ASSIGNMENT_REMOVED" || templateKey === "TASK_SHARE_REVOKED";
  const title = removed ? heading : data.taskTitle ?? heading;
  const rows = removed ? [] : [
    ...(data.assignedByName ? [{ label: ar ? 'أسندها' : 'Assigned by', value: data.assignedByName }] : []),
    ...(templateKey==='TASK_DISCUSSION_MENTION'&&data.senderName ? [{label:ar?'أشار إليك':'Mentioned by',value:data.senderName}]:[]),
    ...(templateKey==='TASK_DISCUSSION_MENTION'&&data.messagePreview ? [{label:ar?'الرسالة':'Message',value:data.messagePreview}]:[]),
    ...(data.subtaskTitle ? [{ label: ar ? "المهمة الفرعية" : "Your subtask", value: data.subtaskTitle }] : []),
    ...(data.dueDate !== undefined ? [{ label: ar ? "تاريخ الاستحقاق" : "Due date",
      value: data.dueDate ? formatEmailDate(data.dueDate, language) : ar ? "بدون موعد" : "No due date" }] : []),
  ];
  const href = !removed && data.href ? joinAbsoluteUrl(context.taskHubUrl, data.href) : null;
  const html = renderEmailLayout({
    language, logoUrl: context.logoUrl, preheader: intro,
    eyebrow: ar ? "مهام TaskHub" : "TaskHub assignments",
    title, intro,
    accent: templateKey === "GENERAL_TASK_COMPLETED" ? "success" : "primary",
    ...(rows.length ? { bodyHtml: infoPanel(rows, language) } : {}),
    ...(href ? { cta: { label: ar ? "فتح المهمة" : "Open task", href } } : {}),
  });
  const subject = removed ? heading : `${heading} — ${title}`;
  const text = `QNH TaskHub\n\n${intro}\n${title}` +
    (data.assignedByName && !removed ? `
${ar ? 'أسندها' : 'Assigned by'}: ${data.assignedByName}` : '') +
    (templateKey==='TASK_DISCUSSION_MENTION'&&data.senderName ? `
${ar?'أشار إليك':'Mentioned by'}: ${data.senderName}`:'') +
    (templateKey==='TASK_DISCUSSION_MENTION'&&data.messagePreview ? `
${ar?'الرسالة':'Message'}: ${data.messagePreview}`:'') +
    (data.subtaskTitle && !removed ? `\n${ar ? "المهمة الفرعية" : "Subtask"}: ${data.subtaskTitle}` : "") +
    (data.dueDate !== undefined && !removed ? `\n${ar ? "الموعد" : "Due date"}: ${data.dueDate ?? "-"}` : "") +
    (href ? `\n\n${href}` : "");
  return { subject, preheader: intro, html, text };
}



