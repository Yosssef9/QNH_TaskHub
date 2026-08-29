import { useQuery } from '@tanstack/react-query'

import { getPortalToken } from '@/lib/get-portal-token'

import { getCurrentUser } from '../api/auth.api'

export const currentUserQueryKey = ['auth', 'me'] as const

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: getCurrentUser,
    enabled: getPortalToken() !== null,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
