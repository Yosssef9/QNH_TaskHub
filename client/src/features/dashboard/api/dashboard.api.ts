import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type { DashboardData } from '../types/dashboard.types'

export async function getDashboard(): Promise<DashboardData> {
  const response = await apiClient.get<ApiSuccessResponse<DashboardData>>('/dashboard')
  return response.data.data
}
