import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { closeDatabasePool } from "./database/sql.js";
import { startEmailWorker } from "./modules/email/email-worker.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "QNH Task Management API started");
});

const emailWorker = startEmailWorker();
let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, "Shutting down API");

  server.close(async (serverError) => {
    try {
      await emailWorker.stop();
    } catch (emailWorkerError) {
      logger.error({ err: emailWorkerError }, "Failed to stop email worker cleanly");
    }

    try {
      await closeDatabasePool();
    } catch (databaseError) {
      logger.error({ err: databaseError }, "Failed to close SQL Server pool");
    }

    if (serverError) {
      logger.error({ err: serverError }, "HTTP server shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
