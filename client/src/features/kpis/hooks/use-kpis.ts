import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  archiveKpi,
  createKpi,
  getKpis,
  getKpiSummary,
  getKpiTaskDeadline,
  reorderKpis,
  saveKpiMeasurement,
  setKpiActive,
  updateKpi,
} from '../api/kpis.api'
import type { PersonalKpi } from '../types/kpi.types'

export const kpisQueryKey = ['kpis'] as const

export function useKpis() {
  return useQuery({ queryKey: kpisQueryKey, queryFn: getKpis, staleTime: 60_000 })
}

function useReplaceKpi() {
  const client = useQueryClient()
  return (updated: PersonalKpi) =>
    client.setQueryData<PersonalKpi[]>(kpisQueryKey, (current = []) =>
      current.map((kpi) => (kpi.id === updated.id ? updated : kpi)),
    )
}

export function useCreateKpi() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: createKpi,
    onSuccess: (created) =>
      client.setQueryData<PersonalKpi[]>(kpisQueryKey, (current = []) => [...current, created]),
  })
}

export function useUpdateKpi() {
  const replace = useReplaceKpi()
  return useMutation({ mutationFn: updateKpi, onSuccess: replace })
}

export function useSetKpiActive() {
  const replace = useReplaceKpi()
  return useMutation({ mutationFn: setKpiActive, onSuccess: replace })
}

export function useArchiveKpi() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: archiveKpi,
    onSuccess: (_result, id) =>
      client.setQueryData<PersonalKpi[]>(kpisQueryKey, (current = []) =>
        current.filter((kpi) => kpi.id !== id),
      ),
  })
}

export function useReorderKpis() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: reorderKpis,
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey: kpisQueryKey })

      const previous = client.getQueryData<PersonalKpi[]>(kpisQueryKey)

      if (previous) {
        const byId = new Map(previous.map((kpi) => [kpi.id, kpi]))
        const reordered = ids.flatMap((id, index) => {
          const kpi = byId.get(id)
          return kpi ? [{ ...kpi, displayOrder: index + 1 }] : []
        })

        client.setQueryData<PersonalKpi[]>(kpisQueryKey, reordered)
      }

      return { previous }
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) {
        client.setQueryData(kpisQueryKey, context.previous)
      }
    },
    onSuccess: (kpis) => client.setQueryData(kpisQueryKey, kpis),
  })
}

export function useKpiTaskDeadline(
  kpiInstanceId: number | undefined,
  referenceDate: string | null | undefined,
) {
  return useQuery({
    queryKey: ['kpi-instances', kpiInstanceId, 'task-deadline', referenceDate],
    queryFn: () =>
      getKpiTaskDeadline({ kpiInstanceId: kpiInstanceId!, referenceDate: referenceDate! }),
    enabled: Boolean(kpiInstanceId && referenceDate),
  })
}

export function useKpiSummary(kpiInstanceId: number, periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ['kpi-instances', kpiInstanceId, 'summary', periodStart, periodEnd],
    queryFn: () => getKpiSummary({ kpiInstanceId, periodStart, periodEnd }),
  })
}

export function useSaveKpiMeasurement() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: saveKpiMeasurement,
    onSuccess: async (_result, input) => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['kpi-instances', input.kpiInstanceId, 'summary'],
        }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
}
