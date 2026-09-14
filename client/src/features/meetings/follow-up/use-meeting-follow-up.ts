import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createMeetingDecision,
  getMeetingFollowUp,
  getRelatedMeetings,
  saveMeetingFollowUpNotes,
  updateMeetingDecision,
} from './meeting-follow-up.api'
import type {
  CreateMeetingDecisionInput,
  MeetingDecision,
  MeetingFollowUpNotes,
  SaveMeetingFollowUpNotesInput,
  UpdateMeetingDecisionInput,
} from './meeting-follow-up.types'

export function meetingFollowUpQueryKey(meetingId: number | null) {
  return ['meetings', 'follow-up', meetingId] as const
}

export function useMeetingFollowUp(meetingId: number | null) {
  return useQuery({
    queryKey: meetingFollowUpQueryKey(meetingId),
    queryFn: () => getMeetingFollowUp(meetingId!),
    enabled: meetingId !== null,
  })
}

function useFollowUpMutation<TInput, TResult>(
  meetingId: number,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meetingFollowUpQueryKey(meetingId) })
    },
  })
}

export function useCreateMeetingDecision(meetingId: number) {
  return useFollowUpMutation<CreateMeetingDecisionInput, MeetingDecision>(meetingId, (input) =>
    createMeetingDecision(meetingId, input),
  )
}

export function useUpdateMeetingDecision(meetingId: number, decisionId: number | null) {
  return useFollowUpMutation<UpdateMeetingDecisionInput, MeetingDecision>(meetingId, (input) => {
    if (decisionId === null) throw new Error('Meeting Decision is not selected.')
    return updateMeetingDecision(meetingId, decisionId, input)
  })
}

export function useSaveMeetingFollowUpNotes(meetingId: number) {
  return useFollowUpMutation<SaveMeetingFollowUpNotesInput, MeetingFollowUpNotes>(meetingId, (input) =>
    saveMeetingFollowUpNotes(meetingId, input),
  )
}


export function useRelatedMeetings(meetingId: number | null) {
  return useQuery({
    queryKey: ['meetings', 'related', meetingId],
    queryFn: () => getRelatedMeetings(meetingId!),
    enabled: meetingId !== null,
  })
}
