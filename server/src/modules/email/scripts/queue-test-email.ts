import "dotenv/config";
import crypto from "node:crypto";

import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import { closeDatabasePool } from "../../../database/sql.js";
import { emailService } from "../email.service.js";
import type { EmailLanguage } from "../email.types.js";

async function main(): Promise<void> {
  if (!env.EMAIL_TEST_RECIPIENT) {
    throw new Error("EMAIL_TEST_RECIPIENT must be configured before queueing a test email.");
  }

  const language: EmailLanguage = env.EMAIL_TEST_LANGUAGE;
  const dedupeKey = `TEST:${Date.now()}:${crypto.randomUUID()}`;
  const result = await emailService.queue({
    ownerUserId: null,
    recipientEmail: env.EMAIL_TEST_RECIPIENT,
    recipientName: env.EMAIL_TEST_RECIPIENT_NAME ?? null,
    language,
    templateKey: "TEST",
    payload: {
      ...(env.EMAIL_TEST_RECIPIENT_NAME
        ? { recipientDisplayName: env.EMAIL_TEST_RECIPIENT_NAME }
        : {}),
    },
    dedupeKey,
  });

  logger.info(
    { outboxId: result.id, inserted: result.inserted },
    "Test email queued. Keep the API running with EMAIL_ENABLED=true so the worker can send it.",
  );
}

main()
  .catch((error: unknown) => {
    logger.error({ err: error }, "Failed to queue test email");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabasePool();
  });
