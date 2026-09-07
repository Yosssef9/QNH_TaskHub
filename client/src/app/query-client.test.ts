import { describe, expect, it } from 'vitest'

import {
  DEFAULT_QUERY_GC_TIME_MS,
  DEFAULT_QUERY_STALE_TIME_MS,
  queryClient,
} from './query-client'

describe('queryClient cache policy', () => {
  it('keeps ordinary query data fresh for five minutes and cached while inactive for thirty minutes', () => {
    const defaults = queryClient.getDefaultOptions().queries

    expect(DEFAULT_QUERY_STALE_TIME_MS).toBe(5 * 60 * 1000)
    expect(DEFAULT_QUERY_GC_TIME_MS).toBe(30 * 60 * 1000)
    expect(defaults?.staleTime).toBe(DEFAULT_QUERY_STALE_TIME_MS)
    expect(defaults?.gcTime).toBe(DEFAULT_QUERY_GC_TIME_MS)
  })
})
