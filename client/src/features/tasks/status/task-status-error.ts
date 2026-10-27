import { toApiClientError } from '@/lib/api-error'

/** Translate documented backend status-change denials, never show raw SQL/server errors. */
const STATUS_ERROR_KEYS: Readonly<Record<string, string>> = {
  GENERAL_TASK_OWNER_CANNOT_COMPLETE: 'tasks.statusErrors.ownerCannotComplete',
  MEETING_ACTION_ITEM_OWNER_CANNOT_COMPLETE: 'tasks.statusErrors.meetingOwnerCannotComplete',
  GENERAL_SUBTASK_ASSIGNEE_CANNOT_COMPLETE_MAIN: 'tasks.statusErrors.subtaskAssigneeCannotCompleteMain',
  GENERAL_TASK_ASSIGNEE_CANNOT_CANCEL: 'tasks.statusErrors.assigneeCannotCancel',
  MEETING_ACTION_ITEM_ASSIGNEE_STATUS_FORBIDDEN: 'tasks.statusErrors.meetingAssigneeStatusForbidden',
  COLLABORATION_STATUS_AUTOMATIC: 'tasks.statusErrors.collaborationAutomatic',
  TASK_STATUS_FORBIDDEN: 'tasks.statusErrors.permissionDenied',
  TASK_SUBTASKS_INCOMPLETE: 'tasks.assignment.incompleteGeneric',
  TASK_STATUS_TRANSITION_INVALID: 'tasks.statusErrors.invalidTransition',
  WORK_CYCLE_CLOSED: 'tasks.statusErrors.workCycleClosed',
  TASK_NOT_FOUND: 'tasks.statusErrors.notFound',
  TASK_LIST_ARCHIVED: 'tasks.statusErrors.archivedList',
}

export function taskStatusErrorKey(error: unknown): string {
  const { code } = toApiClientError(error)
  return STATUS_ERROR_KEYS[code] ?? 'tasks.statusErrors.generic'
}

/** Reuse the same toast ID for a task so repeat clicks don't stack duplicate errors. */
export function taskStatusToastId(taskId: number): string {
  return `task-status-error-${taskId}`
}
