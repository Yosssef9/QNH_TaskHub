import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  CancelMeetingInput,
  CancelMeetingRescheduleRequestInput,
  DecideMeetingRequestInput,
  DecideMeetingRescheduleInput,
  DirectCoordinatorRescheduleInput,
  MeetingAttachment,
  MeetingAvailability,
  MeetingAvailabilityInput,
  MeetingDetail,
  MeetingParticipantList,
  MeetingRescheduleQueueItem,
  MeetingRoom,
  MeetingScheduleEntry,
  MeetingSummary,
  MeetingTemplate,
  RejectMeetingRequestInput,
  RejectMeetingRescheduleInput,
  RequestMeetingRescheduleInput,
  SaveMeetingInput,
  SaveMeetingRoomInput,
  SaveMeetingTemplateInput,
  UpdateMeetingAgendaInput,
  UpdateMeetingRescheduleInput,
  UpdateOrganizerRescheduleInput,
  UpdateMeetingRoomInput,
  UpdateMeetingTemplateInput,
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

export async function adjustAndApproveMeetingRequest(
  input: UpdatePendingMeetingScheduleInput,
): Promise<MeetingSummary> {
  const { meetingId, ...body } = input
  const response = await apiClient.post<ApiSuccessResponse<{ meeting: MeetingSummary }>>(
    `/meetings/coordinator/requests/${meetingId}/adjust-and-approve`,
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



export async function getMeetingDetail(meetingId: number): Promise<MeetingDetail> {
  const response = await apiClient.get<ApiSuccessResponse<{ meeting: MeetingDetail }>>(
    `/meetings/${meetingId}`,
  )
  return response.data.data.meeting
}

export async function updateMeetingAgenda(input: UpdateMeetingAgendaInput): Promise<MeetingDetail> {
  const { meetingId, ...body } = input
  const response = await apiClient.put<ApiSuccessResponse<{ meeting: MeetingDetail }>>(
    `/meetings/${meetingId}/agenda`,
    body,
  )
  return response.data.data.meeting
}

export async function requestMeetingReschedule(
  input: RequestMeetingRescheduleInput,
): Promise<MeetingDetail> {
  const { meetingId, ...body } = input
  const response = await apiClient.post<ApiSuccessResponse<{ meeting: MeetingDetail }>>(
    `/meetings/${meetingId}/reschedule`,
    body,
  )
  return response.data.data.meeting
}

export async function updateOrganizerRequestedSchedule(
  input: UpdatePendingMeetingScheduleInput,
): Promise<MeetingSummary> {
  const { meetingId, ...body } = input
  const response = await apiClient.patch<ApiSuccessResponse<{ meeting: MeetingSummary }>>(
    `/meetings/requests/${meetingId}/schedule`,
    body,
  )
  return response.data.data.meeting
}

export async function editMeetingRescheduleRequest(
  input: UpdateOrganizerRescheduleInput,
): Promise<MeetingDetail> {
  const { meetingId, ...body } = input
  const response = await apiClient.patch<ApiSuccessResponse<{ meeting: MeetingDetail }>>(
    `/meetings/${meetingId}/reschedule`,
    body,
  )
  return response.data.data.meeting
}

export async function cancelMeetingRescheduleRequest(
  input: CancelMeetingRescheduleRequestInput,
): Promise<MeetingDetail> {
  const { meetingId, ...body } = input
  const response = await apiClient.post<ApiSuccessResponse<{ meeting: MeetingDetail }>>(
    `/meetings/${meetingId}/reschedule/cancel`,
    body,
  )
  return response.data.data.meeting
}

export async function getCoordinatorReschedules(): Promise<MeetingRescheduleQueueItem[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: MeetingRescheduleQueueItem[] }>>(
    '/meetings/coordinator/reschedules',
  )
  return response.data.data.items
}

export async function updateMeetingReschedule(
  input: UpdateMeetingRescheduleInput,
): Promise<MeetingRescheduleQueueItem> {
  const { meetingId, ...body } = input
  const response = await apiClient.patch<ApiSuccessResponse<{ item: MeetingRescheduleQueueItem }>>(
    `/meetings/coordinator/reschedules/${meetingId}`,
    body,
  )
  return response.data.data.item
}

export async function adjustAndApproveMeetingReschedule(
  input: UpdateMeetingRescheduleInput,
): Promise<void> {
  const { meetingId, ...body } = input
  await apiClient.post(`/meetings/coordinator/reschedules/${meetingId}/adjust-and-approve`, body)
}

export async function directCoordinatorReschedule(
  input: DirectCoordinatorRescheduleInput,
): Promise<MeetingDetail> {
  const { meetingId, ...body } = input
  const response = await apiClient.post<ApiSuccessResponse<{ meeting: MeetingDetail }>>(
    `/meetings/coordinator/meetings/${meetingId}/reschedule`,
    body,
  )
  return response.data.data.meeting
}

export async function approveMeetingReschedule(input: DecideMeetingRescheduleInput): Promise<void> {
  const { meetingId, ...body } = input
  await apiClient.post(`/meetings/coordinator/reschedules/${meetingId}/approve`, body)
}

export async function rejectMeetingReschedule(input: RejectMeetingRescheduleInput): Promise<void> {
  const { meetingId, ...body } = input
  await apiClient.post(`/meetings/coordinator/reschedules/${meetingId}/reject`, body)
}

export async function cancelMeeting(input: CancelMeetingInput): Promise<MeetingDetail> {
  const { meetingId, ...body } = input
  const response = await apiClient.post<ApiSuccessResponse<{ meeting: MeetingDetail }>>(
    `/meetings/${meetingId}/cancel`,
    body,
  )
  return response.data.data.meeting
}

export async function getMeetingAttachments(meetingId: number): Promise<MeetingAttachment[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: MeetingAttachment[] }>>(
    `/meetings/${meetingId}/attachments`,
  )
  return response.data.data.items
}

export async function uploadMeetingAttachment(
  meetingId: number,
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<MeetingAttachment> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await apiClient.post<ApiSuccessResponse<{ attachment: MeetingAttachment }>>(
    `/meetings/${meetingId}/attachments`,
    formData,
    {
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      },
    },
  )
  return response.data.data.attachment
}

export async function getMeetingAttachmentPreview(
  attachmentId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/meetings/attachments/${attachmentId}/preview`, {
    responseType: 'blob',
    signal,
  })
  return response.data
}

export async function downloadMeetingAttachment(attachment: MeetingAttachment): Promise<void> {
  const response = await apiClient.get<Blob>(`/meetings/attachments/${attachment.id}/download`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = attachment.originalFileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function removeMeetingAttachment(attachmentId: string): Promise<void> {
  await apiClient.delete(`/meetings/attachments/${attachmentId}`)
}

export async function getMeetingTemplates(): Promise<MeetingTemplate[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ templates: MeetingTemplate[] }>>(
    '/meetings/templates',
  )
  return response.data.data.templates
}

export async function createMeetingTemplate(input: SaveMeetingTemplateInput): Promise<MeetingTemplate> {
  const response = await apiClient.post<ApiSuccessResponse<{ template: MeetingTemplate }>>(
    '/meetings/templates',
    input,
  )
  return response.data.data.template
}

export async function updateMeetingTemplate(input: UpdateMeetingTemplateInput): Promise<MeetingTemplate> {
  const { templateId, ...body } = input
  const response = await apiClient.put<ApiSuccessResponse<{ template: MeetingTemplate }>>(
    `/meetings/templates/${templateId}`,
    body,
  )
  return response.data.data.template
}

export async function archiveMeetingTemplate(input: { templateId: number; rowVersion: string }): Promise<void> {
  await apiClient.post(`/meetings/templates/${input.templateId}/archive`, {
    rowVersion: input.rowVersion,
  })
}
