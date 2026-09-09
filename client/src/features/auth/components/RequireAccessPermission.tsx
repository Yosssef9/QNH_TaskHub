import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { hasAccessPermission } from '../access-permissions'
import { useCurrentUser } from '../hooks/use-current-user'
import type { ProcurementEntityCode } from '../types/auth.types'

export function RequireAccessPermission({
  children,
  entity,
}: {
  children: ReactNode
  entity: ProcurementEntityCode
}) {
  const currentUser = useCurrentUser()
  if (!hasAccessPermission(currentUser.data?.access, entity)) {
    return <Navigate to="/forbidden" replace />
  }
  return children
}
