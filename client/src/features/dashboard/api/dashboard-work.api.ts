import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type { WorkFilters, WorkResponse } from '../types/dashboard-work.types'

export async function getDashboardWork(filters: WorkFilters): Promise<WorkResponse> {
  const response = await apiClient.get<ApiSuccessResponse<WorkResponse>>('/dashboard/work', { params: filters })
  return response.data.data
}
