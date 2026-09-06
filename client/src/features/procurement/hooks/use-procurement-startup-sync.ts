import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { syncProcurement } from '../api/procurement.api'

export function useProcurementStartupSync(enabled: boolean, userId: number | null) {
  const queryClient = useQueryClient()
  const invalidated = useRef(false)
  const query = useQuery({
    queryKey: ['procurement', 'startup-sync', userId],
    queryFn: syncProcurement,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    if (query.data?.status !== 'COMPLETED' || invalidated.current) return
    invalidated.current = true
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    ])
  }, [query.data?.status, queryClient])

  return query
}
