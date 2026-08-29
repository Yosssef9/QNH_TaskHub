import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { usePagination } from './use-pagination'

describe('usePagination', () => {
  it('calculates server-page metadata and clamps invalid pages', () => {
    const { result } = renderHook(() => usePagination(52, 25))

    expect(result.current).toMatchObject({
      page: 1,
      pageSize: 25,
      totalPages: 3,
      startRow: 1,
      endRow: 25,
    })

    act(() => result.current.setPage(99))

    expect(result.current.page).toBe(3)
    expect(result.current.startRow).toBe(51)
    expect(result.current.endRow).toBe(52)
  })

  it('returns to the first page when page size changes', () => {
    const { result } = renderHook(() => usePagination(80, 25))

    act(() => result.current.setPage(3))
    act(() => result.current.setPageSize(50))

    expect(result.current.page).toBe(1)
    expect(result.current.pageSize).toBe(50)
    expect(result.current.totalPages).toBe(2)
  })
})
