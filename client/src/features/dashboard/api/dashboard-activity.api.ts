import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

export interface DashboardActivity {
  id: number
  kind: 'TASK' | 'MEETING'
  objectId: number
  listId: number | null
  ownerUserId: number | null
  isShared: boolean
  title: string
  actorName: string
  eventType: string
  createdAtUtc: string
}

export async function getDashboardActivity():Promise<DashboardActivity[]> {
  const response=await apiClient.get<ApiSuccessResponse<DashboardActivity[]>>('/dashboard/activity')
  return response.data.data
}
