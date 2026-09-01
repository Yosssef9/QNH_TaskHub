import { describe, expect, it } from 'vitest'

import {
  clearCalendarFilters,
  countActiveCalendarFilters,
  selectedTaskScopes,
  type CalendarFilterState,
} from './CalendarFilters'

describe('Calendar filter state helpers', () => {
  it('supports Personal, KPI, and Meetings as composable sources', () => {
    const filters: CalendarFilterState = {
      sources: { personal: true, kpi: true, meetings: true },
      search: '',
    }

    expect(selectedTaskScopes(filters)).toEqual(['PERSONAL', 'KPI'])
  })

  it('counts task and room filters without counting source selection itself', () => {
    const filters: CalendarFilterState = {
      sources: { personal: true, kpi: true, meetings: true },
      search: 'report',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      listId: 7,
      cycleId: 12,
      kpiInstanceId: 34,
      roomId: 5,
    }

    expect(countActiveCalendarFilters(filters, 12)).toBe(6)
  })

  it('keeps selected sources and current KPI Cycle when clearing filters', () => {
    const filters: CalendarFilterState = {
      sources: { personal: true, kpi: true, meetings: true },
      search: 'report',
      priority: 'MEDIUM',
      cycleId: 44,
      roomId: 9,
    }

    expect(clearCalendarFilters(filters, 44)).toEqual({
      sources: filters.sources,
      search: '',
      cycleId: 44,
    })
  })
})
