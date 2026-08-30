import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  CalendarSearchData,
  CalendarSearchFilters,
  CalendarTask,
  CalendarTaskFilters,
} from '../types/calendar.types'

export async function getCalendarTasks(filters: CalendarTaskFilters): Promise<CalendarTask[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: CalendarTask[] }>>(
    '/calendar/tasks',
    {
      params: {
        start: filters.start,
        end: filters.end,
        scope: filters.scope,
        search: filters.search?.trim() || undefined,
        status: filters.status,
        priority: filters.priority,
        listId: filters.scope === 'PERSONAL' ? filters.listId : undefined,
        cycleId: filters.scope === 'KPI' ? filters.cycleId : undefined,
        kpiInstanceId: filters.scope === 'KPI' ? filters.kpiInstanceId : undefined,
      },
    },
  )

  return response.data.data.items
}


export async function searchCalendarTasks(
  filters: CalendarSearchFilters,
): Promise<CalendarSearchData> {
  const response = await apiClient.get<ApiSuccessResponse<CalendarSearchData>>('/calendar/search', {
    params: {
      q: filters.query.trim(),
      scope: filters.scope,
      status: filters.status,
      priority: filters.priority,
      listId: filters.scope === 'PERSONAL' ? filters.listId : undefined,
      cycleId: filters.scope === 'KPI' ? filters.cycleId : undefined,
      kpiInstanceId: filters.scope === 'KPI' ? filters.kpiInstanceId : undefined,
    },
  })

  return response.data.data
}
