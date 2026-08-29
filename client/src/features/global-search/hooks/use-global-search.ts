import { useQuery } from '@tanstack/react-query'

import { getGlobalSearch } from '../api/global-search.api'

export const globalSearchQueryRoot = ['global-search'] as const

export function useGlobalSearch(query: string) {
  const normalized = query.trim()

  return useQuery({
    queryKey: [...globalSearchQueryRoot, normalized],
    queryFn: () => getGlobalSearch(normalized),
    enabled: normalized.length >= 2,
    staleTime: 15_000,
  })
}
