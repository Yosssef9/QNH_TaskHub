import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

export type ProcurementSyncStep = 'SUPPLIERS' | 'ITEMS' | 'TRANSACTIONS'
export type ProcurementSyncRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'
export type ProcurementSyncTrigger = 'WORKER' | 'MANUAL'
export type ProcurementSyncRequestReason = 'DISABLED' | 'ALREADY_RUNNING'

export interface ProcurementSyncAttempt {
  id: number
  status: ProcurementSyncRunStatus
  triggerType: ProcurementSyncTrigger
  startedAtUtc: string
  finishedAtUtc: string | null
  lastCompletedStep: ProcurementSyncStep | null
  failedStep: ProcurementSyncStep | null
  durationMs: number | null
}

export interface ProcurementSyncStatusResult {
  enabled: boolean
  isRunning: boolean
  lastSuccessfulAtUtc: string | null
  lastAttempt: ProcurementSyncAttempt | null
}

export interface ProcurementSyncRequestResult {
  accepted: boolean
  reason: ProcurementSyncRequestReason | null
  runId: number | null
}

export async function getProcurementSyncStatus(): Promise<ProcurementSyncStatusResult> {
  const response = await apiClient.get<ApiSuccessResponse<ProcurementSyncStatusResult>>(
    '/procurement/sync-status',
  )
  return response.data.data
}

export async function requestProcurementSync(): Promise<ProcurementSyncRequestResult> {
  const response = await apiClient.post<ApiSuccessResponse<ProcurementSyncRequestResult>>(
    '/procurement/sync',
  )
  return response.data.data
}
