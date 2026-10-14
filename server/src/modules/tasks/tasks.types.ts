import type {
  SortDirection,
  TaskDueFilter,
  TaskPriority,
  TaskSortField,
  TaskStatus,
} from "./tasks.constants.js";

export interface MeetingActionItemTaskContext {
  meetingId: number;
  meetingTitle: string;
  assigneeUserId: number;
  assigneeName: string;
  assignedByUserId: number;
  assignedByName: string;
  agendaItemId: number | null;
  agendaTitle: string | null;
  assignedAtUtc: string;
}

export interface TaskRecord {
  id: number;
  listId: number | null;
  kpiInstanceId: number | null;
  kpiId: number | null;
  cycleId: number | null;
  cycleTitle: string | null;
  kpiName: string | null;
  kpiIconKey: string | null;
  kpiColor: string | null;
  cycleClosedAtUtc: Date | null;
  title: string;
  description: string | null;
  completionSummary?: string | null;
  autoCompletedFromSubtasks?: boolean;
  status: string;
  priority: string;
  startDate: Date | null;
  dueDate: Date | null;
  referenceDate: Date | null;
  displayOrder: number;
  createdAtUtc: Date;
  updatedAtUtc: Date | null;
  completedAtUtc: Date | null;
  cancelledAtUtc: Date | null;
  cancellationReason: string | null;
  deletedAtUtc: Date | null;
  isOverdue: boolean;
  subtaskTotal: number;
  subtaskCompleted: number;
  collaborationEnabled?: boolean;
  teamTask?: boolean;
  teamMemberCount?: number | string;
  mainAssigneeCount?: number | string;
  mainCompletedCount?: number | string;
  teamRosterJson?: string | null;
  taskTagsJson?: string | null;
  actionMeetingId: number | string | null;
  actionMeetingTitle: string | null;
  actionAssigneeUserId: number | null;
  actionAssigneeName: string | null;
  actionAssignedByUserId: number | null;
  actionAssignedByName: string | null;
  actionAgendaItemId: number | string | null;
  actionAgendaTitle: string | null;
  actionAssignedAtUtc: Date | null;
}

export interface PersonalTask {
  id: number;
  listId: number | null;
  kpiInstanceId: number | null;
  kpiId: number | null;
  cycleId: number | null;
  cycleTitle: string | null;
  kpiName: string | null;
  kpiIconKey: string | null;
  kpiColor: string | null;
  isReadOnly: boolean;
  title: string;
  description: string | null;
  completionSummary: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  referenceDate: string | null;
  displayOrder: number;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  completedAtUtc: string | null;
  cancelledAtUtc: string | null;
  cancellationReason: string | null;
  isOverdue: boolean;
  subtaskTotal: number;
  subtaskCompleted: number;
  collaborationEnabled?: boolean;
  teamTask?: boolean;
  teamMemberCount?: number;
  mainAssigneeCount?: number;
  mainCompletedCount?: number;
  teamRoster?: Array<{userId:number;userName:string;userCode:string;email:string|null;mainAssignee:boolean}>;
  tags?: Array<{id:number;name:string;scope:string;iconKind:string;iconKey:string|null;color:string}>;
  meetingActionItem: MeetingActionItemTaskContext | null;
}

export interface TaskListQuery {
  search?: string | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  taskType?: "ALL" | "TEAM" | "SINGLE" | "PERSONAL" | undefined;
  tagIds?: string | undefined;
  tagMatch?: "ANY" | "ALL" | "UNTAGGED" | undefined;
  due: TaskDueFilter;
  sortBy: TaskSortField;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export interface TaskListResult {
  items: PersonalTask[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TaskSummaryRecord {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  cancelled: number;
  overdue: number;
  subtaskTotal: number;
  subtaskCompleted: number;
}

export interface TaskSummary {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  cancelled: number;
  overdue: number;
  subtaskTotal: number;
  subtaskCompleted: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null | undefined;
  priority: TaskPriority;
  startDate?: string | null | undefined;
  dueDate?: string | null | undefined;
  assigneeUserId?: number | null | undefined;
  assigneeUserIds?: number[] | undefined;
  tagIds?: number[] | undefined;
}

export interface UpdateTaskInput {
  title?: string | undefined;
  description?: string | null | undefined;
  priority?: TaskPriority | undefined;
  startDate?: string | null | undefined;
  dueDate?: string | null | undefined;
  listId?: number | undefined;
  tagIds?: number[] | undefined;
  referenceDate?: string | null | undefined;
}

export interface ChangeTaskStatusInput {
  status: TaskStatus;
  cancellationReason?: string | undefined;
}



