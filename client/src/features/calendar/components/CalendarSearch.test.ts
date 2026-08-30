import { describe, expect, it } from 'vitest'

import type { CalendarTask } from '../types/calendar.types'
import { groupCalendarSearchResults } from './CalendarSearch'

const task = (id: number, calendarDate: string): CalendarTask => ({
  id,
  title: `Task ${id}`,
  calendarDate,
  calendarDateSource: 'DUE_DATE',
  status: 'TODO',
  priority: 'MEDIUM',
  startDate: null,
  dueDate: calendarDate,
  isOverdue: false,
  listId: 1,
  listName: 'My Tasks',
  cycleId: null,
  cycleTitle: null,
  kpiInstanceId: null,
  kpiTemplateId: null,
  kpiName: null,
  isReadOnly: false,
})

describe('Calendar-wide search result grouping', () => {
  it('keeps today and future matches in Upcoming and older matches in Past', () => {
    const grouped = groupCalendarSearchResults(
      [task(1, '2026-08-30'), task(2, '2026-09-10'), task(3, '2026-08-29')],
      '2026-08-30',
    )

    expect(grouped.upcoming.map((item) => item.id)).toEqual([1, 2])
    expect(grouped.past.map((item) => item.id)).toEqual([3])
  })
})
