import { createHmac, randomInt } from "node:crypto";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors/app-error.js";
import { emailService } from "../email/email.service.js";
import { NOTIFICATION_TYPES } from "../notifications/notifications.types.js";
import {
  EMAIL_EVENT_DEFAULTS,
  EMAIL_VERIFICATION_CODE_TTL_MINUTES,
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
} from "./email-settings.policy.js";
import {
  emailSettingsRepository,
  type EmailSettingsRecord,
} from "./email-settings.repository.js";
import type { UpdateEmailSettingsBody } from "./email-settings.schemas.js";
import type {
  EmailSettingsData,
  OperationalEmailDelivery,
  PendingEmailVerification,
  ResolvedEmailRecipient,
} from "./email-settings.types.js";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function maskEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  if (!domain) return "***";

  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, Math.min(6, local.length - visible.length)))}@${domain}`;
}

function verificationSecret(): string {
  if (!env.EMAIL_VERIFICATION_SECRET) {
    throw new AppError({
      statusCode: 503,
      code: "EMAIL_VERIFICATION_NOT_CONFIGURED",
      message: "Email verification is not configured.",
    });
  }

  return env.EMAIL_VERIFICATION_SECRET;
}

function verificationHash(ownerUserId: number, code: string): string {
  return createHmac("sha256", verificationSecret())
    .update(`${ownerUserId}:${code}`)
    .digest("hex");
}

function assertEmailSystemEnabled(): void {
  if (!env.EMAIL_ENABLED) {
    throw new AppError({
      statusCode: 503,
      code: "EMAIL_DELIVERY_DISABLED",
      message: "Email delivery is currently disabled.",
    });
  }
}

function getActiveEmail(record: EmailSettingsRecord): string | null {
  if (record.activeEmailSource === "ALTERNATE" && record.alternateVerifiedAtUtc) {
    return record.alternateEmail;
  }

  return record.portalEmail;
}

function getPendingVerification(
  record: EmailSettingsRecord,
): PendingEmailVerification | null {
  if (
    !record.pendingEmail ||
    !record.verificationExpiresAtUtc ||
    !record.resendAvailableAtUtc
  ) {
    return null;
  }

  return {
    maskedEmail: maskEmail(record.pendingEmail),
    expiresAtUtc: record.verificationExpiresAtUtc.toISOString(),
    resendAvailableAtUtc: record.resendAvailableAtUtc.toISOString(),
    attemptsRemaining: Math.max(
      0,
      EMAIL_VERIFICATION_MAX_ATTEMPTS - Number(record.verificationAttemptCount),
    ),
  };
}

async function getRequiredRecord(ownerUserId: number): Promise<EmailSettingsRecord> {
  const record = await emailSettingsRepository.getSettings(ownerUserId);

  if (!record) {
    throw new AppError({
      statusCode: 404,
      code: "PORTAL_USER_NOT_FOUND",
      message: "The authenticated Portal user could not be found.",
    });
  }

  return record;
}

async function buildSettings(ownerUserId: number): Promise<EmailSettingsData> {
  const [record, storedPreferences] = await Promise.all([
    getRequiredRecord(ownerUserId),
    emailSettingsRepository.listPreferences(ownerUserId),
  ]);
  const stored = new Map(storedPreferences.map((item) => [item.eventType, item.enabled]));
  const activeEmail = getActiveEmail(record);

  return {
    systemEnabled: env.EMAIL_ENABLED,
    notificationsEnabled: Boolean(record.notificationsEnabled),
    portalEmail: record.portalEmail,
    alternateEmail: record.alternateEmail,
    alternateVerified: record.alternateVerifiedAtUtc !== null,
    activeEmailSource: record.activeEmailSource,
    activeEmail,
    canEnableEmail: activeEmail !== null,
    preferences: NOTIFICATION_TYPES.map((eventType) => ({
      eventType,
      enabled: stored.get(eventType) ?? EMAIL_EVENT_DEFAULTS[eventType],
    })),
    pendingVerification: getPendingVerification(record),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "number" in error &&
    [2601, 2627].includes(Number((error as { number?: unknown }).number))
  );
}

async function requestVerification(
  ownerUserId: number,
  email: string,
  language: "ar" | "en",
): Promise<PendingEmailVerification> {
  assertEmailSystemEnabled();

  const current = await getRequiredRecord(ownerUserId);
  const normalized = normalizeEmail(email);

  if (current.portalEmail && normalizeEmail(current.portalEmail) === normalized) {
    throw new AppError({
      statusCode: 409,
      code: "ALTERNATE_EMAIL_EQUALS_PORTAL",
      message: "This address is already the Portal email for this account.",
    });
  }

  if (
    current.alternateEmailNormalized === normalized &&
    current.alternateVerifiedAtUtc !== null
  ) {
    throw new AppError({
      statusCode: 409,
      code: "ALTERNATE_EMAIL_ALREADY_VERIFIED",
      message: "This alternate email is already verified.",
    });
  }

  if (await emailSettingsRepository.isEmailUnavailableForOwner(ownerUserId, normalized)) {
    throw new AppError({
      statusCode: 409,
      code: "ALTERNATE_EMAIL_UNAVAILABLE",
      message: "This email address cannot be used for this account.",
    });
  }

  const code = String(randomInt(100000, 1000000));
  const codeHash = verificationHash(ownerUserId, code);

  let prepared;
  try {
    prepared = await emailSettingsRepository.prepareVerification(ownerUserId, {
      email: email.trim(),
      normalizedEmail: normalized,
      codeHash,
      expiresInMinutes: EMAIL_VERIFICATION_CODE_TTL_MINUTES,
      cooldownSeconds: EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      maxSendsPerHour: EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError({
        statusCode: 409,
        code: "ALTERNATE_EMAIL_UNAVAILABLE",
        message: "This email address cannot be used for this account.",
      });
    }

    throw error;
  }

  if (prepared.status === "COOLDOWN") {
    throw new AppError({
      statusCode: 429,
      code: "EMAIL_VERIFICATION_COOLDOWN",
      message: "Wait before requesting another verification email.",
      details: { retryAtUtc: prepared.retryAtUtc?.toISOString() ?? null },
    });
  }

  if (prepared.status === "RATE_LIMITED") {
    throw new AppError({
      statusCode: 429,
      code: "EMAIL_VERIFICATION_RATE_LIMITED",
      message: "Too many verification emails were requested. Try again later.",
      details: { retryAtUtc: prepared.retryAtUtc?.toISOString() ?? null },
    });
  }

  try {
    await emailService.sendNow({
      recipientEmail: email.trim(),
      recipientName: current.userName,
      language,
      templateKey: "VERIFY_ALTERNATE_EMAIL",
      payload: {
        code,
        expiresInMinutes: EMAIL_VERIFICATION_CODE_TTL_MINUTES,
      },
    });
  } catch (error) {
    await emailSettingsRepository.allowImmediateResend(ownerUserId, codeHash);
    logger.warn({ err: error, ownerUserId }, "Alternate email verification delivery failed");

    throw new AppError({
      statusCode: 503,
      code: "EMAIL_VERIFICATION_SEND_FAILED",
      message: "The verification email could not be sent right now.",
    });
  }

  if (!prepared.expiresAtUtc || !prepared.resendAvailableAtUtc) {
    throw new Error("Verification preparation did not return expiration timestamps.");
  }

  return {
    maskedEmail: maskEmail(email.trim()),
    expiresAtUtc: prepared.expiresAtUtc.toISOString(),
    resendAvailableAtUtc: prepared.resendAvailableAtUtc.toISOString(),
    attemptsRemaining: EMAIL_VERIFICATION_MAX_ATTEMPTS,
  };
}

async function resolveActiveRecipient(
  ownerUserId: number,
): Promise<ResolvedEmailRecipient | null> {
  const record = await getRequiredRecord(ownerUserId);
  const email = getActiveEmail(record);

  if (!email) return null;

  return {
    email,
    name: record.userName,
    source: record.activeEmailSource,
  };
}

async function resolveOperationalDelivery(
  ownerUserId: number,
  eventType: (typeof NOTIFICATION_TYPES)[number],
): Promise<OperationalEmailDelivery | null> {
  if (!env.EMAIL_ENABLED) return null;

  const [record, storedPreferences] = await Promise.all([
    getRequiredRecord(ownerUserId),
    emailSettingsRepository.listPreferences(ownerUserId),
  ]);

  if (!record.notificationsEnabled) return null;
  const stored = new Map(storedPreferences.map((item) => [item.eventType, item.enabled]));
  if (!(stored.get(eventType) ?? EMAIL_EVENT_DEFAULTS[eventType])) return null;

  const email = getActiveEmail(record);
  if (!email) return null;

  return {
    recipient: {
      email,
      name: record.userName,
      source: record.activeEmailSource,
    },
    language: record.languageCode === "EN" ? "en" : "ar",
  };
}

export const emailSettingsService = {
  get: buildSettings,

  async update(ownerUserId: number, input: UpdateEmailSettingsBody): Promise<EmailSettingsData> {
    const current = await getRequiredRecord(ownerUserId);

    if (input.activeEmailSource === "PORTAL" && !current.portalEmail) {
      throw new AppError({
        statusCode: 409,
        code: "PORTAL_EMAIL_UNAVAILABLE",
        message: "No Portal email address is available for this user.",
      });
    }

    if (
      input.activeEmailSource === "ALTERNATE" &&
      (!current.alternateEmail || !current.alternateVerifiedAtUtc)
    ) {
      throw new AppError({
        statusCode: 409,
        code: "ALTERNATE_EMAIL_NOT_VERIFIED",
        message: "Verify the alternate email before making it active.",
      });
    }

    const prospectiveSource = input.activeEmailSource ?? current.activeEmailSource;
    const prospectiveEmail =
      prospectiveSource === "ALTERNATE" && current.alternateVerifiedAtUtc
        ? current.alternateEmail
        : current.portalEmail;

    if (input.notificationsEnabled === true && !prospectiveEmail) {
      throw new AppError({
        statusCode: 409,
        code: "EMAIL_DESTINATION_REQUIRED",
        message: "Choose a valid email destination before enabling email notifications.",
      });
    }

    await emailSettingsRepository.updateSettings(ownerUserId, input);
    return buildSettings(ownerUserId);
  },

  requestVerification,

  async resendVerification(
    ownerUserId: number,
    language: "ar" | "en",
  ): Promise<PendingEmailVerification> {
    const current = await getRequiredRecord(ownerUserId);

    if (!current.pendingEmail) {
      throw new AppError({
        statusCode: 409,
        code: "EMAIL_VERIFICATION_NOT_PENDING",
        message: "There is no pending alternate email verification.",
      });
    }

    return requestVerification(ownerUserId, current.pendingEmail, language);
  },

  async verifyAlternate(ownerUserId: number, code: string): Promise<EmailSettingsData> {
    const result = await emailSettingsRepository.verifyCode(
      ownerUserId,
      verificationHash(ownerUserId, code),
      EMAIL_VERIFICATION_MAX_ATTEMPTS,
    );

    if (result.status === "VERIFIED") {
      return buildSettings(ownerUserId);
    }

    if (result.status === "INVALID") {
      throw new AppError({
        statusCode: 400,
        code: "EMAIL_VERIFICATION_CODE_INVALID",
        message: "The verification code is incorrect.",
        details: { attemptsRemaining: result.attemptsRemaining },
      });
    }

    if (result.status === "EXPIRED") {
      throw new AppError({
        statusCode: 410,
        code: "EMAIL_VERIFICATION_CODE_EXPIRED",
        message: "The verification code has expired.",
      });
    }

    if (result.status === "LOCKED") {
      throw new AppError({
        statusCode: 429,
        code: "EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED",
        message: "Too many incorrect codes were entered. Request a new code.",
      });
    }

    if (result.status === "CONFLICT") {
      throw new AppError({
        statusCode: 409,
        code: "ALTERNATE_EMAIL_UNAVAILABLE",
        message: "This email address cannot be used for this account.",
      });
    }

    throw new AppError({
      statusCode: 409,
      code: "EMAIL_VERIFICATION_NOT_PENDING",
      message: "There is no pending alternate email verification.",
    });
  },

  async deleteAlternate(ownerUserId: number): Promise<EmailSettingsData> {
    await emailSettingsRepository.deleteAlternate(ownerUserId);
    return buildSettings(ownerUserId);
  },

  resolveActiveRecipient,
  resolveOperationalDelivery,

  async sendTest(ownerUserId: number, language: "ar" | "en"): Promise<{ recipient: string }> {
    assertEmailSystemEnabled();

    const recipient = await resolveActiveRecipient(ownerUserId);
    if (!recipient) {
      throw new AppError({
        statusCode: 409,
        code: "EMAIL_DESTINATION_REQUIRED",
        message: "Choose a valid email destination before sending a test email.",
      });
    }

    try {
      await emailService.sendNow({
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        language,
        templateKey: "TEST",
        payload: { recipientDisplayName: recipient.name },
      });
    } catch (error) {
      logger.warn({ err: error, ownerUserId }, "TaskHub test email delivery failed");

      throw new AppError({
        statusCode: 503,
        code: "EMAIL_TEST_SEND_FAILED",
        message: "The test email could not be sent right now.",
      });
    }

    return { recipient: maskEmail(recipient.email) };
  },
};
