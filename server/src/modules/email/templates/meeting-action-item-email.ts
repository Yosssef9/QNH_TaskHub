import { z } from "zod";
import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { joinAbsoluteUrl } from "./email-template.helpers.js";
import { infoPanel } from "./operational-email.helpers.js";

const schema = z.object({ taskTitle:z.string(), contextTitle:z.string().nullable(), href:z.string() });

export function renderMeetingActionItemEmail(templateKey: string, payload: Record<string, unknown>, language: EmailLanguage, context: EmailRenderContext): EmailTemplateDocument {
 const data=schema.parse(payload); const ar=language==="ar";
 const completed=templateKey==="MEETING_ACTION_ITEM_COMPLETED";
 const subject=completed ? (ar?`تم إكمال مهمة الاجتماع — ${data.taskTitle}`:`Meeting action item completed — ${data.taskTitle}`) : (ar?`تم تعيين مهمة اجتماع لك — ${data.taskTitle}`:`Meeting action item assigned — ${data.taskTitle}`);
 const intro=completed ? (ar?"تم إكمال مهمة الاجتماع.":"A meeting action item has been completed.") : (ar?"تم تعيين مهمة اجتماع جديدة لك.":"A new meeting action item has been assigned to you.");
 const html=renderEmailLayout({language,logoUrl:context.logoUrl,preheader:intro,eyebrow:"Meeting",title:data.taskTitle,intro,accent:"primary",bodyHtml:infoPanel(data.contextTitle?[{label:ar?"الاجتماع":"Meeting",value:data.contextTitle}]:[],language),cta:{label:ar?"فتح المهمة":"Open task",href:joinAbsoluteUrl(context.taskHubUrl,data.href)}});
 return {subject,preheader:intro,html,text:`QNH TaskHub\n\n${intro}\n${data.taskTitle}`};
}
