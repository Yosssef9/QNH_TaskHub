import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addCycleKpis,
  archiveWorkCycle,
  closeWorkCycle,
  createWorkCycle,
  getWorkCycle,
  getWorkCycles,
  removeCycleKpi,
  reorderCycleInstances,
  reorderWorkCycles,
  reopenWorkCycle,
  setCurrentWorkCycle,
  updateWorkCycle,
} from '../api/work-cycles.api'
import type { WorkCycle } from '../types/work-cycle.types'

export const workCyclesQueryKey = ['work-cycles'] as const

export function useWorkCycles() {
  return useQuery({ queryKey: workCyclesQueryKey, queryFn: getWorkCycles, staleTime: 30_000 })
}

export function useWorkCycle(cycleId: number | null) {
  return useQuery({
    queryKey: [...workCyclesQueryKey, cycleId],
    queryFn: () => getWorkCycle(cycleId!),
    enabled: cycleId !== null,
  })
}

function useCycleMutation<T>(fn: (input: T) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: workCyclesQueryKey }),
        client.invalidateQueries({ queryKey: ['tasks'] }),
        client.invalidateQueries({ queryKey: ['kpis'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
}

export const useCreateWorkCycle = () => useCycleMutation(createWorkCycle)
export const useUpdateWorkCycle = () => useCycleMutation(updateWorkCycle)
export const useAddCycleKpis = () => useCycleMutation(addCycleKpis)
export const useSetCurrentWorkCycle = () => useCycleMutation(setCurrentWorkCycle)
export const useCloseWorkCycle = () => useCycleMutation(closeWorkCycle)
export const useReopenWorkCycle = () => useCycleMutation(reopenWorkCycle)
export const useArchiveWorkCycle = () => useCycleMutation(archiveWorkCycle)
export const useRemoveCycleKpi = () => useCycleMutation(removeCycleKpi)

export function useReorderWorkCycles() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: reorderWorkCycles,
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey: workCyclesQueryKey })
      const previous = client.getQueryData<WorkCycle[]>(workCyclesQueryKey)
      if (previous) {
        const byId = new Map(previous.map((cycle) => [cycle.id, cycle]))
        client.setQueryData<WorkCycle[]>(
          workCyclesQueryKey,
          ids.flatMap((id, index) => {
            const cycle = byId.get(id)
            return cycle ? [{ ...cycle, displayOrder: index + 1 }] : []
          }),
        )
      }
      return { previous }
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) client.setQueryData(workCyclesQueryKey, context.previous)
    },
    onSuccess: (cycles) => client.setQueryData(workCyclesQueryKey, cycles),
  })
}

export function useReorderCycleInstances() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: reorderCycleInstances,
    onSuccess: async (cycle) => {
      client.setQueryData([...workCyclesQueryKey, cycle.id], cycle)
      await Promise.all([
        client.invalidateQueries({ queryKey: workCyclesQueryKey }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
}
