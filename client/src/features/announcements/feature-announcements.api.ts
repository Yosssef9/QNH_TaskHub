import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

export const DISCUSSIONS_INTRO_KEY = 'TASK_DISCUSSIONS_2026_V1' as const

export const featureAnnouncementsApi = {
  async getDiscussionsIntro(): Promise<boolean> {
    const response = await apiClient.get<ApiSuccessResponse<{ key: string; seen: boolean }>>(
      '/users/me/feature-announcements/discussions',
    )
    return response.data.data.seen
  },
  async acknowledgeDiscussionsIntro(): Promise<void> {
    await apiClient.put('/users/me/feature-announcements/discussions/seen')
  },
}
