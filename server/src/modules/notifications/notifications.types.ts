export const NOTIFICATION_TYPES = [
  "TASK_OVERDUE",
  "TASK_DUE_TODAY",
  "HIGH_PRIORITY_TASK_DUE_TOMORROW",
  "CURRENT_CYCLE_ENDING_SOON",
  "CURRENT_CYCLE_PAST_END",
  "KPI_BELOW_TARGET",
  "KPI_MEASUREMENT_DUE",
  "CONTRACT_EXPIRATION_REMINDER",
  "CONTRACT_NOTICE_DEADLINE_REMINDER",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationItem {
  id: number;
  type: NotificationType;
  subjectTitle: string;
  contextTitle: string | null;
  eventDate: string | null;
  actualValue: number | null;
  targetValue: number | null;
  measurementUnit: "PERCENT" | "NUMBER" | null;
  readAtUtc: string | null;
  createdAtUtc: string;
  href: string;
}

export interface NotificationListData {
  items: NotificationItem[];
  unreadCount: number;
}
