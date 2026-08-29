import { useQuery } from '@tanstack/react-query'

import { getCalendarTasks } from '../api/calendar.api'
import type { CalendarTaskFilters } from '../types/calendar.types'

export const calendarTasksQueryKey = ['calendar', 'tasks'] as const

export function useCalendarTasks(filters: CalendarTaskFilters | null) {
  return useQuery({
    queryKey: filters ? [...calendarTasksQueryKey, filters] : [...calendarTasksQueryKey, 'idle'],
    queryFn: () => getCalendarTasks(filters!),
    enabled: filters !== null,
    staleTime: 30_000,
  })
}
