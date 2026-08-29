import type { NotificationType } from "../notifications/notifications.types.js";
import type { EmailTemplateKey, OperationalEmailTemplateKey } from "./email.types.js";

export function templateKeyForNotification(type: NotificationType): OperationalEmailTemplateKey {
  return type;
}

export function notificationTypeForTemplate(
  templateKey: EmailTemplateKey,
): NotificationType | null {
  switch (templateKey) {
    case "TASK_OVERDUE":
    case "TASK_DUE_TODAY":
    case "HIGH_PRIORITY_TASK_DUE_TOMORROW":
    case "CURRENT_CYCLE_ENDING_SOON":
    case "CURRENT_CYCLE_PAST_END":
    case "KPI_BELOW_TARGET":
    case "KPI_MEASUREMENT_DUE":
      return templateKey;
    case "TEST":
    case "VERIFY_ALTERNATE_EMAIL":
      return null;
    default:
      return null;
  }
}
