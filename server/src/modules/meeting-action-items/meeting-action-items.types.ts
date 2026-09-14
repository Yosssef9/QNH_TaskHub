import type { TaskPriority, TaskStatus } from "../tasks/tasks.constants.js";

export type MeetingActionItemActorRole = "OWNER" | "ASSIGNEE";

export interface MeetingActionItemCapabilities {
  role: MeetingActionItemActorRole;
  canEditDetails: boolean;
  canManageSubtasks: boolean;
  canCompleteSubtasks: boolean;
  canUploadAttachments: boolean;
  canDeleteAnyAttachment: boolean;
  canCompleteTask: boolean;
  canChangeNonCompletionStatus: boolean;
  canDeleteRestoreTask: boolean;
}

export interface MeetingActionItemContext {
  taskId: number;
  ownerUserId: number;
  meetingId: number;
  meetingTitle: string;
  organizerUserId: number;
  organizerName: string;
  assigneeUserId: number;
  assigneeName: string;
  assignedByUserId: number;
  assignedByName: string;
  agendaItemId: number | null;
  agendaTitle: string | null;
  assignedAtUtc: string;
  rowVersion: string;
}

export interface CreateMeetingActionItemInput {
  title: string;
  description?: string | null | undefined;
  priority: TaskPriority;
  startDate?: string | null | undefined;
  dueDate?: string | null | undefined;
  assigneeUserId: number;
  agendaItemId?: number | null | undefined;
}

export interface ReassignMeetingActionItemInput {
  assigneeUserId: number;
  rowVersion: string;
}

export interface MeetingActionItemListItem {
  taskId: number;
  meetingId: number;
  meetingTitle: string;
  organizerUserId: number;
  organizerName: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  subtaskTotal: number;
  subtaskCompleted: number;
  assigneeUserId: number;
  assigneeName: string;
  assignedByUserId: number;
  assignedByName: string;
  agendaItemId: number | null;
  agendaTitle: string | null;
  assignedAtUtc: string;
  rowVersion: string;
}

export interface MeetingActionItemAssigneeOption {
  userId: number;
  userCode: string;
  userName: string;
  eligible: boolean;
}

export interface MeetingActionItemListData {
  items: MeetingActionItemListItem[];
  canCreate: boolean;
}

export interface MeetingActionItemMeetingSummary {
  total: number;
  completed: number;
  overdue: number;
}

export type AssignedActionItemDueFilter = "ALL" | "OVERDUE" | "TODAY" | "UPCOMING" | "NO_DATE";
export type AssignedActionItemSortField = "assignedAt" | "dueDate" | "priority" | "title" | "status" | "meeting";
export type AssignedActionItemGroupBy = "NONE" | "MEETING" | "DUE_DATE" | "PRIORITY" | "STATUS";

export interface AssignedMeetingActionItemQuery {
  page: number;
  pageSize: number;
  search: string;
  meetingId?: number | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  due: AssignedActionItemDueFilter;
  sortBy: AssignedActionItemSortField;
  sortDirection: "asc" | "desc";
  groupBy: AssignedActionItemGroupBy;
}

export interface AssignedMeetingActionItemSummary {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  cancelled: number;
  overdue: number;
  subtaskTotal: number;
  subtaskCompleted: number;
}

export interface AssignedMeetingOption {
  meetingId: number;
  meetingTitle: string;
}

export interface AssignedMeetingActionItemListData {
  items: MeetingActionItemListItem[];
  page: number;
  pageSize: number;
  total: number;
  summary: AssignedMeetingActionItemSummary;
  meetings: AssignedMeetingOption[];
}

