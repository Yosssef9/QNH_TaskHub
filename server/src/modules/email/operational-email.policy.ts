import type { NotificationType } from "../notifications/notifications.types.js";
import type { EmailTemplateKey, OperationalEmailTemplateKey } from "./email.types.js";

export function templateKeyForNotification(type: NotificationType): OperationalEmailTemplateKey {
  if (type === "MEETING_START_REMINDER") {
    throw new Error("Meeting start reminders are in-app only and do not have an email template.");
  }
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
    case "CONTRACT_EXPIRATION_REMINDER":
    case "CONTRACT_NOTICE_DEADLINE_REMINDER":
    case "MEETING_REQUEST_SUBMITTED":
    case "MEETING_REQUEST_UPDATED":
    case "MEETING_APPROVED":
    case "MEETING_REJECTED":
    case "MEETING_INVITED":
    case "MEETING_RESCHEDULED":
    case "MEETING_RESCHEDULE_REQUEST_CANCELLED":
    case "MEETING_CANCELLED":
      return templateKey;
    case "TEST":
    case "VERIFY_ALTERNATE_EMAIL":
      return null;
    default:
      return null;
  }
}

export function isContractNotificationType(
  type: NotificationType,
): type is "CONTRACT_EXPIRATION_REMINDER" | "CONTRACT_NOTICE_DEADLINE_REMINDER" {
  return type === "CONTRACT_EXPIRATION_REMINDER" || type === "CONTRACT_NOTICE_DEADLINE_REMINDER";
}

