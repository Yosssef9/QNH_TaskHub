import { QueryClient } from '@tanstack/react-query'

export const DEFAULT_QUERY_STALE_TIME_MS = 5 * 60 * 1000
export const DEFAULT_QUERY_GC_TIME_MS = 30 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      gcTime: DEFAULT_QUERY_GC_TIME_MS,
    },
    mutations: {
      retry: false,
    },
  },
})
