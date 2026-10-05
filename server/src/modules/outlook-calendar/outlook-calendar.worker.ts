import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { outlookCalendarService } from "./outlook-calendar.service.js";

export interface OutlookCalendarWorkerHandle { stop(): Promise<void>; }
export function startOutlookCalendarWorker(): OutlookCalendarWorkerHandle {
  if (!env.OUTLOOK_CALENDAR_SYNC_ENABLED || env.NODE_ENV === "test") return { stop: async () => undefined };
  let stopped = false; let running = false;
  const tick = async () => { if (stopped || running) return; running = true; try { await outlookCalendarService.runWorkerOnce(); } catch (error) { logger.error({ err: error }, "Outlook Calendar worker iteration failed"); } finally { running = false; } };
  const timer = setInterval(() => { void tick(); }, env.OUTLOOK_SYNC_WORKER_INTERVAL_MS); timer.unref(); void tick();
  logger.info({ intervalMs: env.OUTLOOK_SYNC_WORKER_INTERVAL_MS }, "Outlook Calendar synchronization worker started");
  return { async stop() { stopped = true; clearInterval(timer); while (running) await new Promise((resolve) => setTimeout(resolve, 25)); } };
}
