import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { useProcurementSyncStatus } from '../hooks/use-procurement-sync-status'

export function ProcurementSyncObserver() {
  const currentUser = useCurrentUser()
  const queryClient = useQueryClient()
  const enabled = currentUser.data?.access.procurementEnabled === true
  const status = useProcurementSyncStatus(enabled)
  const previousSuccessfulAt = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const currentSuccessfulAt = status.data?.lastSuccessfulAtUtc
    if (currentSuccessfulAt === undefined) return

    if (previousSuccessfulAt.current === undefined) {
      previousSuccessfulAt.current = currentSuccessfulAt
      return
    }

    if (
      currentSuccessfulAt !== null &&
      currentSuccessfulAt !== previousSuccessfulAt.current
    ) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['procurement', 'price-quotes'] }),
      ])
    }

    previousSuccessfulAt.current = currentSuccessfulAt
  }, [queryClient, status.data?.lastSuccessfulAtUtc])

  return null
}
