import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type { NotificationListData } from '../types/notification.types'

export async function getNotifications(limit = 10): Promise<NotificationListData> {
  const response = await apiClient.get<ApiSuccessResponse<NotificationListData>>('/notifications', {
    params: { limit },
  })
  return response.data.data
}

export async function markNotificationRead(notificationId: number): Promise<void> {
  await apiClient.patch(`/notifications/${notificationId}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.patch('/notifications/read-all')
}
