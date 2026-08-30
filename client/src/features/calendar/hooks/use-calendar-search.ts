import { useQuery } from '@tanstack/react-query'

import { searchCalendarTasks } from '../api/calendar.api'
import type { CalendarSearchFilters } from '../types/calendar.types'

export const calendarSearchQueryKey = ['calendar', 'search'] as const

export function useCalendarSearch(filters: CalendarSearchFilters | null) {
  return useQuery({
    queryKey: filters ? [...calendarSearchQueryKey, filters] : [...calendarSearchQueryKey, 'idle'],
    queryFn: () => searchCalendarTasks(filters!),
    enabled: filters !== null,
    staleTime: 30_000,
  })
}
