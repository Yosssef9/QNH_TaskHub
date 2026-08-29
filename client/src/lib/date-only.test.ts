import { describe, expect, it } from 'vitest'

import { formatDateOnly, parseDateOnly } from './date-only'

describe('date-only utilities', () => {
  it('round-trips a due date without changing the selected day', () => {
    const date = parseDateOnly('2026-08-24')

    expect(date).toBeDefined()
    expect(formatDateOnly(date as Date)).toBe('2026-08-24')
  })

  it('rejects invalid or non-date-only values', () => {
    expect(parseDateOnly('2026-02-30')).toBeUndefined()
    expect(parseDateOnly('2026-08-24T00:00:00Z')).toBeUndefined()
    expect(parseDateOnly('')).toBeUndefined()
  })
})
