import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { useProcurementStartupSync } from '../hooks/use-procurement-startup-sync'

export function ProcurementStartupSync() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const userId = currentUser.data?.user.userId ?? null
  const enabled = Boolean(currentUser.data?.access.procurementEnabled && userId)
  const sync = useProcurementStartupSync(enabled, userId)
  const errorWarned = useRef(false)
  const skippedWarned = useRef(false)

  useEffect(() => {
    if (sync.data?.status !== 'SKIPPED' || skippedWarned.current) return
    skippedWarned.current = true
    toast(t('procurement.syncSkipped'), { icon: '⚠️', duration: 6000 })
  }, [sync.data?.status, t])

  useEffect(() => {
    if (!sync.isError || errorWarned.current) return
    errorWarned.current = true
    toast.error(t('procurement.syncFailed'))
  }, [sync.isError, t])

  return null
}
