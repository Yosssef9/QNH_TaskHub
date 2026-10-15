import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'

import { SearchInput } from './SearchInput'

describe('SearchInput', () => {
  afterEach(() => vi.useRealTimers())

  it('reports typing immediately and clears the pending state when the search is committed', () => {
    vi.useFakeTimers()
    const onPendingChange = vi.fn()
    const onChange = vi.fn()

    function Harness() {
      const [value, setValue] = useState('')
      return <SearchInput value={value} debounceMs={300}
        onPendingChange={onPendingChange}
        onChange={(next) => { setValue(next); onChange(next); onPendingChange(false) }} />
    }

    render(<Harness />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gloves' } })
    expect(onPendingChange).toHaveBeenLastCalledWith(true)
    expect(onChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledWith('gloves')
    expect(onPendingChange).toHaveBeenLastCalledWith(false)

    fireEvent.click(screen.getByRole('button', { name: 'مسح البحث' }))
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(onPendingChange).toHaveBeenLastCalledWith(false)
  })

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
