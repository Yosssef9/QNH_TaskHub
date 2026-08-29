import type { TaskPriority, TaskStatus } from '@/features/tasks/types/task.types'

export const CALENDAR_SCOPES = ['PERSONAL', 'KPI'] as const
export type CalendarScope = (typeof CALENDAR_SCOPES)[number]
export type CalendarDateSource = 'DUE_DATE' | 'START_DATE'
export type CalendarViewMode = 'MONTH' | 'AGENDA'

export interface CalendarTask {
  id: number
  title: string
  calendarDate: string
  calendarDateSource: CalendarDateSource
  status: TaskStatus
  priority: TaskPriority
  startDate: string | null
  dueDate: string | null
  isOverdue: boolean
  listId: number | null
  listName: string | null
  cycleId: number | null
  cycleTitle: string | null
  kpiInstanceId: number | null
  kpiTemplateId: number | null
  kpiName: string | null
  isReadOnly: boolean
}

export interface CalendarTaskFilters {
  start: string
  end: string
  scope: CalendarScope
  search: string
  status?: TaskStatus | undefined
  priority?: TaskPriority | undefined
  listId?: number | undefined
  cycleId?: number | undefined
  kpiInstanceId?: number | undefined
}

export interface CalendarVisibleRange {
  start: string
  end: string
  currentDate: string
}
