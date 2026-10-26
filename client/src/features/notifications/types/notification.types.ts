export const NOTIFICATION_TYPES = [
  'TASK_OVERDUE',
  'TASK_DUE_TODAY',
  'HIGH_PRIORITY_TASK_DUE_TOMORROW',
  'CURRENT_CYCLE_ENDING_SOON',
  'CURRENT_CYCLE_PAST_END',
  'KPI_BELOW_TARGET',
  'KPI_MEASUREMENT_DUE',
  'CONTRACT_EXPIRATION_REMINDER',
  'CONTRACT_NOTICE_DEADLINE_REMINDER',
  'MEETING_REQUEST_SUBMITTED',
  'MEETING_REQUEST_UPDATED',
  'MEETING_APPROVED',
  'MEETING_REJECTED',
  'MEETING_INVITED',
  'MEETING_RESCHEDULED',
  'MEETING_RESCHEDULE_REQUEST_CANCELLED',
  'MEETING_CANCELLED',
  'MEETING_SERIES_SCHEDULED',
  'MEETING_START_REMINDER',
  'MEETING_ACTION_ITEM_ASSIGNED',
  'MEETING_ACTION_ITEM_COMPLETED',
  'GENERAL_TASK_ASSIGNED',
  'GENERAL_SUBTASK_ASSIGNED',
  'GENERAL_TASK_COMPLETED',
  'GENERAL_ASSIGNMENT_REMOVED',
  'GENERAL_TASK_DUE_CHANGED',
  'GENERAL_SUBTASK_DUE_CHANGED',
  'GENERAL_TASK_REOPENED',
  'TASK_DISCUSSION_MESSAGE',
  'TASK_DISCUSSION_MENTION',
  'TASK_SHARED',
  'TASK_SHARE_UPDATED',
  'TASK_SHARE_REVOKED',
  'GENERAL_SUBTASK_COMPLETED',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export interface DiscussionNotificationDetails {
  status: 'active' | 'deleted' | 'unavailable';
  messageId?: number;
  senderName?: string | null;
  senderCode?: string | null;
  taskTitle?: string;
  subtaskTitle?: string | null;
  preview?: string | null;
  hasAttachment?: boolean;
}

export interface NotificationItem {
  id: number
  type: NotificationType
  subjectTitle: string
  contextTitle: string | null
  eventDate: string | null
  actualValue: number | null
  targetValue: number | null
  measurementUnit: 'PERCENT' | 'NUMBER' | null
  readAtUtc: string | null
  createdAtUtc: string
  href: string
  discussion?: DiscussionNotificationDetails
}

export interface NotificationListData {
  items: NotificationItem[]
  unreadCount: number
}








