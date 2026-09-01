import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  MeetingRoom,
  SaveMeetingRoomInput,
  UpdateMeetingRoomInput,
} from '../types/meeting.types'

export async function getActiveMeetingRooms(): Promise<MeetingRoom[]> {
  const response =
    await apiClient.get<ApiSuccessResponse<{ rooms: MeetingRoom[] }>>('/meetings/rooms')
  return response.data.data.rooms
}

export async function getAdminMeetingRooms(): Promise<MeetingRoom[]> {
  const response =
    await apiClient.get<ApiSuccessResponse<{ rooms: MeetingRoom[] }>>('/admin/meeting-rooms')
  return response.data.data.rooms
}

export async function saveMeetingRoom(input: {
  roomId?: number
  values: SaveMeetingRoomInput | UpdateMeetingRoomInput
}): Promise<MeetingRoom> {
  const response = input.roomId
    ? await apiClient.put<ApiSuccessResponse<{ room: MeetingRoom }>>(
        `/admin/meeting-rooms/${input.roomId}`,
        input.values,
      )
    : await apiClient.post<ApiSuccessResponse<{ room: MeetingRoom }>>(
        '/admin/meeting-rooms',
        input.values,
      )

  return response.data.data.room
}
