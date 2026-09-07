import { queryClient } from '@/app/query-client'
import { allKpiTasksQueryOptions } from '@/features/tasks/hooks/use-tasks'
import { getWorkCycles } from '@/features/work-cycles/api/work-cycles.api'
import { workCyclesQueryKey } from '@/features/work-cycles/hooks/use-work-cycles'

export async function loadKpiTasksPage() {
  await Promise.all([
    queryClient.ensureQueryData({
      queryKey: workCyclesQueryKey,
      queryFn: getWorkCycles,
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
    }),
    queryClient.prefetchQuery(allKpiTasksQueryOptions()),
  ])
}
