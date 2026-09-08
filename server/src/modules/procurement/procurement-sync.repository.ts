import type { ConnectionPool } from "mssql";

import { getDatabasePool, sql } from "../../database/sql.js";

export type ProcurementSyncStep = "SUPPLIERS" | "ITEMS" | "TRANSACTIONS";
export type ProcurementSyncRunStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type ProcurementSyncTrigger = "WORKER" | "MANUAL";

export interface ProcurementSyncRunRecord {
  id: number | string;
  triggerType: ProcurementSyncTrigger;
  requestedByUserId: number | null;
  status: ProcurementSyncRunStatus;
  startedAtUtc: Date;
  finishedAtUtc: Date | null;
  lastCompletedStep: ProcurementSyncStep | null;
  failedStep: ProcurementSyncStep | null;
  durationMs: number | string | null;
}

export interface ProcurementSyncStatusRecord {
  isRunning: boolean;
  lastAttemptId: number | string | null;
  lastAttemptTriggerType: ProcurementSyncTrigger | null;
  lastAttemptStatus: ProcurementSyncRunStatus | null;
  lastAttemptStartedAtUtc: Date | null;
  lastAttemptFinishedAtUtc: Date | null;
  lastAttemptLastCompletedStep: ProcurementSyncStep | null;
  lastAttemptFailedStep: ProcurementSyncStep | null;
  lastAttemptDurationMs: number | string | null;
  lastSuccessfulAtUtc: Date | null;
}

export async function markAbandonedRuns(pool: ConnectionPool): Promise<void> {
  await pool.request().query(`
    UPDATE dbo.TM_procurement_sync_runs
    SET status = 'FAILED',
        finished_at_utc = SYSUTCDATETIME(),
        duration_ms = DATEDIFF_BIG(MILLISECOND, started_at_utc, SYSUTCDATETIME()),
        error_code = N'ABANDONED_RUN',
        error_message = N'The previous synchronization did not finish before its worker stopped.'
    WHERE status = 'RUNNING';
  `);
}

export async function createRun(
  pool: ConnectionPool,
  triggerType: ProcurementSyncTrigger,
  requestedByUserId: number | null,
  workerId: string,
): Promise<{ id: number; startedAtUtc: Date }> {
  const result = await pool.request()
    .input("triggerType", sql.VarChar(20), triggerType)
    .input("requestedByUserId", sql.Int, requestedByUserId)
    .input("workerId", sql.NVarChar(160), workerId)
    .query<{ id: number | string; startedAtUtc: Date }>(`
      INSERT INTO dbo.TM_procurement_sync_runs (
        trigger_type,
        requested_by_user_id,
        worker_id,
        status
      )
      OUTPUT
        INSERTED.id,
        INSERTED.started_at_utc AS startedAtUtc
      VALUES (
        @triggerType,
        @requestedByUserId,
        @workerId,
        'RUNNING'
      );
    `);

  const row = result.recordset[0];
  if (!row) {
    throw new Error("Procurement synchronization run could not be created.");
  }

  return {
    id: Number(row.id),
    startedAtUtc: row.startedAtUtc,
  };
}

export async function markStepCompleted(
  pool: ConnectionPool,
  runId: number,
  step: ProcurementSyncStep,
): Promise<void> {
  await pool.request()
    .input("runId", sql.BigInt, runId)
    .input("step", sql.VarChar(20), step)
    .query(`
      UPDATE dbo.TM_procurement_sync_runs
      SET last_completed_step = @step
      WHERE id = @runId
        AND status = 'RUNNING';
    `);
}

export async function markRunCompleted(
  pool: ConnectionPool,
  runId: number,
): Promise<void> {
  await pool.request()
    .input("runId", sql.BigInt, runId)
    .query(`
      UPDATE dbo.TM_procurement_sync_runs
      SET status = 'COMPLETED',
          finished_at_utc = SYSUTCDATETIME(),
          duration_ms = DATEDIFF_BIG(MILLISECOND, started_at_utc, SYSUTCDATETIME()),
          failed_step = NULL,
          error_code = NULL,
          error_message = NULL
      WHERE id = @runId
        AND status = 'RUNNING';
    `);
}

export async function markRunFailed(
  pool: ConnectionPool,
  runId: number,
  failedStep: ProcurementSyncStep | null,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await pool.request()
    .input("runId", sql.BigInt, runId)
    .input("failedStep", sql.VarChar(20), failedStep)
    .input("errorCode", sql.NVarChar(100), errorCode)
    .input("errorMessage", sql.NVarChar(2000), errorMessage)
    .query(`
      UPDATE dbo.TM_procurement_sync_runs
      SET status = 'FAILED',
          finished_at_utc = SYSUTCDATETIME(),
          duration_ms = DATEDIFF_BIG(MILLISECOND, started_at_utc, SYSUTCDATETIME()),
          failed_step = @failedStep,
          error_code = @errorCode,
          error_message = @errorMessage
      WHERE id = @runId
        AND status = 'RUNNING';
    `);
}

export async function getSyncStatusRecord(): Promise<ProcurementSyncStatusRecord> {
  const pool = await getDatabasePool();
  const result = await pool.request().query<ProcurementSyncStatusRecord>(`
    SELECT
      CAST(
        CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.TM_procurement_sync_runs
          WHERE status = 'RUNNING'
        ) THEN 1 ELSE 0 END
        AS BIT
      ) AS isRunning,

      latest.id AS lastAttemptId,
      latest.trigger_type AS lastAttemptTriggerType,
      latest.status AS lastAttemptStatus,
      latest.started_at_utc AS lastAttemptStartedAtUtc,
      latest.finished_at_utc AS lastAttemptFinishedAtUtc,
      latest.last_completed_step AS lastAttemptLastCompletedStep,
      latest.failed_step AS lastAttemptFailedStep,
      latest.duration_ms AS lastAttemptDurationMs,

      successful.finished_at_utc AS lastSuccessfulAtUtc
    FROM (VALUES (1)) AS seed(value)
    OUTER APPLY (
      SELECT TOP (1)
        id,
        trigger_type,
        status,
        started_at_utc,
        finished_at_utc,
        last_completed_step,
        failed_step,
        duration_ms
      FROM dbo.TM_procurement_sync_runs
      ORDER BY started_at_utc DESC, id DESC
    ) AS latest
    OUTER APPLY (
      SELECT TOP (1)
        finished_at_utc
      FROM dbo.TM_procurement_sync_runs
      WHERE status = 'COMPLETED'
      ORDER BY finished_at_utc DESC, id DESC
    ) AS successful;
  `);

  return result.recordset[0] ?? {
    isRunning: false,
    lastAttemptId: null,
    lastAttemptTriggerType: null,
    lastAttemptStatus: null,
    lastAttemptStartedAtUtc: null,
    lastAttemptFinishedAtUtc: null,
    lastAttemptLastCompletedStep: null,
    lastAttemptFailedStep: null,
    lastAttemptDurationMs: null,
    lastSuccessfulAtUtc: null,
  };
}
