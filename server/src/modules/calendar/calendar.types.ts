import type { TaskPriority, TaskStatus } from "../tasks/tasks.constants.js";

export const CALENDAR_SCOPES = ["PERSONAL", "KPI"] as const;
export const CALENDAR_DATE_SOURCES = ["DUE_DATE", "START_DATE"] as const;

export type CalendarScope = (typeof CALENDAR_SCOPES)[number];
export type CalendarDateSource = (typeof CALENDAR_DATE_SOURCES)[number];

export interface CalendarTasksQuery {
  start: string;
  end: string;
  scope: CalendarScope;
  search?: string | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  listId?: number | undefined;
  cycleId?: number | undefined;
  kpiInstanceId?: number | undefined;
}

export interface CalendarTaskRecord {
  id: number | string;
  title: string;
  status: string;
  priority: string;
  startDate: Date | null;
  dueDate: Date | null;
  calendarDate: Date;
  calendarDateSource: string;
  isOverdue: boolean;
  listId: number | string | null;
  listName: string | null;
  cycleId: number | string | null;
  cycleTitle: string | null;
  cycleClosedAtUtc: Date | null;
  kpiInstanceId: number | string | null;
  kpiTemplateId: number | string | null;
  kpiName: string | null;
}

export interface CalendarTask {
  id: number;
  title: string;
  calendarDate: string;
  calendarDateSource: CalendarDateSource;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  listId: number | null;
  listName: string | null;
  cycleId: number | null;
  cycleTitle: string | null;
  kpiInstanceId: number | null;
  kpiTemplateId: number | null;
  kpiName: string | null;
  isReadOnly: boolean;
}

export interface CalendarTasksData {
  items: CalendarTask[];
}
