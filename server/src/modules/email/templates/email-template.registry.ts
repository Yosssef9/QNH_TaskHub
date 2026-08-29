import { env } from "../../../config/env.js";
import type {
  EmailLanguage,
  EmailRenderContext,
  EmailTemplateDocument,
  EmailTemplateKey,
} from "../email.types.js";
import { normalizeAbsoluteUrl } from "./email-template.helpers.js";
import { renderCycleEndingSoonEmail } from "./cycle-ending-soon-email.js";
import { renderCyclePastEndEmail } from "./cycle-past-end-email.js";
import { renderHighPriorityTaskDueTomorrowEmail } from "./high-priority-task-due-tomorrow-email.js";
import { renderKpiBelowTargetEmail } from "./kpi-below-target-email.js";
import { renderKpiMeasurementDueEmail } from "./kpi-measurement-due-email.js";
import { renderTaskDueTodayEmail } from "./task-due-today-email.js";
import { renderTaskOverdueEmail } from "./task-overdue-email.js";
import { renderTestEmail } from "./test-email.js";
import { renderVerificationCodeEmail } from "./verification-code-email.js";

function getRenderContext(): EmailRenderContext {
  const taskHubUrl = normalizeAbsoluteUrl(env.TASKHUB_PUBLIC_URL);
  const logoUrl = env.EMAIL_LOGO_URL
    ? normalizeAbsoluteUrl(env.EMAIL_LOGO_URL)
    : "cid:qnh-taskhub-logo@qnhospital.com";

  return { taskHubUrl, logoUrl };
}

export function renderEmailTemplate(
  templateKey: EmailTemplateKey,
  payload: Record<string, unknown>,
  language: EmailLanguage,
): EmailTemplateDocument {
  const context = getRenderContext();

  switch (templateKey) {
    case "TEST":
      return renderTestEmail(payload, language, context);
    case "VERIFY_ALTERNATE_EMAIL":
      return renderVerificationCodeEmail(payload, language, context);
    case "TASK_OVERDUE":
      return renderTaskOverdueEmail(payload, language, context);
    case "TASK_DUE_TODAY":
      return renderTaskDueTodayEmail(payload, language, context);
    case "HIGH_PRIORITY_TASK_DUE_TOMORROW":
      return renderHighPriorityTaskDueTomorrowEmail(payload, language, context);
    case "CURRENT_CYCLE_ENDING_SOON":
      return renderCycleEndingSoonEmail(payload, language, context);
    case "CURRENT_CYCLE_PAST_END":
      return renderCyclePastEndEmail(payload, language, context);
    case "KPI_BELOW_TARGET":
      return renderKpiBelowTargetEmail(payload, language, context);
    case "KPI_MEASUREMENT_DUE":
      return renderKpiMeasurementDueEmail(payload, language, context);
  }
}
