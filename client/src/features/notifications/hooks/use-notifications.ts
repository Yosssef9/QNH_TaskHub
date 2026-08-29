import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getPortalToken } from '@/lib/get-portal-token'

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notifications.api'

export const notificationsQueryRoot = ['notifications'] as const

export function useNotifications(limit = 10) {
  return useQuery({
    queryKey: [...notificationsQueryRoot, limit],
    queryFn: () => getNotifications(limit),
    enabled: getPortalToken() !== null,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsQueryRoot }),
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsQueryRoot }),
  })
}
