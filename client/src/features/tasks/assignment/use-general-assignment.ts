import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getEligibleTaskUsers, getEligibleTaskUser, getAssignedGeneralTasks, assignMainTask, assignSubtask,
  saveWorkNotes, saveCompletionSummary,
} from './general-assignment.api'
import type { GeneralAssignedQuery } from './general-assignment.api'

export const generalAssignmentsRoot = ['general-assignments'] as const
export function useEligibleTaskUsers(search: string, enabled = true, page = 1) {
  return useQuery({ queryKey: [...generalAssignmentsRoot, 'eligible', search, page],
    queryFn: () => getEligibleTaskUsers(search, page), enabled })
}
/** The assignee dropdown uses the same eligible-user endpoint with append-only paging. */
export function useInfiniteEligibleTaskUsers(search: string, enabled = true) {
  const normalizedSearch = search.trim()
  return useInfiniteQuery({
    queryKey: [...generalAssignmentsRoot, 'eligible-infinite', normalizedSearch],
    queryFn: ({ pageParam }) => getEligibleTaskUsers(normalizedSearch, pageParam),
    initialPageParam: 1,
    // The endpoint doesn't return a total count; a short final page ends the list.
    getNextPageParam: (lastPage) =>
      lastPage.items.length === lastPage.pageSize ? lastPage.page + 1 : undefined,
    enabled,
  })
}
export function useEligibleTaskUser(userId: number | null) {
  return useQuery({queryKey:[...generalAssignmentsRoot,'eligible-id',userId],
    queryFn:() => getEligibleTaskUser(userId!), enabled:userId !== null})
}
export function useGeneralAssignedTasks(query: GeneralAssignedQuery, enabled = true) {
  return useQuery({ queryKey: [...generalAssignmentsRoot, 'assigned', query],
    queryFn: () => getAssignedGeneralTasks(query), enabled, placeholderData: keepPreviousData })
}
function useAssignmentMutation<T>(fn: (arg: T) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({mutationFn: fn, onSuccess: async () => {
    await Promise.all([
      client.invalidateQueries({queryKey: ['tasks']}),
      client.invalidateQueries({queryKey: generalAssignmentsRoot}),
      client.invalidateQueries({queryKey: ['assigned-action-items']}),
      client.invalidateQueries({queryKey: ['notifications']}),
      client.invalidateQueries({queryKey: ['dashboard']}),
    ])
  }})
}
export const useAssignMainTask = () => useAssignmentMutation(assignMainTask)
export const useAssignSubtask = () => useAssignmentMutation(assignSubtask)
export const useSaveWorkNotes = () => useAssignmentMutation(saveWorkNotes)
export const useSaveCompletionSummary = () => useAssignmentMutation(saveCompletionSummary)

