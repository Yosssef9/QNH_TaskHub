import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createSavedView, deleteSavedView, duplicateSavedView, getSavedView, getSavedViews, setDefaultSavedView, updateSavedView } from '../api/procurement-saved-views.api'
import type { ProcurementSavedViewInput } from '../types/procurement-saved-view.types'

export const procurementSavedViewsQueryKey = ['procurement', 'saved-views'] as const
export function useProcurementSavedViews() {
  return useQuery({ queryKey: procurementSavedViewsQueryKey, queryFn: getSavedViews })
}
export function useProcurementSavedView(id: number | null) {
  return useQuery({ queryKey: [...procurementSavedViewsQueryKey, 'detail', id], queryFn: () => getSavedView(id as number), enabled: id !== null })
}
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: procurementSavedViewsQueryKey })
}
export function useCreateProcurementSavedView() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: createSavedView, onSuccess: (view) => { queryClient.setQueryData([...procurementSavedViewsQueryKey, 'detail', view.id], view); invalidate(queryClient) } })
}
export function useUpdateProcurementSavedView() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: ({ id, input }: { id: number; input: ProcurementSavedViewInput & { rowVersion: string } }) => updateSavedView(id, input), onSuccess: (view) => { queryClient.setQueryData([...procurementSavedViewsQueryKey, 'detail', view.id], view); invalidate(queryClient) } })
}
export function useDeleteProcurementSavedView() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: ({ id, rowVersion }: { id: number; rowVersion: string }) => deleteSavedView(id, rowVersion), onSuccess: () => invalidate(queryClient) })
}
export function useDuplicateProcurementSavedView() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: ({ id, name }: { id: number; name?: string }) => duplicateSavedView(id, name), onSuccess: (view) => { queryClient.setQueryData([...procurementSavedViewsQueryKey, 'detail', view.id], view); invalidate(queryClient) } })
}
export function useSetDefaultProcurementSavedView() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: setDefaultSavedView, onSuccess: (view) => { queryClient.setQueryData([...procurementSavedViewsQueryKey, 'detail', view.id], view); invalidate(queryClient) } })
}
