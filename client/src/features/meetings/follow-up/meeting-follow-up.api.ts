import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  CreateMeetingDecisionInput,
  MeetingDecision,
  MeetingFollowUpData,
  RelatedMeetingFamily,
  MeetingFollowUpNotes,
  SaveMeetingFollowUpNotesInput,
  UpdateMeetingDecisionInput,
} from './meeting-follow-up.types'

export async function getMeetingFollowUp(meetingId: number): Promise<MeetingFollowUpData> {
  const response = await apiClient.get<ApiSuccessResponse<MeetingFollowUpData>>(
    `/meetings/${meetingId}/follow-up`,
  )
  return response.data.data
}

export async function createMeetingDecision(
  meetingId: number,
  input: CreateMeetingDecisionInput,
): Promise<MeetingDecision> {
  const response = await apiClient.post<ApiSuccessResponse<{ decision: MeetingDecision }>>(
    `/meetings/${meetingId}/decisions`,
    input,
  )
  return response.data.data.decision
}

export async function updateMeetingDecision(
  meetingId: number,
  decisionId: number,
  input: UpdateMeetingDecisionInput,
): Promise<MeetingDecision> {
  const response = await apiClient.patch<ApiSuccessResponse<{ decision: MeetingDecision }>>(
    `/meetings/${meetingId}/decisions/${decisionId}`,
    input,
  )
  return response.data.data.decision
}

export async function saveMeetingFollowUpNotes(
  meetingId: number,
  input: SaveMeetingFollowUpNotesInput,
): Promise<MeetingFollowUpNotes> {
  const response = await apiClient.put<ApiSuccessResponse<{ notes: MeetingFollowUpNotes }>>(
    `/meetings/${meetingId}/follow-up-notes`,
    input,
  )
  return response.data.data.notes
}


export async function getRelatedMeetings(meetingId: number): Promise<RelatedMeetingFamily> {
  const response = await apiClient.get<ApiSuccessResponse<RelatedMeetingFamily>>(
    `/meetings/${meetingId}/related-meetings`,
  )
  return response.data.data
}
