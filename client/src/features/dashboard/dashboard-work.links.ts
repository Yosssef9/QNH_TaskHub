import type { WorkItem, WorkTab } from './types/dashboard-work.types'

export function taskHref(task: WorkItem, tab: WorkTab) {
  if (tab === 'shared' || (task.isShared && !task.isAssigned && !task.isPersonal)) return `/shared-tasks?tab=with&taskId=${task.taskId}`
  if (task.isAssigned) return `/assigned-to-me?taskId=${task.taskId}`
  if (task.listId !== null) return `/lists/${task.listId}?taskId=${task.taskId}`
  return '/assigned-to-me'
}

