import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  DecideMeetingRequestInput,
  MeetingAvailability,
  MeetingAvailabilityInput,
  MeetingParticipantList,
  MeetingRoom,
  MeetingScheduleEntry,
  MeetingSummary,
  RejectMeetingRequestInput,
  SaveMeetingInput,
  SaveMeetingRoomInput,
  UpdateMeetingRoomInput,
  UpdatePendingMeetingScheduleInput,
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

export async function getMyMeetings(): Promise<MeetingSummary[]> {
  const response =
    await apiClient.get<ApiSuccessResponse<{ meetings: MeetingSummary[] }>>('/meetings/mine')
  return response.data.data.meetings
}

export async function getMyMeetingRequests(): Promise<MeetingSummary[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ meetings: MeetingSummary[] }>>(
    '/meetings/requests/mine',
  )
  return response.data.data.meetings
}

export async function getCoordinatorMeetingQueue(): Promise<MeetingSummary[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ meetings: MeetingSummary[] }>>(
    '/meetings/coordinator/queue',
  )
  return response.data.data.meetings
}

export async function searchMeetingParticipants(input: {
  search?: string
  page?: number
  pageSize?: number
}): Promise<MeetingParticipantList> {
  const response = await apiClient.get<ApiSuccessResponse<MeetingParticipantList>>(
    '/meetings/participants',
    { params: input },
  )
  return response.data.data
}

export async function checkMeetingAvailability(
  input: MeetingAvailabilityInput,
): Promise<MeetingAvailability> {
  const response = await apiClient.post<ApiSuccessResponse<{ availability: MeetingAvailability }>>(
    '/meetings/availability',
    input,
  )
  return response.data.data.availability
}

export async function createMeetingRequest(input: SaveMeetingInput): Promise<MeetingSummary> {
  const response = await apiClient.post<ApiSuccessResponse<{ meeting: MeetingSummary }>>(
    '/meetings/requests',
    input,
  )
  return response.data.data.meeting
}

export async function createDirectMeeting(input: SaveMeetingInput): Promise<MeetingSummary> {
  const response = await apiClient.post<ApiSuccessResponse<{ meeting: MeetingSummary }>>(
    '/meetings/direct',
    input,
  )
  return response.data.data.meeting
}

export async function updatePendingMeetingSchedule(
  input: UpdatePendingMeetingScheduleInput,
): Promise<MeetingSummary> {
  const { meetingId, ...body } = input
  const response = await apiClient.patch<ApiSuccessResponse<{ meeting: MeetingSummary }>>(
    `/meetings/coordinator/requests/${meetingId}`,
    body,
  )
  return response.data.data.meeting
}

export async function approveMeetingRequest(
  input: DecideMeetingRequestInput,
): Promise<MeetingSummary> {
  const { meetingId, ...body } = input
  const response = await apiClient.post<ApiSuccessResponse<{ meeting: MeetingSummary }>>(
    `/meetings/coordinator/requests/${meetingId}/approve`,
    body,
  )
  return response.data.data.meeting
}

export async function rejectMeetingRequest(
  input: RejectMeetingRequestInput,
): Promise<MeetingSummary> {
  const { meetingId, ...body } = input
  const response = await apiClient.post<ApiSuccessResponse<{ meeting: MeetingSummary }>>(
    `/meetings/coordinator/requests/${meetingId}/reject`,
    body,
  )
  return response.data.data.meeting
}

export async function getMeetingSchedule(input: {
  fromAtUtc: string
  toAtUtc: string
  roomId?: number
}): Promise<MeetingScheduleEntry[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ entries: MeetingScheduleEntry[] }>>(
    '/meetings/schedule',
    { params: input },
  )
  return response.data.data.entries
}
