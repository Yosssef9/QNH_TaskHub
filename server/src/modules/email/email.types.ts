export type EmailLanguage = "ar" | "en";

export const OPERATIONAL_EMAIL_TEMPLATE_KEYS = [
  "TASK_OVERDUE",
  "TASK_DUE_TODAY",
  "HIGH_PRIORITY_TASK_DUE_TOMORROW",
  "CURRENT_CYCLE_ENDING_SOON",
  "CURRENT_CYCLE_PAST_END",
  "KPI_BELOW_TARGET",
  "KPI_MEASUREMENT_DUE",
  "CONTRACT_EXPIRATION_REMINDER",
  "CONTRACT_NOTICE_DEADLINE_REMINDER",
  "MEETING_REQUEST_SUBMITTED",
  "MEETING_REQUEST_UPDATED",
  "MEETING_APPROVED",
  "MEETING_REJECTED",
  "MEETING_INVITED",
  "MEETING_RESCHEDULED",
  "MEETING_RESCHEDULE_REQUEST_CANCELLED",
  "MEETING_CANCELLED",
] as const;

export type OperationalEmailTemplateKey = (typeof OPERATIONAL_EMAIL_TEMPLATE_KEYS)[number];
export type EmailTemplateKey = "TEST" | "VERIFY_ALTERNATE_EMAIL" | OperationalEmailTemplateKey;
export type QueueableEmailTemplateKey = Exclude<EmailTemplateKey, "VERIFY_ALTERNATE_EMAIL">;

export interface EmailTemplateDocument {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export interface EmailRenderContext {
  taskHubUrl: string;
  logoUrl: string;
}

export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  provider: string;
  messageId: string | null;
}

export interface QueueEmailInput {
  ownerUserId?: number | null;
  recipientEmail: string;
  recipientName?: string | null;
  language: EmailLanguage;
  templateKey: QueueableEmailTemplateKey;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

export interface SendEmailNowInput {
  recipientEmail: string;
  recipientName?: string | null;
  language: EmailLanguage;
  templateKey: EmailTemplateKey;
  payload: Record<string, unknown>;
}

export interface EmailOutboxRecord {
  id: number | string;
  ownerUserId: number | null;
  recipientEmail: string;
  recipientName: string | null;
  languageCode: EmailLanguage;
  templateKey: string;
  templatePayloadJson: string;
  attemptCount: number;
}

