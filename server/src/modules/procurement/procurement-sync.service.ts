import os from "node:os";

import type { ConnectionPool } from "mssql";

import { databaseConfig } from "../../config/database.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { sql } from "../../database/sql.js";
import { PROCUREMENT_DB_OBJECTS } from "./procurement.config.js";
import {
  createRun,
  getSyncStatusRecord,
  markAbandonedRuns,
  markRunCompleted,
  markRunFailed,
  markStepCompleted,
  type ProcurementSyncRunStatus,
  type ProcurementSyncStep,
  type ProcurementSyncTrigger,
} from "./procurement-sync.repository.js";

const SYNC_LOCK_RESOURCE = "TaskHub:ProcurementSync";

const steps: Array<{ step: ProcurementSyncStep; procedure: string }> = [
  { step: "SUPPLIERS", procedure: PROCUREMENT_DB_OBJECTS.supplierSyncProcedure },
  { step: "ITEMS", procedure: PROCUREMENT_DB_OBJECTS.itemSyncProcedure },
  { step: "TRANSACTIONS", procedure: PROCUREMENT_DB_OBJECTS.transactionSyncProcedure },
];

export type ProcurementSyncRequestReason = "DISABLED" | "ALREADY_RUNNING";

export interface ProcurementSyncAttempt {
  id: number;
  status: ProcurementSyncRunStatus;
  triggerType: ProcurementSyncTrigger;
  startedAtUtc: string;
  finishedAtUtc: string | null;
  lastCompletedStep: ProcurementSyncStep | null;
  failedStep: ProcurementSyncStep | null;
  durationMs: number | null;
}

export interface ProcurementSyncStatusResult {
  enabled: boolean;
  isRunning: boolean;
  lastSuccessfulAtUtc: string | null;
  lastAttempt: ProcurementSyncAttempt | null;
}

export interface ProcurementSyncRequestResult {
  accepted: boolean;
  reason: ProcurementSyncRequestReason | null;
  runId: number | null;
}

interface ProcurementSyncRunOutcome {
  runId: number;
  status: "COMPLETED" | "FAILED";
  completedSteps: ProcurementSyncStep[];
  failedStep: ProcurementSyncStep | null;
}

interface StartedSync {
  started: true;
  runId: number;
  completion: Promise<ProcurementSyncRunOutcome>;
}

interface SkippedSync {
  started: false;
  reason: ProcurementSyncRequestReason;
}

type SyncStartResult = StartedSync | SkippedSync;

const activeRuns = new Set<Promise<ProcurementSyncRunOutcome>>();

function createDedicatedSyncPool(): ConnectionPool {
  return new sql.ConnectionPool({
    ...databaseConfig,
    requestTimeout: env.PROCUREMENT_SYNC_REQUEST_TIMEOUT_MS,
    pool: {
      max: 1,
      min: 1,
      idleTimeoutMillis: Math.max(30_000, env.PROCUREMENT_SYNC_REQUEST_TIMEOUT_MS),
    },
  });
}

async function acquireSyncLock(pool: ConnectionPool): Promise<boolean> {
  const result = await pool.request()
    .input("resource", sql.NVarChar(255), SYNC_LOCK_RESOURCE)
    .query<{ lockResult: number }>(`
      DECLARE @lockResult INT;

      EXEC @lockResult = sys.sp_getapplock
        @Resource = @resource,
        @LockMode = 'Exclusive',
        @LockOwner = 'Session',
        @LockTimeout = 0,
        @DbPrincipal = 'public';

      SELECT @lockResult AS lockResult;
    `);

  const lockResult = Number(result.recordset[0]?.lockResult ?? -999);
  if (lockResult >= 0) {
    return true;
  }

  if (lockResult === -1) {
    return false;
  }

  throw new Error(`Procurement synchronization application lock failed with code ${lockResult}.`);
}

async function releaseSyncLock(pool: ConnectionPool): Promise<void> {
  const result = await pool.request()
    .input("resource", sql.NVarChar(255), SYNC_LOCK_RESOURCE)
    .query<{ lockResult: number }>(`
      DECLARE @lockResult INT;

      EXEC @lockResult = sys.sp_releaseapplock
        @Resource = @resource,
        @LockOwner = 'Session',
        @DbPrincipal = 'public';

      SELECT @lockResult AS lockResult;
    `);

  const lockResult = Number(result.recordset[0]?.lockResult ?? -999);
  if (lockResult < 0) {
    logger.warn({ lockResult }, "Procurement synchronization application lock could not be released cleanly");
  }
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const value = String((error as { code?: unknown }).code ?? "").trim();
    if (value) return value.slice(0, 100);
  }

  if (error instanceof Error && error.name) {
    return error.name.slice(0, 100);
  }

  return "UNKNOWN";
}

function errorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.slice(0, 2000);
}

async function executeRun(
  pool: ConnectionPool,
  runId: number,
  triggerType: ProcurementSyncTrigger,
  requestedByUserId: number | null,
): Promise<ProcurementSyncRunOutcome> {
  const completedSteps: ProcurementSyncStep[] = [];
  let currentStep: ProcurementSyncStep | null = null;

  try {
    for (const entry of steps) {
      currentStep = entry.step;
      await pool.request().query(`EXEC ${entry.procedure};`);
      completedSteps.push(entry.step);
      await markStepCompleted(pool, runId, entry.step);
    }

    await markRunCompleted(pool, runId);
    logger.info(
      { runId, triggerType, requestedByUserId, steps: completedSteps },
      "Procurement background synchronization completed",
    );

    return {
      runId,
      status: "COMPLETED",
      completedSteps,
      failedStep: null,
    };
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);

    try {
      await markRunFailed(pool, runId, currentStep, code, message);
    } catch (historyError) {
      logger.error(
        { err: historyError, runId },
        "Procurement synchronization failure could not be persisted",
      );
    }

    logger.error(
      {
        err: error,
        runId,
        triggerType,
        requestedByUserId,
        completedSteps,
        failedStep: currentStep,
      },
      "Procurement background synchronization failed; existing SQL Server data remains available",
    );

    return {
      runId,
      status: "FAILED",
      completedSteps,
      failedStep: currentStep,
    };
  } finally {
    try {
      await releaseSyncLock(pool);
    } catch (lockError) {
      logger.warn({ err: lockError, runId }, "Procurement synchronization lock release failed");
    }

    try {
      await pool.close();
    } catch (closeError) {
      logger.warn({ err: closeError, runId }, "Dedicated Procurement synchronization pool close failed");
    }
  }
}

async function startRun(
  triggerType: ProcurementSyncTrigger,
  requestedByUserId: number | null,
): Promise<SyncStartResult> {
  if (!env.PROCUREMENT_SYNC_ENABLED) {
    return { started: false, reason: "DISABLED" };
  }

  const pool = createDedicatedSyncPool();
  let lockHeld = false;

  try {
    await pool.connect();

    lockHeld = await acquireSyncLock(pool);
    if (!lockHeld) {
      await pool.close();
      return { started: false, reason: "ALREADY_RUNNING" };
    }

    await markAbandonedRuns(pool);

    const workerId = `${os.hostname()}:${process.pid}`.slice(0, 160);
    const run = await createRun(pool, triggerType, requestedByUserId, workerId);

    const completion = executeRun(pool, run.id, triggerType, requestedByUserId);
    activeRuns.add(completion);
    void completion.then(
      () => activeRuns.delete(completion),
      () => activeRuns.delete(completion),
    );

    return {
      started: true,
      runId: run.id,
      completion,
    };
  } catch (error) {
    if (lockHeld) {
      try {
        await releaseSyncLock(pool);
      } catch (lockError) {
        logger.warn({ err: lockError }, "Procurement synchronization lock cleanup failed");
      }
    }

    try {
      await pool.close();
    } catch (closeError) {
      logger.warn({ err: closeError }, "Dedicated Procurement synchronization pool cleanup failed");
    }

    throw error;
  }
}

async function runWorkerOnce(): Promise<void> {
  const start = await startRun("WORKER", null);

  if (!start.started) {
    if (start.reason === "ALREADY_RUNNING") {
      logger.info("Procurement worker cycle skipped because another synchronization is already running");
    }
    return;
  }

  await start.completion;
}

async function requestManualRun(actorUserId: number): Promise<ProcurementSyncRequestResult> {
  const start = await startRun("MANUAL", actorUserId);

  if (!start.started) {
    return {
      accepted: false,
      reason: start.reason,
      runId: null,
    };
  }

  return {
    accepted: true,
    reason: null,
    runId: start.runId,
  };
}

async function getStatus(): Promise<ProcurementSyncStatusResult> {
  const record = await getSyncStatusRecord();

  const lastAttempt = record.lastAttemptId === null ||
      record.lastAttemptStatus === null ||
      record.lastAttemptTriggerType === null ||
      record.lastAttemptStartedAtUtc === null
    ? null
    : {
        id: Number(record.lastAttemptId),
        status: record.lastAttemptStatus,
        triggerType: record.lastAttemptTriggerType,
        startedAtUtc: record.lastAttemptStartedAtUtc.toISOString(),
        finishedAtUtc: record.lastAttemptFinishedAtUtc?.toISOString() ?? null,
        lastCompletedStep: record.lastAttemptLastCompletedStep,
        failedStep: record.lastAttemptFailedStep,
        durationMs: record.lastAttemptDurationMs === null
          ? null
          : Number(record.lastAttemptDurationMs),
      };

  return {
    enabled: env.PROCUREMENT_SYNC_ENABLED,
    isRunning: record.isRunning,
    lastSuccessfulAtUtc: record.lastSuccessfulAtUtc?.toISOString() ?? null,
    lastAttempt,
  };
}

async function waitForIdle(): Promise<void> {
  while (activeRuns.size > 0) {
    await Promise.allSettled([...activeRuns]);
  }
}

export const procurementSyncService = {
  runWorkerOnce,
  requestManualRun,
  getStatus,
  waitForIdle,
};
