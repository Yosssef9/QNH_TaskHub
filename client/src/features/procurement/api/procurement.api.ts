import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

export type ProcurementSyncStep = 'SUPPLIERS' | 'ITEMS' | 'TRANSACTIONS'
export type ProcurementSyncStatus = 'COMPLETED' | 'SKIPPED'
export type ProcurementSyncSkipReason = 'DISABLED_BY_CONFIGURATION'

export interface ProcurementSyncResult {
  status: ProcurementSyncStatus
  completedAtUtc: string
  steps: ProcurementSyncStep[]
  skipReason?: ProcurementSyncSkipReason
}

export async function syncProcurement(): Promise<ProcurementSyncResult> {
  const response = await apiClient.post<ApiSuccessResponse<ProcurementSyncResult>>('/procurement/sync')
  return response.data.data
}
