import { queryClient } from '@/app/query-client'
import { allKpiTasksQueryOptions } from '@/features/tasks/hooks/use-tasks'
import { getWorkCycles } from '@/features/work-cycles/api/work-cycles.api'
import { workCyclesQueryKey } from '@/features/work-cycles/hooks/use-work-cycles'

const WORK_CYCLES_STALE_TIME_MS = 30_000

export async function loadKpiTasksPage() {
  await Promise.all([
    queryClient.ensureQueryData({
      queryKey: workCyclesQueryKey,
      queryFn: getWorkCycles,
      staleTime: WORK_CYCLES_STALE_TIME_MS,
    }),
    queryClient.ensureQueryData(allKpiTasksQueryOptions()),
  ])

  return null
}

export function prefetchKpiTasksPage() {
  void Promise.all([
    queryClient.prefetchQuery({
      queryKey: workCyclesQueryKey,
      queryFn: getWorkCycles,
      staleTime: WORK_CYCLES_STALE_TIME_MS,
    }),
    queryClient.prefetchQuery(allKpiTasksQueryOptions()),
  ])
}
