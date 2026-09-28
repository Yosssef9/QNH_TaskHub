import os from "node:os";
import { emailRetryDelaySeconds } from "./email-retry.policy.js";
import { randomUUID } from "node:crypto";
import { meetingReportEmailService } from "../meeting-reports/meeting-report-email.service.js";

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
    case "MEETING_REQUEST_SUBMITTED":
    case "MEETING_REQUEST_UPDATED":
    case "MEETING_APPROVED":
    case "MEETING_REJECTED":
    case "MEETING_INVITED":
    case "MEETING_RESCHEDULED":
    case "MEETING_RESCHEDULE_REQUEST_CANCELLED":
    case "MEETING_CANCELLED":
    case "MEETING_SERIES_SCHEDULED":
    case "MEETING_ACTION_ITEM_ASSIGNED":
    case "MEETING_ACTION_ITEM_COMPLETED":
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

  try {
    await meetingReportEmailService.synchronize();
  } catch (error) {
    logger.error({ err: error }, "Meeting report dispatch scan failed; other email delivery continues");
  }

  const rows = await emailRepository.claimBatch(
    workerId,
    env.EMAIL_WORKER_BATCH_SIZE,
    env.EMAIL_PROCESSING_TIMEOUT_MINUTES,
    env.EMAIL_MAX_ATTEMPTS,
    "OTHER",
  );

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
      let renderPayload = payload;
      let recipientEmail = row.recipientEmail;
      let recipientName = row.recipientName;
      let language = asLanguage(row.languageCode);
      const operationalEvent = notificationTypeForTemplate(templateKey);

      if (operationalEvent && row.ownerUserId !== null) {
        const sendTime = await operationalEmailService.resolveSendTimeContext(
          row.ownerUserId,
          operationalEvent,
          payload,
        );
        if (!sendTime) {
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

        recipientEmail = sendTime.delivery.recipient.email;
        recipientName = sendTime.delivery.recipient.name;
        language = sendTime.delivery.language;
        renderPayload = sendTime.payload;
        await emailRepository.updateProcessingDelivery(
          Number(row.id),
          workerId,
          recipientEmail,
          recipientName,
          language,
        );
      }

      if (!recipientEmail) throw new Error("An email destination is required for this template.");
      const document = renderEmailTemplate(templateKey, renderPayload, language);
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
        emailRetryDelaySeconds(row.attemptCount),
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

  // PDF work is bounded and claimed one row at a time. Do not lease a whole batch
  // and leave its later rows waiting while earlier recipients are being rendered.
  let reportCount = 0;
  try {
    for (let index = 0; index < Math.min(env.EMAIL_WORKER_BATCH_SIZE, 5); index += 1) {
      if (!(await meetingReportEmailService.runtime()).automaticDeliveryEnabled) break;
      // A distinct token per claim prevents a restarted worker/PID from reusing an old lease.
      const leaseId = `${workerId.slice(0, 70)}:report:${randomUUID()}`;
      const [report] = await emailRepository.claimBatch(leaseId, 1,
        env.EMAIL_PROCESSING_TIMEOUT_MINUTES, env.EMAIL_MAX_ATTEMPTS, "REPORT");
      if (!report) break;
      const outcome = await meetingReportEmailService.process(report, leaseId);
      logger.info({ outboxId: Number(report.id), outcome }, "Meeting report email attempt completed");
      reportCount += 1;
    }
  } catch {
    // Do not log raw report/SMTP errors, which may contain report text or email addresses.
    logger.error("Meeting report email iteration failed; the outbox lease/retry state is retained");
  }
  return rows.length + reportCount;
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





