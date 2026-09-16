import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  CreateMeetingSeriesInput,
  MeetingSeriesAttachmentUploadInput,
  MeetingSeriesAttachmentUploadResult,
  MeetingSeriesCreateResult,
  MeetingSeriesDetail,
  MeetingSeriesListInput,
  MeetingSeriesListResult,
  MeetingSeriesMembershipLink,
  MeetingSeriesPreview,
  MeetingSeriesPreviewInput,
} from './meeting-series.types'

export async function previewMeetingSeries(
  input: MeetingSeriesPreviewInput,
): Promise<MeetingSeriesPreview> {
  const response = await apiClient.post<ApiSuccessResponse<{ preview: MeetingSeriesPreview }>>(
    '/meetings/series/preview',
    input,
  )
  return response.data.data.preview
}

export async function createMeetingSeries(
  input: CreateMeetingSeriesInput,
): Promise<MeetingSeriesCreateResult> {
  const response = await apiClient.post<ApiSuccessResponse<{ series: MeetingSeriesCreateResult }>>(
    '/meetings/series',
    input,
  )
  return response.data.data.series
}




export async function uploadMeetingSeriesAttachment(
  input: MeetingSeriesAttachmentUploadInput,
): Promise<MeetingSeriesAttachmentUploadResult> {
  const formData = new FormData()
  formData.append('file', input.file)
  formData.append('attachmentRequestId', input.attachmentRequestId)
  formData.append('scope', input.scope)
  if (input.occurrenceKey) formData.append('occurrenceKey', input.occurrenceKey)
  const response = await apiClient.post<ApiSuccessResponse<{ attachment: MeetingSeriesAttachmentUploadResult }>>(
    `/meetings/series/${input.seriesId}/attachments`,
    formData,
  )
  return response.data.data.attachment
}

export async function listMeetingSeries(input: MeetingSeriesListInput): Promise<MeetingSeriesListResult> {
  const response = await apiClient.get<ApiSuccessResponse<{ series: MeetingSeriesListResult }>>(
    '/meetings/series',
    { params: input },
  )
  return response.data.data.series
}

export async function getMeetingSeriesDetail(seriesId: number): Promise<MeetingSeriesDetail> {
  const response = await apiClient.get<ApiSuccessResponse<{ series: MeetingSeriesDetail }>>(
    `/meetings/series/${seriesId}`,
  )
  return response.data.data.series
}

export async function getMeetingSeriesLinkForMeeting(
  meetingId: number,
): Promise<MeetingSeriesMembershipLink | null> {
  const response = await apiClient.get<ApiSuccessResponse<{ link: MeetingSeriesMembershipLink | null }>>(
    `/meetings/series/by-meeting/${meetingId}`,
  )
  return response.data.data.link
}

