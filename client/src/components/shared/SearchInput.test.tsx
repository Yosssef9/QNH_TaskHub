import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SearchInput } from './SearchInput'

describe('SearchInput', () => {
  afterEach(() => vi.useRealTimers())

  it('debounces search changes and clears immediately', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()

    render(<SearchInput value="" onChange={onChange} debounceMs={300} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'overdue' } })
    expect(onChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledWith('overdue')

    fireEvent.click(screen.getByRole('button', { name: 'مسح البحث' }))
    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
