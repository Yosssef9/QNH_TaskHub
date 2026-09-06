import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getDatabasePool } from "../../database/sql.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PROCUREMENT_DB_OBJECTS } from "./procurement.config.js";

export type ProcurementSyncStep = "SUPPLIERS" | "ITEMS" | "TRANSACTIONS";
export type ProcurementSyncStatus = "COMPLETED" | "SKIPPED";
export type ProcurementSyncSkipReason = "DISABLED_BY_CONFIGURATION";

export interface ProcurementSyncResult {
  status: ProcurementSyncStatus;
  completedAtUtc: string;
  steps: ProcurementSyncStep[];
  skipReason?: ProcurementSyncSkipReason;
}

const steps: Array<{ step: ProcurementSyncStep; procedure: string }> = [
  { step: "SUPPLIERS", procedure: PROCUREMENT_DB_OBJECTS.supplierSyncProcedure },
  { step: "ITEMS", procedure: PROCUREMENT_DB_OBJECTS.itemSyncProcedure },
  { step: "TRANSACTIONS", procedure: PROCUREMENT_DB_OBJECTS.transactionSyncProcedure },
];

export const procurementSyncService = {
  async run(actorUserId: number): Promise<ProcurementSyncResult> {
    if (!env.PROCUREMENT_STARTUP_SYNC_ENABLED) {
      logger.warn(
        { actorUserId, reason: "DISABLED_BY_CONFIGURATION" },
        "Procurement startup synchronization skipped; existing SQL Server data will be used",
      );
      return {
        status: "SKIPPED",
        completedAtUtc: new Date().toISOString(),
        steps: [],
        skipReason: "DISABLED_BY_CONFIGURATION",
      };
    }

    const pool = await getDatabasePool();
    const completed: ProcurementSyncStep[] = [];
    try {
      for (const entry of steps) {
        await pool.request().query(`EXEC ${entry.procedure};`);
        completed.push(entry.step);
      }
      logger.info({ actorUserId, steps: completed }, "Procurement startup synchronization completed");
      return {
        status: "COMPLETED",
        completedAtUtc: new Date().toISOString(),
        steps: completed,
      };
    } catch (error) {
      logger.warn(
        { err: error, actorUserId, completedSteps: completed },
        "Procurement startup synchronization failed; existing SQL Server data remains available",
      );
      throw new AppError({
        statusCode: 503,
        code: "PROCUREMENT_SYNC_FAILED",
        message: "Procurement source synchronization could not be completed. Existing data remains available.",
      });
    }
  },
};
