import { describe, expect, it } from 'vitest'

import { getTodayInRiyadh, isInvalidNormalTaskStartDate } from './task-start-date'

describe('TaskHub normal task Start Date', () => {
  it('uses the hospital day, not UTC or the employee computer time zone', () => {
    expect(getTodayInRiyadh(new Date('2026-10-18T22:15:00Z'))).toBe('2026-10-19')
    expect(getTodayInRiyadh(new Date('2026-10-18T20:15:00Z'))).toBe('2026-10-18')
  })

  it('rejects backdated start dates for new normal tasks', () => {
    expect(isInvalidNormalTaskStartDate('2026-10-18', null, '2026-10-19')).toBe(true)
    expect(isInvalidNormalTaskStartDate('2026-10-19', null, '2026-10-19')).toBe(false)
    expect(isInvalidNormalTaskStartDate('2026-10-20', null, '2026-10-19')).toBe(false)
  })

  it('permits unchanged historical dates and blocks newly backdated ones', () => {
    expect(isInvalidNormalTaskStartDate('2025-10-01', '2025-10-01', '2026-10-19')).toBe(false)
    expect(isInvalidNormalTaskStartDate('2026-10-18', '2025-10-01', '2026-10-19')).toBe(true)
    expect(isInvalidNormalTaskStartDate(null, '2025-10-01', '2026-10-19')).toBe(false)
  })
})
