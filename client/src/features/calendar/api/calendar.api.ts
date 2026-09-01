import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  CalendarScope,
  CalendarSearchData,
  CalendarSearchFilters,
  CalendarTask,
  CalendarTaskFilters,
} from '../types/calendar.types'

const CALENDAR_SEARCH_CLIENT_LIMIT = 30

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

async function searchOneCalendarScope(
  filters: CalendarSearchFilters,
  scope: CalendarScope,
): Promise<CalendarSearchData> {
  const response = await apiClient.get<ApiSuccessResponse<CalendarSearchData>>('/calendar/search', {
    params: {
      q: filters.query.trim(),
      scope,
      status: filters.status,
      priority: filters.priority,
      listId: scope === 'PERSONAL' ? filters.listId : undefined,
      cycleId: scope === 'KPI' ? filters.cycleId : undefined,
      kpiInstanceId: scope === 'KPI' ? filters.kpiInstanceId : undefined,
    },
  })

  return response.data.data
}

export async function searchCalendarTasks(
  filters: CalendarSearchFilters,
): Promise<CalendarSearchData> {
  const scopes = [...new Set(filters.scopes)]
  if (scopes.length === 0) return { items: [], total: 0 }

  const results = await Promise.all(scopes.map((scope) => searchOneCalendarScope(filters, scope)))
  const items = results
    .flatMap((result) => result.items)
    .sort(
      (left, right) =>
        left.calendarDate.localeCompare(right.calendarDate) ||
        left.title.localeCompare(right.title) ||
        left.id - right.id,
    )
    .slice(0, CALENDAR_SEARCH_CLIENT_LIMIT)

  return {
    items,
    total: results.reduce((sum, result) => sum + result.total, 0),
  }
}
