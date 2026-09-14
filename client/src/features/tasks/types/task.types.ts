export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export const TASK_DUE_FILTERS = ['ALL', 'OVERDUE', 'TODAY', 'UPCOMING', 'NO_DATE'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskDueFilter = (typeof TASK_DUE_FILTERS)[number]
export type TaskSortField = 'createdAt' | 'dueDate' | 'priority' | 'title' | 'status'

export interface MeetingActionItemTaskContext {
  meetingId: number
  meetingTitle: string
  assigneeUserId: number
  assigneeName: string
  assignedByUserId: number
  assignedByName: string
  agendaItemId: number | null
  agendaTitle: string | null
  assignedAtUtc: string
}

export interface PersonalTask {
  id: number
  listId: number | null
  kpiInstanceId: number | null
  kpiId: number | null
  cycleId: number | null
  cycleTitle: string | null
  kpiName: string | null
  kpiIconKey: string | null
  kpiColor: string | null
  isReadOnly: boolean
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  startDate: string | null
  dueDate: string | null
  referenceDate: string | null
  displayOrder: number
  createdAtUtc: string
  updatedAtUtc: string | null
  completedAtUtc: string | null
  cancelledAtUtc: string | null
  cancellationReason: string | null
  isOverdue: boolean
  subtaskTotal: number
  subtaskCompleted: number
  meetingActionItem: MeetingActionItemTaskContext | null
}

export interface TaskListFilters {
  search: string
  status?: TaskStatus
  priority?: TaskPriority
  due: TaskDueFilter
  sortBy: TaskSortField
  sortDirection: 'asc' | 'desc'
  page: number
  pageSize: number
  kpiId?: number
  cycleId?: number
}

export interface TaskListResult {
  items: PersonalTask[]
  page: number
  pageSize: number
  total: number
}

export interface TaskSummary {
  total: number
  todo: number
  inProgress: number
  done: number
  cancelled: number
  overdue: number
  subtaskTotal: number
  subtaskCompleted: number
}

export interface SaveTaskInput {
  title: string
  description?: string | null
  priority: TaskPriority
  startDate?: string | null
  dueDate?: string | null
  listId?: number
  referenceDate?: string | null
}

export interface Subtask {
  id: number
  taskId: number
  title: string
  isCompleted: boolean
  dueDate: string | null
  displayOrder: number
  createdAtUtc: string
  updatedAtUtc: string | null
  completedAtUtc: string | null
}

export interface TaskAttachment {
  id: string
  taskId: number | null
  subtaskId: number | null
  originalFileName: string
  mimeType: string
  fileExtension: string
  sizeBytes: number
  uploadedByUserId: number
  uploadedByName: string
  uploadedAtUtc: string
}

export interface TaskActivity {
  id: number
  actorUserId: number
  actorName: string
  activityType: string
  eventData: Record<string, unknown> | null
  createdAtUtc: string
}


export interface TaskActionItemContext {
  taskId: number
  ownerUserId: number
  meetingId: number
  meetingTitle: string
  organizerUserId: number
  organizerName: string
  assigneeUserId: number
  assigneeName: string
  assignedByUserId: number
  assignedByName: string
  agendaItemId: number | null
  agendaTitle: string | null
  assignedAtUtc: string
  rowVersion: string
}

export interface TaskCapabilities {
  role: 'OWNER' | 'ASSIGNEE'
  canEditDetails: boolean
  canManageSubtasks: boolean
  canCompleteSubtasks: boolean
  canUploadAttachments: boolean
  canDeleteAnyAttachment: boolean
  canCompleteTask: boolean
  canChangeNonCompletionStatus: boolean
  canDeleteRestoreTask: boolean
}

export interface TaskDetails {
  task: PersonalTask
  actionItem: TaskActionItemContext | null
  capabilities: TaskCapabilities
  subtasks: Subtask[]
  attachments: TaskAttachment[]
  activity: TaskActivity[]
  progress: { completed: number; total: number; percentage: number }
}

