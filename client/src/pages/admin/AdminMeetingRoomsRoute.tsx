import { lazy, Suspense } from 'react'

import { LoadingState } from '@/components/shared/LoadingState'
import { RequireRole } from '@/features/auth/components/RequireRole'

const MeetingRoomsPage = lazy(() =>
  import('./MeetingRoomsPage').then((module) => ({ default: module.MeetingRoomsPage })),
)

export function AdminMeetingRoomsRoute() {
  return (
    <RequireRole role="ADMIN">
      <Suspense fallback={<LoadingState fullPage />}>
        <MeetingRoomsPage />
      </Suspense>
    </RequireRole>
  )
}
