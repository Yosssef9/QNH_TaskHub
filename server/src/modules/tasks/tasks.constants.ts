export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export const TASK_DUE_FILTERS = ["ALL", "OVERDUE", "TODAY", "UPCOMING", "NO_DATE"] as const;
export const TASK_SORT_FIELDS = ["createdAt", "dueDate", "priority", "title", "status"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskDueFilter = (typeof TASK_DUE_FILTERS)[number];
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
