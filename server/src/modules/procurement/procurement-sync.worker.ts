import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { procurementSyncService } from "./procurement-sync.service.js";

export interface ProcurementSyncWorkerHandle {
  stop(): Promise<void>;
}

export function startProcurementSyncWorker(): ProcurementSyncWorkerHandle {
  if (!env.PROCUREMENT_SYNC_ENABLED || env.NODE_ENV === "test") {
    return { stop: async () => undefined };
  }

  const intervalMs = env.PROCUREMENT_SYNC_INTERVAL_MINUTES * 60_000;
  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async (): Promise<void> => {
    if (stopped || running) return;

    running = true;
    try {
      await procurementSyncService.runWorkerOnce();
    } catch (error) {
      logger.error({ err: error }, "Procurement background worker iteration failed");
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref();

  if (env.PROCUREMENT_SYNC_RUN_ON_START) {
    void tick();
  }

  logger.info(
    {
      intervalMinutes: env.PROCUREMENT_SYNC_INTERVAL_MINUTES,
      runOnStart: env.PROCUREMENT_SYNC_RUN_ON_START,
      requestTimeoutMs: env.PROCUREMENT_SYNC_REQUEST_TIMEOUT_MS,
    },
    "Procurement background synchronization worker started",
  );

  return {
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearInterval(timer);

      while (running) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      await procurementSyncService.waitForIdle();
    },
  };
}
