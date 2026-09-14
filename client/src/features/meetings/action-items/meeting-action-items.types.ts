import type { TaskPriority, TaskStatus } from '@/features/tasks/types/task.types'

export interface MeetingActionItem {
  taskId: number
  meetingId: number
  meetingTitle: string
  organizerUserId: number
  organizerName: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  startDate: string | null
  dueDate: string | null
  isOverdue: boolean
  subtaskTotal: number
  subtaskCompleted: number
  assigneeUserId: number
  assigneeName: string
  assignedByUserId: number
  assignedByName: string
  agendaItemId: number | null
  agendaTitle: string | null
  assignedAtUtc: string
  rowVersion: string
}

export interface MeetingActionItemAssigneeOption {
  userId: number
  userCode: string
  userName: string
  eligible: boolean
}

export interface CreateMeetingActionItemInput {
  title: string
  description?: string | null
  priority: TaskPriority
  startDate?: string | null
  dueDate?: string | null
  assigneeUserId: number
  agendaItemId?: number | null
}

export interface ReassignMeetingActionItemInput {
  assigneeUserId: number
  rowVersion: string
}

export type AssignedActionItemDueFilter = 'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NO_DATE'
export type AssignedActionItemSortField = 'assignedAt' | 'dueDate' | 'priority' | 'title' | 'status' | 'meeting'
export type AssignedActionItemGroupBy = 'NONE' | 'MEETING' | 'DUE_DATE' | 'PRIORITY' | 'STATUS'

export interface AssignedMeetingActionItemsQuery {
  page: number
  pageSize: number
  search?: string
  meetingId?: number
  status?: TaskStatus
  priority?: TaskPriority
  due?: AssignedActionItemDueFilter
  sortBy?: AssignedActionItemSortField
  sortDirection?: 'asc' | 'desc'
  groupBy?: AssignedActionItemGroupBy
}

export interface AssignedMeetingActionItemSummary {
  total: number
  todo: number
  inProgress: number
  done: number
  cancelled: number
  overdue: number
  subtaskTotal: number
  subtaskCompleted: number
}

export interface AssignedMeetingOption {
  meetingId: number
  meetingTitle: string
}

export interface AssignedMeetingActionItemsData {
  items: MeetingActionItem[]
  page: number
  pageSize: number
  total: number
  summary: AssignedMeetingActionItemSummary
  meetings: AssignedMeetingOption[]
}

export interface MeetingActionItemListData {
  items: MeetingActionItem[]
  canCreate: boolean
}
