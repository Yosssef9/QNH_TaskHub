import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getActiveMeetingRooms,
  getAdminMeetingRooms,
  saveMeetingRoom,
} from '../api/meetings.api'

export const activeMeetingRoomsQueryKey = ['meetings', 'rooms', 'active'] as const
export const adminMeetingRoomsQueryKey = ['admin', 'meeting-rooms'] as const

export function useActiveMeetingRooms() {
  return useQuery({
    queryKey: activeMeetingRoomsQueryKey,
    queryFn: getActiveMeetingRooms,
  })
}

export function useAdminMeetingRooms() {
  return useQuery({
    queryKey: adminMeetingRoomsQueryKey,
    queryFn: getAdminMeetingRooms,
  })
}

export function useSaveMeetingRoom() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: saveMeetingRoom,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: activeMeetingRoomsQueryKey })
      void client.invalidateQueries({ queryKey: adminMeetingRoomsQueryKey })
    },
  })
}
