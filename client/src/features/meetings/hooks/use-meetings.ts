import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  approveMeetingRequest,
  checkMeetingAvailability,
  createDirectMeeting,
  createMeetingRequest,
  getCoordinatorMeetingQueue,
  getMyMeetingRequests,
  getMyMeetings,
  rejectMeetingRequest,
  searchMeetingParticipants,
  updatePendingMeetingSchedule,
} from '../api/meetings.api'
import type { MeetingAvailabilityInput } from '../types/meeting.types'

export const meetingsQueryKey = ['meetings'] as const
export const myMeetingsQueryKey = [...meetingsQueryKey, 'mine'] as const
export const myMeetingRequestsQueryKey = [...meetingsQueryKey, 'requests', 'mine'] as const
export const coordinatorQueueQueryKey = [...meetingsQueryKey, 'coordinator', 'queue'] as const

export function useMyMeetings() {
  return useQuery({
    queryKey: myMeetingsQueryKey,
    queryFn: getMyMeetings,
  })
}

export function useMyMeetingRequests(enabled: boolean) {
  return useQuery({
    queryKey: myMeetingRequestsQueryKey,
    queryFn: getMyMeetingRequests,
    enabled,
  })
}

export function useCoordinatorMeetingQueue(enabled: boolean) {
  return useQuery({
    queryKey: coordinatorQueueQueryKey,
    queryFn: getCoordinatorMeetingQueue,
    enabled,
  })
}

export function useMeetingParticipants(search: string, enabled: boolean) {
  return useQuery({
    queryKey: [...meetingsQueryKey, 'participants', search],
    queryFn: () => searchMeetingParticipants({ search, page: 1, pageSize: 50 }),
    enabled,
    staleTime: 60_000,
  })
}

export function useMeetingAvailability(input: MeetingAvailabilityInput | null) {
  return useQuery({
    queryKey: [...meetingsQueryKey, 'availability', input],
    queryFn: () => checkMeetingAvailability(input as MeetingAvailabilityInput),
    enabled: input !== null,
    staleTime: 0,
  })
}

function useMeetingMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: meetingsQueryKey })
    },
  })
}

export function useCreateMeetingRequest() {
  return useMeetingMutation(createMeetingRequest)
}

export function useCreateDirectMeeting() {
  return useMeetingMutation(createDirectMeeting)
}

export function useUpdatePendingMeetingSchedule() {
  return useMeetingMutation(updatePendingMeetingSchedule)
}

export function useApproveMeetingRequest() {
  return useMeetingMutation(approveMeetingRequest)
}

export function useRejectMeetingRequest() {
  return useMeetingMutation(rejectMeetingRequest)
}
