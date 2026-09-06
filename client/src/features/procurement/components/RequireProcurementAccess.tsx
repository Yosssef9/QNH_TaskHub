import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useCurrentUser } from '@/features/auth/hooks/use-current-user'

export function RequireProcurementAccess({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser()
  if (!currentUser.data?.access.procurementEnabled) return <Navigate to="/forbidden" replace />
  return children
}
