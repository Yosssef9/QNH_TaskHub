import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAutoExpandSidebar } from './use-auto-expand-sidebar'

describe('useAutoExpandSidebar', () => {
  afterEach(() => vi.useRealTimers())

  it('uses short hover delays to prevent accidental flicker', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAutoExpandSidebar())

    act(() => result.current.onPointerEnter())
    act(() => vi.advanceTimersByTime(79))
    expect(result.current.isExpanded).toBe(false)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.isExpanded).toBe(true)

    act(() => result.current.onPointerLeave())
    act(() => vi.advanceTimersByTime(179))
    expect(result.current.isExpanded).toBe(true)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.isExpanded).toBe(false)
  })

  it('collapses after navigation and waits for the pointer to re-enter', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAutoExpandSidebar())

    act(() => result.current.onPointerEnter())
    act(() => vi.advanceTimersByTime(80))
    expect(result.current.isExpanded).toBe(true)

    act(() => result.current.onNavigate())
    expect(result.current.isExpanded).toBe(false)

    act(() => vi.advanceTimersByTime(500))
    expect(result.current.isExpanded).toBe(false)

    act(() => result.current.onPointerLeave())
    act(() => result.current.onPointerEnter())
    act(() => vi.advanceTimersByTime(80))
    expect(result.current.isExpanded).toBe(true)
  })
})
