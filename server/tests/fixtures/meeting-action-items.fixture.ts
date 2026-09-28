import type { AccessProfileRecord } from "../../src/modules/auth/auth.repository.js";
import type { TaskHubAccess } from "../../src/modules/auth/auth.types.js";
import type {
  MeetingActionItemContext,
  MeetingActionItemListItem,
} from "../../src/modules/meeting-action-items/meeting-action-items.types.js";
import type { MeetingAccessContext } from "../../src/modules/meetings/meeting-workspace.repository.js";
import type { AttachmentRecord, SubtaskRecord } from "../../src/modules/task-details/task-details.types.js";
import type { TaskRecord } from "../../src/modules/tasks/tasks.types.js";

export const OWNER = 100;
export const ASSIGNEE = 200;
export const VIEWER = 300;
export const MEETING = 10;
export const TASK = 1001;
export const SUBTASK = 2001;
export const FILE = "22222222-2222-4222-8222-222222222222";

export function meetingAccess(overrides: Partial<TaskHubAccess> = {}): TaskHubAccess {
  return {
    roleCode: "USER", permissions: [],
    meetingOrganizeEnabled: false, meetingCoordinateEnabled: false,
    ...overrides,
  };
}

export function accessProfile(overrides: Partial<AccessProfileRecord> = {}): AccessProfileRecord {
  return {
    roleCode: "USER", isActive: true,
    meetingOrganizeEnabled: false, meetingCoordinateEnabled: false,
    languageCode: "EN", theme: "SYSTEM", sidebarCollapsed: false,
    calendarShowAdjacentDates: true, meetingStartReminderEnabled: true,
    timeFormat: "12H", meetingScheduleSlotInterval: 30,
    timezone: "Asia/Riyadh", hasDefaultList: true,
    ...overrides,
  };
}

export function meetingContext(overrides: Partial<MeetingAccessContext> = {}): MeetingAccessContext {
  return {
    meetingId: MEETING, organizerUserId: OWNER, status: "SCHEDULED",
    currentRevisionId: 20, meetingRowVersion: "0x0000000000000001",
    isAttendee: true, hasPendingReschedule: false,
    ...overrides,
  };
}

export function actionContext(overrides: Partial<MeetingActionItemContext> = {}): MeetingActionItemContext {
  return {
    taskId: TASK, ownerUserId: OWNER, meetingId: MEETING,
    meetingTitle: "Test meeting", organizerUserId: OWNER, organizerName: "Test Organizer",
    assigneeUserId: ASSIGNEE, assigneeName: "Test Assignee",
    assignedByUserId: OWNER, assignedByName: "Test Organizer",
    agendaItemId: null, agendaTitle: null,
    assignedAtUtc: "2026-09-01T10:00:00.000Z", rowVersion: "0x0000000000000001",
    ...overrides,
  };
}

export function actionItem(overrides: Partial<MeetingActionItemListItem> = {}): MeetingActionItemListItem {
  const relation = actionContext();
  return {
    ...relation, title: "Shared action item", description: "Full task description",
    status: "TODO", priority: "MEDIUM", startDate: null, dueDate: null,
    isOverdue: false, subtaskTotal: 1, subtaskCompleted: 0,
    ...overrides,
  };
}

export function taskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: TASK, listId: 7, kpiInstanceId: null, kpiId: null, cycleId: null,
    cycleTitle: null, kpiName: null, kpiIconKey: null, kpiColor: null,
    cycleClosedAtUtc: null, title: "Shared action item", description: "Full task description",
    status: "TODO", priority: "MEDIUM", startDate: null, dueDate: null,
    referenceDate: null, displayOrder: 0, createdAtUtc: new Date("2026-09-01T10:00:00Z"),
    updatedAtUtc: null, completedAtUtc: null, cancelledAtUtc: null,
    cancellationReason: null, deletedAtUtc: null, isOverdue: false,
    subtaskTotal: 1, subtaskCompleted: 0,
    actionMeetingId: MEETING, actionMeetingTitle: "Test meeting",
    actionAssigneeUserId: ASSIGNEE, actionAssigneeName: "Test Assignee",
    actionAssignedByUserId: OWNER, actionAssignedByName: "Test Organizer",
    actionAgendaItemId: null, actionAgendaTitle: null,
    actionAssignedAtUtc: new Date("2026-09-01T10:00:00Z"),
    ...overrides,
  };
}

export function subtaskRecord(): SubtaskRecord {
  return {
    id: SUBTASK, taskId: TASK, title: "Shared subtask", isCompleted: false,
    dueDate: null, displayOrder: 0, createdAtUtc: new Date("2026-09-01T10:00:00Z"),
    updatedAtUtc: null, completedAtUtc: null,
  };
}

export function attachmentRecord(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: FILE, taskId: TASK, subtaskId: null,
    originalFileName: "test-report.pdf", storageKey: "private-test-key.pdf",
    mimeType: "application/pdf", fileExtension: ".pdf", sizeBytes: 4,
    uploadedByUserId: ASSIGNEE, uploadedByName: "Test Assignee",
    uploadedAtUtc: new Date("2026-09-01T10:00:00Z"),
    ...overrides,
  };
}
