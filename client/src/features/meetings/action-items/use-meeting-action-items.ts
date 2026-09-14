import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createMeetingActionItem,
  getAssignedMeetingActionItems,
  getMeetingActionItemAssignees,
  getMeetingActionItems,
  reassignMeetingActionItem,
} from './meeting-action-items.api'
import type {
  AssignedMeetingActionItemsQuery,
  CreateMeetingActionItemInput,
  ReassignMeetingActionItemInput,
} from './meeting-action-items.types'

export function useMeetingActionItems(meetingId: number | null) {
  return useQuery({
    queryKey: ['meetings', 'action-items', meetingId],
    queryFn: () => getMeetingActionItems(meetingId!),
    enabled: meetingId !== null,
  })
}

export function useMeetingActionItemAssignees(meetingId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['meetings', 'action-item-assignees', meetingId],
    queryFn: () => getMeetingActionItemAssignees(meetingId!),
    enabled: meetingId !== null && enabled,
  })
}

function invalidateActionItemQueries(queryClient: ReturnType<typeof useQueryClient>, meetingId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['meetings', 'action-items', meetingId] }),
    queryClient.invalidateQueries({ queryKey: ['meetings', 'follow-up', meetingId] }),
    queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['task-details'] }),
    queryClient.invalidateQueries({ queryKey: ['assigned-action-items'] }),
    queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  ])
}

export function useCreateMeetingActionItem(meetingId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMeetingActionItemInput) => createMeetingActionItem(meetingId, input),
    onSuccess: async () => {
      await invalidateActionItemQueries(queryClient, meetingId)
    },
  })
}

export function useReassignMeetingActionItem(meetingId: number, taskId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ReassignMeetingActionItemInput) =>
      reassignMeetingActionItem(meetingId, taskId, input),
    onSuccess: async () => {
      await invalidateActionItemQueries(queryClient, meetingId)
    },
  })
}

export function useAssignedMeetingActionItems(query: AssignedMeetingActionItemsQuery) {
  return useQuery({
    queryKey: ['assigned-action-items', query],
    queryFn: () => getAssignedMeetingActionItems(query),
    placeholderData: (previous) => previous,
  })
}

