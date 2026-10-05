import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  adjustAndApproveMeetingRequest,
  adjustAndApproveMeetingReschedule,
  approveMeetingRequest,
  approveMeetingReschedule,
  archiveMeetingTemplate,
  bulkUpdateMeetingAttendance,
  cancelMeeting,
  cancelMeetingRescheduleRequest,
  checkMeetingAvailability,
  checkMeetingParticipantAvailability,
  createDirectMeeting,
  createMeetingRequest,
  createMeetingTemplate,
  directCoordinatorReschedule,
  editMeetingRescheduleRequest,
  getCoordinatorMeetingQueue,
  getCoordinatorReschedules,
  getMeetingAttachments,
  getMeetingDetail,
  getMeetingOutlookSyncStatus,
  getMeetingSchedule,
  getMeetingTemplates,
  getMyMeetingRequests,
  getMyMeetings,
  rejectMeetingRequest,
  rejectMeetingReschedule,
  retryMeetingOutlookSync,
  restoreMeetingOutlookSync,
  recreateMeetingOutlookSync,
  removeMeetingAttachment,
  requestMeetingReschedule,
  searchMeetingParticipants,
  updateMeetingAgenda,
  updateMeetingAttendance,
  updateMeetingReschedule,
  updateOrganizerRequestedSchedule,
  updateMeetingTemplate,
  updatePendingMeetingSchedule,
  uploadMeetingAttachment,
} from '../api/meetings.api'
import type { MeetingAvailabilityInput, MeetingParticipantConflictInput } from '../types/meeting.types'

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
  const normalizedSearch = search.trim()

  return useInfiniteQuery({
    queryKey: [...meetingsQueryKey, 'participants', normalizedSearch],
    queryFn: ({ pageParam }) =>
      searchMeetingParticipants({
        search: normalizedSearch,
        page: pageParam,
        pageSize: 50,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.pageSize < lastPage.total
        ? lastPage.page + 1
        : undefined,
    enabled,
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

export function useMeetingParticipantAvailability(input: MeetingParticipantConflictInput | null) {
  return useQuery({
    queryKey: [...meetingsQueryKey, 'participant-availability', input],
    queryFn: () => checkMeetingParticipantAvailability(input as MeetingParticipantConflictInput),
    enabled: input !== null && input.participantUserIds.length > 0,
    staleTime: 0,
    retry: 1,
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

export function useAdjustAndApproveMeetingRequest() {
  return useMeetingMutation(adjustAndApproveMeetingRequest)
}

export function useUpdateOrganizerRequestedSchedule() {
  return useMeetingMutation(updateOrganizerRequestedSchedule)
}

export function useApproveMeetingRequest() {
  return useMeetingMutation(approveMeetingRequest)
}

export function useRejectMeetingRequest() {
  return useMeetingMutation(rejectMeetingRequest)
}

export function useMeetingSchedule(
  input: { fromAtUtc: string; toAtUtc: string; roomId?: number } | null,
) {
  return useQuery({
    queryKey: input
      ? [...meetingsQueryKey, 'schedule', input]
      : [...meetingsQueryKey, 'schedule', 'idle'],
    queryFn: () =>
      getMeetingSchedule(
        input as { fromAtUtc: string; toAtUtc: string; roomId?: number },
      ),
    enabled: input !== null,
    staleTime: 30_000,
  })
}

export function useMeetingDetail(meetingId: number | null) {
  return useQuery({
    queryKey: [...meetingsQueryKey, 'detail', meetingId],
    queryFn: () => getMeetingDetail(meetingId as number),
    enabled: meetingId !== null,
  })
}

export function useCoordinatorReschedules(enabled: boolean) {
  return useQuery({
    queryKey: [...meetingsQueryKey, 'coordinator', 'reschedules'],
    queryFn: getCoordinatorReschedules,
    enabled,
  })
}

export function useMeetingAttachments(meetingId: number | null) {
  return useQuery({
    queryKey: [...meetingsQueryKey, 'attachments', meetingId],
    queryFn: () => getMeetingAttachments(meetingId as number),
    enabled: meetingId !== null,
  })
}

export function useMeetingTemplates(enabled: boolean) {
  return useQuery({
    queryKey: [...meetingsQueryKey, 'templates'],
    queryFn: getMeetingTemplates,
    enabled,
  })
}

export function useUpdateMeetingAttendance() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: updateMeetingAttendance,
    onSuccess: (detail, input) => {
      client.setQueryData([...meetingsQueryKey, 'detail', input.meetingId], detail)
    },
  })
}

export function useBulkUpdateMeetingAttendance() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: bulkUpdateMeetingAttendance,
    onSuccess: (detail, input) => {
      client.setQueryData([...meetingsQueryKey, 'detail', input.meetingId], detail)
    },
  })
}

export function useUpdateMeetingAgenda() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: updateMeetingAgenda,
    onSuccess: (detail, input) => {
      client.setQueryData([...meetingsQueryKey, 'detail', input.meetingId], detail)
      void client.invalidateQueries({ queryKey: myMeetingsQueryKey })
      void client.invalidateQueries({ queryKey: myMeetingRequestsQueryKey })
      void client.invalidateQueries({ queryKey: ['meetings', 'action-items', input.meetingId] })
      void client.invalidateQueries({ queryKey: ['meetings', 'follow-up', input.meetingId] })
    },
  })
}

export function useRequestMeetingReschedule() {
  return useMeetingMutation(requestMeetingReschedule)
}

export function useUpdateMeetingReschedule() {
  return useMeetingMutation(updateMeetingReschedule)
}

export function useEditMeetingRescheduleRequest() {
  return useMeetingMutation(editMeetingRescheduleRequest)
}

export function useCancelMeetingRescheduleRequest() {
  return useMeetingMutation(cancelMeetingRescheduleRequest)
}

export function useAdjustAndApproveMeetingReschedule() {
  return useMeetingMutation(adjustAndApproveMeetingReschedule)
}

export function useDirectCoordinatorReschedule() {
  return useMeetingMutation(directCoordinatorReschedule)
}

export function useApproveMeetingReschedule() {
  return useMeetingMutation(approveMeetingReschedule)
}

export function useRejectMeetingReschedule() {
  return useMeetingMutation(rejectMeetingReschedule)
}

export function useCancelMeeting() {
  return useMeetingMutation(cancelMeeting)
}

export function useUploadMeetingAttachment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      meetingId,
      file,
      onProgress,
    }: {
      meetingId: number
      file: File
      onProgress?: (percentage: number) => void
    }) => uploadMeetingAttachment(meetingId, file, onProgress),
    onSuccess: (_attachment, input) => {
      void client.invalidateQueries({ queryKey: [...meetingsQueryKey, 'attachments', input.meetingId] })
      void client.invalidateQueries({ queryKey: [...meetingsQueryKey, 'detail', input.meetingId] })
    },
  })
}

export function useRemoveMeetingAttachment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ attachmentId }: { meetingId: number; attachmentId: string }) =>
      removeMeetingAttachment(attachmentId),
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: [...meetingsQueryKey, 'attachments', input.meetingId] })
      void client.invalidateQueries({ queryKey: [...meetingsQueryKey, 'detail', input.meetingId] })
    },
  })
}

export function useCreateMeetingTemplate() {
  return useMeetingMutation(createMeetingTemplate)
}

export function useUpdateMeetingTemplate() {
  return useMeetingMutation(updateMeetingTemplate)
}

export function useArchiveMeetingTemplate() {
  return useMeetingMutation(archiveMeetingTemplate)
}



export function useMeetingOutlookSync(meetingId: number | null) {
  return useQuery({
    queryKey: [...meetingsQueryKey, 'outlook-sync', meetingId],
    queryFn: () => getMeetingOutlookSyncStatus(meetingId as number),
    enabled: meetingId !== null,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useRetryMeetingOutlookSync() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ meetingId }: { meetingId: number }) => retryMeetingOutlookSync(meetingId),
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: [...meetingsQueryKey, 'outlook-sync', input.meetingId] })
    },
  })
}

export function useRestoreMeetingOutlookSync() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ meetingId }: { meetingId: number }) => restoreMeetingOutlookSync(meetingId),
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: [...meetingsQueryKey, 'outlook-sync', input.meetingId] })
    },
  })
}

export function useRecreateMeetingOutlookSync() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ meetingId }: { meetingId: number }) => recreateMeetingOutlookSync(meetingId),
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: [...meetingsQueryKey, 'outlook-sync', input.meetingId] })
    },
  })
}
