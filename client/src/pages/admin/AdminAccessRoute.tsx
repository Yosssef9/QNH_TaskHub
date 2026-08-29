import { lazy, Suspense } from 'react'

import { LoadingState } from '@/components/shared/LoadingState'
import { RequireRole } from '@/features/auth/components/RequireRole'

const AccessManagementPage = lazy(() =>
  import('./AccessManagementPage').then((module) => ({
    default: module.AccessManagementPage,
  })),
)

export function AdminAccessRoute() {
  return (
    <RequireRole role="ADMIN">
      <Suspense fallback={<LoadingState fullPage />}>
        <AccessManagementPage />
      </Suspense>
    </RequireRole>
  )
}
