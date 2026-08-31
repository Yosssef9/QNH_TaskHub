import os from "node:os";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { emailRepository } from "./email.repository.js";
import { getEmailTransport } from "./email-transport.factory.js";
import { operationalEmailService } from "./operational-email.service.js";
import { notificationTypeForTemplate } from "./operational-email.policy.js";
import type { EmailLanguage, EmailTemplateKey } from "./email.types.js";
import { renderEmailTemplate } from "./templates/email-template.registry.js";

export interface EmailWorkerHandle {
  stop(): Promise<void>;
}

function retryDelaySeconds(attemptCount: number): number {
  if (attemptCount <= 1) return 60;
  if (attemptCount === 2) return 5 * 60;
  if (attemptCount === 3) return 30 * 60;
  return 2 * 60 * 60;
}

function parsePayload(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Email template payload must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function asTemplateKey(value: string): EmailTemplateKey {
  switch (value) {
    case "TEST":
    case "VERIFY_ALTERNATE_EMAIL":
    case "TASK_OVERDUE":
    case "TASK_DUE_TODAY":
    case "HIGH_PRIORITY_TASK_DUE_TOMORROW":
    case "CURRENT_CYCLE_ENDING_SOON":
    case "CURRENT_CYCLE_PAST_END":
    case "KPI_BELOW_TARGET":
    case "KPI_MEASUREMENT_DUE":
    case "CONTRACT_EXPIRATION_REMINDER":
    case "CONTRACT_NOTICE_DEADLINE_REMINDER":
      return value;
    default:
      throw new Error(`Unsupported email template key: ${value}`);
  }
}

function asLanguage(value: string): EmailLanguage {
  if (value === "ar" || value === "en") {
    return value;
  }
  throw new Error(`Unsupported email language: ${value}`);
}

export async function processEmailOutboxOnce(workerId: string): Promise<number> {
  if (!env.EMAIL_ENABLED) {
    return 0;
  }

  try {
    await operationalEmailService.synchronize();
  } catch (error) {
    logger.error({ err: error }, "Operational email synchronization failed; queued email delivery will continue");
  }

  const rows = await emailRepository.claimBatch(
    workerId,
    env.EMAIL_WORKER_BATCH_SIZE,
    env.EMAIL_PROCESSING_TIMEOUT_MINUTES,
    env.EMAIL_MAX_ATTEMPTS,
  );
  if (rows.length === 0) {
    return 0;
  }

  const transport = getEmailTransport();

  for (const row of rows) {
    try {
      const templateKey = asTemplateKey(row.templateKey);
      if (templateKey === "VERIFY_ALTERNATE_EMAIL") {
        throw new Error(
          "Verification-code emails cannot be persisted in the outbox because the code must not be stored in plaintext.",
        );
      }

      const payload = parsePayload(row.templatePayloadJson);
      let recipientEmail = row.recipientEmail;
      let recipientName = row.recipientName;
      let language = asLanguage(row.languageCode);
      const operationalEvent = notificationTypeForTemplate(templateKey);

      if (operationalEvent && row.ownerUserId !== null) {
        const delivery = await operationalEmailService.resolveSendTimeDelivery(
          row.ownerUserId,
          operationalEvent,
          payload,
        );
        if (!delivery) {
          await emailRepository.markCanceled(
            Number(row.id),
            workerId,
            "Canceled before delivery because the user's current email settings no longer allow this event.",
          );
          logger.info(
            { outboxId: Number(row.id), templateKey, ownerUserId: row.ownerUserId },
            "Operational email canceled after send-time preference check",
          );
          continue;
        }

        recipientEmail = delivery.recipient.email;
        recipientName = delivery.recipient.name;
        language = delivery.language;
        await emailRepository.updateProcessingDelivery(
          Number(row.id),
          workerId,
          recipientEmail,
          recipientName,
          language,
        );
      }

      const document = renderEmailTemplate(templateKey, payload, language);
      const sendResult = await transport.send({
        to: recipientEmail,
        ...(recipientName ? { toName: recipientName } : {}),
        subject: document.subject,
        html: document.html,
        text: document.text,
      });

      await emailRepository.markSent(Number(row.id), workerId, sendResult.messageId);
      logger.info(
        { outboxId: Number(row.id), templateKey, provider: sendResult.provider },
        "Email sent",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email processing failure";
      await emailRepository.markAttemptFailed(
        Number(row.id),
        workerId,
        row.attemptCount,
        env.EMAIL_MAX_ATTEMPTS,
        retryDelaySeconds(row.attemptCount),
        message,
      );
      logger.error(
        { err: error, outboxId: Number(row.id), templateKey: row.templateKey },
        row.attemptCount >= env.EMAIL_MAX_ATTEMPTS
          ? "Email moved to failed state"
          : "Email send failed and will be retried",
      );
    }
  }

  return rows.length;
}

export function startEmailWorker(): EmailWorkerHandle {
  if (!env.EMAIL_ENABLED || env.NODE_ENV === "test") {
    return { stop: async () => undefined };
  }

  const workerId = `${os.hostname()}:${process.pid}`.slice(0, 120);
  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await processEmailOutboxOnce(workerId);
    } catch (error) {
      logger.error({ err: error }, "Email worker iteration failed");
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick();
  }, env.EMAIL_WORKER_INTERVAL_MS);
  timer.unref();
  void tick();

  logger.info(
    {
      provider: env.EMAIL_PROVIDER,
      intervalMs: env.EMAIL_WORKER_INTERVAL_MS,
      batchSize: env.EMAIL_WORKER_BATCH_SIZE,
    },
    "Email worker started",
  );

  return {
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearInterval(timer);
      while (running) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
  };
}

