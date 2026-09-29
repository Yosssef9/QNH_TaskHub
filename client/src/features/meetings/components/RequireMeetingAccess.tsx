import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { canCoordinateMeetings, canOrganizeAnyMeetings } from '../meeting-access'

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
      ? canOrganizeAnyMeetings(access)
      : capability === 'COORDINATOR'
        ? canCoordinateMeetings(access)
        : canOrganizeAnyMeetings(access) || canCoordinateMeetings(access)

  if (!allowed) return <Navigate to="/forbidden" replace />
  return children
}

