export type WorkTab = 'attention' | 'assigned' | 'shared' | 'personal' | 'delegated'
export type WorkStatus = 'ACTIVE' | 'ALL' | 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export type WorkPriority = 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'
export type WorkDue = 'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NO_DATE'

export interface WorkFilters {
  tab: WorkTab
  page: number
  pageSize: number
  search: string
  status: WorkStatus
  priority: WorkPriority
  due: WorkDue
  sort: 'urgency' | 'created' | 'due' | 'priority'
}
export interface WorkItem {
  taskId: number
  ownerUserId: number
  ownerName: string
  listId: number | null
  listName: string | null
  meetingId: number | null
  title: string
  status: Exclude<WorkStatus, 'ALL' | 'ACTIVE'>
  priority: Exclude<WorkPriority, 'ALL'>
  dueDate: string | null
  createdAtUtc: string
  isAssigned: boolean
  isShared: boolean
  isPersonal: boolean
  isDelegated: boolean
  completedAssignments: number
  totalAssignments: number
}
export interface WorkSummary {
  assigned: number
  shared: number
  personal: number
  delegated: number
  attention: number
  dueToday: number
  overdue: number
}
export interface WorkResponse {
  summary: WorkSummary
  items: WorkItem[]
  page: number
  pageSize: number
  total: number
}
