import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useCurrentUser } from '@/features/auth/hooks/use-current-user'

export type MeetingPageCapability = 'ORGANIZER' | 'COORDINATOR' | 'ORGANIZE_OR_COORDINATE'

export function RequireMeetingAccess({
  capability,
  children,
}: {
  capability: MeetingPageCapability
  children: ReactNode
}) {
  const currentUser = useCurrentUser()
  const access = currentUser.data?.access

  const allowed =
    capability === 'ORGANIZER'
      ? access?.meetingOrganizeEnabled === true
      : capability === 'COORDINATOR'
        ? access?.meetingCoordinateEnabled === true
        : access?.meetingOrganizeEnabled === true || access?.meetingCoordinateEnabled === true

  if (!allowed) return <Navigate to="/forbidden" replace />
  return children
}
