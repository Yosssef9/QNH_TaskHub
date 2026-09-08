import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getProcurementSyncStatus,
  requestProcurementSync,
} from '../api/procurement.api'

export const procurementSyncStatusQueryKey = ['procurement', 'sync-status'] as const

export function useProcurementSyncStatus(enabled = true) {
  return useQuery({
    queryKey: procurementSyncStatusQueryKey,
    queryFn: getProcurementSyncStatus,
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useRequestProcurementSync() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: requestProcurementSync,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementSyncStatusQueryKey })
    },
  })
}
