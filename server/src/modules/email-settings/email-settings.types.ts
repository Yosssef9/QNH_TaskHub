import type { NotificationType } from "../notifications/notifications.types.js";

export type EmailAddressSource = "PORTAL" | "ALTERNATE";
export type EmailPreferenceEvent = NotificationType;

export interface EmailEventPreference {
  eventType: EmailPreferenceEvent;
  enabled: boolean;
}

export interface PendingEmailVerification {
  maskedEmail: string;
  expiresAtUtc: string;
  resendAvailableAtUtc: string;
  attemptsRemaining: number;
}

export interface EmailSettingsData {
  systemEnabled: boolean;
  notificationsEnabled: boolean;
  portalEmail: string | null;
  alternateEmail: string | null;
  alternateVerified: boolean;
  activeEmailSource: EmailAddressSource;
  activeEmail: string | null;
  canEnableEmail: boolean;
  preferences: EmailEventPreference[];
  pendingVerification: PendingEmailVerification | null;
}

export interface ResolvedEmailRecipient {
  email: string;
  name: string;
  source: EmailAddressSource;
}

export interface OperationalEmailDelivery {
  recipient: ResolvedEmailRecipient;
  language: "ar" | "en";
}
