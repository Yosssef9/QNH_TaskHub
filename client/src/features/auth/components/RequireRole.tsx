import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useCurrentUser } from '../hooks/use-current-user'
import type { TaskHubRoleCode } from '../types/auth.types'

interface RequireRoleProps {
  children: ReactNode
  role: TaskHubRoleCode
}

export function RequireRole({ children, role }: RequireRoleProps) {
  const { data } = useCurrentUser()

  return data?.access.roleCode === role ? children : <Navigate to="/forbidden" replace />
}
