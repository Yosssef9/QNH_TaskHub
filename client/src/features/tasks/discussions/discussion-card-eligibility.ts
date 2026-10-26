import type { PersonalTask } from '../types/task.types'

/**
 * The unread endpoint reports server-authorized tasks (including 0-unread ones).
 * On the task owner's own list, the task card also has an authorization-scoped
 * assignee roster. That lets us show a discussion entry while the unread query
 * is still loading or temporarily unavailable, without inventing an unread count.
 * Discussion reads/writes still require the backend's per-scope authorization.
 */
export function canShowOwnedTaskDiscussionShortcut(
  task: Pick<PersonalTask, 'id' | 'kpiInstanceId' | 'teamRoster' | 'teamMemberCount' | 'meetingActionItem'>,
  currentUserId: number | undefined,
  authorizedUnreadCounts: Record<number, number> | undefined,
): boolean {
  if (task.kpiInstanceId !== null) return false
  if (authorizedUnreadCounts && Object.prototype.hasOwnProperty.call(authorizedUnreadCounts, task.id)) return true
  if (currentUserId === undefined) return false

  // My Tasks contains tasks owned by the signed-in employee, not shared-only tasks.
  // A roster member other than the owner establishes the other participant.
  if (task.teamRoster?.some(member => Number(member.userId) !== currentUserId)) return true
  // Even if a roster isn't returned, two distinct active assignees prove that
  // this task has a multi-user discussion audience.
  if ((task.teamMemberCount ?? 0) > 1) return true
  // Older meeting-action tasks sometimes lack the newer team projection.
  return task.meetingActionItem !== null && task.meetingActionItem?.assigneeUserId !== currentUserId
}
