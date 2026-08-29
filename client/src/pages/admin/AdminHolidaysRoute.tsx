import { lazy, Suspense } from 'react'

import { LoadingState } from '@/components/shared/LoadingState'
import { RequireRole } from '@/features/auth/components/RequireRole'

const HolidaysPage = lazy(() =>
  import('./HolidaysPage').then((module) => ({ default: module.HolidaysPage })),
)

export function AdminHolidaysRoute() {
  return (
    <RequireRole role="ADMIN">
      <Suspense fallback={<LoadingState fullPage />}>
        <HolidaysPage />
      </Suspense>
    </RequireRole>
  )
}
