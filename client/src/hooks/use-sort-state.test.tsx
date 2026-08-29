import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useSortState } from './use-sort-state'

type TaskSortColumn = 'title' | 'dueDate'

describe('useSortState', () => {
  it('selects a column and toggles its direction without sorting rows locally', () => {
    const { result } = renderHook(() => useSortState<TaskSortColumn>())

    act(() => result.current.handleSort('dueDate'))
    expect(result.current.sortColumn).toBe('dueDate')
    expect(result.current.sortDirection).toBe('asc')

    act(() => result.current.handleSort('dueDate'))
    expect(result.current.sortDirection).toBe('desc')

    act(() => result.current.handleSort('title'))
    expect(result.current.sortColumn).toBe('title')
    expect(result.current.sortDirection).toBe('asc')
  })
})
