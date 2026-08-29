import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { getAccessUsers } from '../api/access.api'
import type { AccessListQuery } from '../types/access.types'

export const accessUsersQueryKey = ['admin', 'access-users'] as const

export function useAccessUsers(query: AccessListQuery) {
  return useQuery({
    queryKey: [...accessUsersQueryKey, query],
    queryFn: () => getAccessUsers(query),
    placeholderData: keepPreviousData,
  })
}
