import { describe, expect, it } from 'vitest'
import { ApiClientError } from '@/lib/api-error'
import { taskStatusErrorKey, taskStatusToastId } from './task-status-error'

describe('task status error feedback', () => {
  it.each([
    ['GENERAL_TASK_OWNER_CANNOT_COMPLETE', 'tasks.statusErrors.ownerCannotComplete'],
    ['MEETING_ACTION_ITEM_OWNER_CANNOT_COMPLETE', 'tasks.statusErrors.meetingOwnerCannotComplete'],
    ['GENERAL_SUBTASK_ASSIGNEE_CANNOT_COMPLETE_MAIN', 'tasks.statusErrors.subtaskAssigneeCannotCompleteMain'],
    ['GENERAL_TASK_ASSIGNEE_CANNOT_CANCEL', 'tasks.statusErrors.assigneeCannotCancel'],
    ['MEETING_ACTION_ITEM_ASSIGNEE_STATUS_FORBIDDEN', 'tasks.statusErrors.meetingAssigneeStatusForbidden'],
    ['COLLABORATION_STATUS_AUTOMATIC', 'tasks.statusErrors.collaborationAutomatic'],
    ['TASK_STATUS_FORBIDDEN', 'tasks.statusErrors.permissionDenied'],
    ['TASK_SUBTASKS_INCOMPLETE', 'tasks.assignment.incompleteGeneric'],
    ['TASK_STATUS_TRANSITION_INVALID', 'tasks.statusErrors.invalidTransition'],
    ['WORK_CYCLE_CLOSED', 'tasks.statusErrors.workCycleClosed'],
    ['TASK_NOT_FOUND', 'tasks.statusErrors.notFound'],
  ])('displays a specific error for %s', (code, expected) => {
    expect(taskStatusErrorKey(new ApiClientError('ignored', code, 403))).toBe(expected)
  })

  it('does not display raw unexpected server errors', () => {
    expect(taskStatusErrorKey(new ApiClientError('SQL internal error', 'DATABASE_ERROR', 500)))
      .toBe('tasks.statusErrors.generic')
    expect(taskStatusErrorKey(new Error('offline'))).toBe('tasks.statusErrors.generic')
  })

  it('uses the same toast id on repeated attempts for the same task', () => {
    expect(taskStatusToastId(109)).toBe(taskStatusToastId(109))
    expect(taskStatusToastId(109)).not.toBe(taskStatusToastId(110))
  })
})
