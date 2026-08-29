import { describe, expect, it } from 'vitest'

import {
  clearCalendarFilters,
  countActiveCalendarFilters,
  type CalendarFilterState,
} from './CalendarFilters'

describe('Calendar filter state helpers', () => {
  it('counts only active personal filters and preserves scope when clearing', () => {
    const filters: CalendarFilterState = {
      scope: 'PERSONAL',
      search: 'report',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      listId: 7,
    }

    expect(countActiveCalendarFilters(filters)).toBe(4)
    expect(clearCalendarFilters(filters)).toEqual({ scope: 'PERSONAL', search: '' })
  })

  it('treats the current Work Cycle as the KPI default and restores it when clearing', () => {
    const filters: CalendarFilterState = {
      scope: 'KPI',
      search: '',
      cycleId: 12,
      kpiInstanceId: 34,
      priority: 'MEDIUM',
    }

    expect(countActiveCalendarFilters(filters, 12)).toBe(2)
    expect(clearCalendarFilters(filters, 12)).toEqual({
      scope: 'KPI',
      search: '',
      cycleId: 12,
    })
  })

  it('counts selecting all Work Cycles as a filter when the current Cycle is the default', () => {
    const filters: CalendarFilterState = {
      scope: 'KPI',
      search: '',
      cycleId: undefined,
    }

    expect(countActiveCalendarFilters(filters, 12)).toBe(1)
  })
})
