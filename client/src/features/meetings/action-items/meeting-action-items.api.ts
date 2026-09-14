import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type {
  AssignedMeetingActionItemsData,
  AssignedMeetingActionItemsQuery,
  CreateMeetingActionItemInput,
  MeetingActionItem,
  MeetingActionItemAssigneeOption,
  MeetingActionItemListData,
  ReassignMeetingActionItemInput,
} from './meeting-action-items.types'

export async function getMeetingActionItems(meetingId: number) {
  const response = await apiClient.get<ApiSuccessResponse<MeetingActionItemListData>>(
    `/meetings/${meetingId}/action-items`,
  )
  return response.data.data
}

export async function getMeetingActionItemAssignees(meetingId: number) {
  const response = await apiClient.get<
    ApiSuccessResponse<{ items: MeetingActionItemAssigneeOption[] }>
  >(`/meetings/${meetingId}/action-item-assignees`)
  return response.data.data.items
}

export async function createMeetingActionItem(
  meetingId: number,
  input: CreateMeetingActionItemInput,
) {
  const response = await apiClient.post<ApiSuccessResponse<{ item: MeetingActionItem }>>(
    `/meetings/${meetingId}/action-items`,
    input,
  )
  return response.data.data.item
}

export async function reassignMeetingActionItem(
  meetingId: number,
  taskId: number,
  input: ReassignMeetingActionItemInput,
) {
  const response = await apiClient.patch<
    ApiSuccessResponse<{ item: MeetingActionItem }>
  >(`/meetings/${meetingId}/action-items/${taskId}/assignee`, input)
  return response.data.data.item
}

export async function getAssignedMeetingActionItems(query: AssignedMeetingActionItemsQuery) {
  const response = await apiClient.get<ApiSuccessResponse<AssignedMeetingActionItemsData>>(
    '/action-items/assigned',
    { params: query },
  )
  return response.data.data
}
