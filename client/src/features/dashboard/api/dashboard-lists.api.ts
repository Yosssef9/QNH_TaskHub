import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

export interface DashboardListSummary {
  listId: number
  total: number
  active: number
  completed: number
}

export async function getDashboardListSummaries(): Promise<DashboardListSummary[]> {
  const response = await apiClient.get<ApiSuccessResponse<DashboardListSummary[]>>('/dashboard/list-summaries')
  return response.data.data
}
