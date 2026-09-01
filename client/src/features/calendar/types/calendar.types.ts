import type { TaskPriority, TaskStatus } from '@/features/tasks/types/task.types'

export const CALENDAR_SCOPES = ['PERSONAL', 'KPI'] as const
export const CALENDAR_SOURCES = ['PERSONAL', 'KPI', 'MEETINGS'] as const

export type CalendarScope = (typeof CALENDAR_SCOPES)[number]
export type CalendarSource = (typeof CALENDAR_SOURCES)[number]
export type CalendarDateSource = 'DUE_DATE' | 'START_DATE'
export type CalendarViewMode = 'MONTH' | 'WEEK' | 'DAY' | 'AGENDA'

export interface CalendarSourceSelection {
  personal: boolean
  kpi: boolean
  meetings: boolean
}

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
  search?: string | undefined
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

export interface CalendarSearchFilters {
  query: string
  scopes: CalendarScope[]
  status?: TaskStatus | undefined
  priority?: TaskPriority | undefined
  listId?: number | undefined
  cycleId?: number | undefined
  kpiInstanceId?: number | undefined
}

export interface CalendarSearchData {
  items: CalendarTask[]
  total: number
}

export interface CalendarSearchTarget {
  taskId: number
  calendarDate: string
  requestId: number
}
