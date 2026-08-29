import type { ReactNode } from 'react'

import { getPortalToken } from '@/lib/get-portal-token'
import { ApiClientError } from '@/lib/api-error'

import { useCurrentUser } from '../hooks/use-current-user'
import { PreferencesSync } from '@/features/preferences/components/PreferencesSync'
import { AuthGate } from './AuthGate'

interface RequireAuthProps {
  children: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const hasPortalToken = getPortalToken() !== null
  const currentUser = useCurrentUser()

  if (!hasPortalToken) {
    return <AuthGate state="missing-token" />
  }

  if (currentUser.isPending) {
    return <AuthGate state="loading" />
  }

  if (currentUser.isError) {
    const errorCode =
      currentUser.error instanceof ApiClientError
        ? currentUser.error.code
        : 'UNEXPECTED_CLIENT_ERROR'

    if (errorCode === 'TASKHUB_ACCESS_NOT_ASSIGNED') {
      return <AuthGate state="access-not-assigned" />
    }

    if (errorCode === 'TASKHUB_ACCESS_INACTIVE' || errorCode === 'PORTAL_USER_INACTIVE') {
      return <AuthGate state="access-inactive" />
    }

    if (
      errorCode !== 'INVALID_PORTAL_TOKEN' &&
      errorCode !== 'UNAUTHENTICATED' &&
      errorCode !== 'PORTAL_USER_NOT_FOUND'
    ) {
      return <AuthGate state="server-error" onRetry={() => void currentUser.refetch()} />
    }

    return <AuthGate state="invalid-token" />
  }

  if (!currentUser.data) return <AuthGate state="server-error" />

  return (
    <>
      <PreferencesSync />
      {children}
    </>
  )
}
