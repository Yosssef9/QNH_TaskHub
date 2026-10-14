import { apiClient } from '@/lib/api-client'
import type { TaskTag } from '@/features/tasks/tags/tags.api'
import type { TaskDueFilter, TaskSortField, TaskTypeFilter } from '@/features/tasks/types/task.types'
import type { ApiSuccessResponse } from '@/types/api.types'

export type SharePermission = 'VIEW' | 'EDIT'
export interface ShareRecipient { userId: number; userName: string; userCode: string; email: string | null; permission: SharePermission }
export interface SharePerson { userId: number; userName: string; userCode: string; email: string | null }
export interface SharedTask {
  taskId: number; title: string; description: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH'; dueDate: string | null
  ownerUserId: number; ownerName: string; ownerCode: string; permission: SharePermission
  sharedAtUtc: string; recipientCount: number; tags: TaskTag[]
}
export interface SharedTaskList { items: SharedTask[]; total: number; page: number; pageSize: number }
export interface SharedTaskFilters {
  tab: 'with' | 'by'; page: number; pageSize: number; search: string; personId?: number
  permission: 'ALL' | SharePermission; status: string; priority: string
  taskType: TaskTypeFilter; due: TaskDueFilter; sortBy: TaskSortField; sortDirection: 'asc' | 'desc'
  tagIds?: string; tagMatch: 'ANY' | 'ALL' | 'UNTAGGED'
}
export async function listSharedTasks(params: SharedTaskFilters) {
  const r = await apiClient.get<ApiSuccessResponse<SharedTaskList>>('/task-shares', { params })
  return r.data.data
}
export async function listSharePeople(tab: 'with' | 'by') {
  const r = await apiClient.get<ApiSuccessResponse<SharePerson[]>>('/task-shares/people', { params: { tab } })
  return r.data.data
}
export async function getShareRecipients(taskId: number) {
  const r = await apiClient.get<ApiSuccessResponse<ShareRecipient[]>>(`/task-shares/${taskId}`)
  return r.data.data
}
export async function saveShareRecipients(taskId: number, recipients: Array<{ userId: number; permission: SharePermission }>) {
  const r = await apiClient.put<ApiSuccessResponse<ShareRecipient[]>>(`/task-shares/${taskId}`, { recipients })
  return r.data.data
}
export async function revokeTaskShare(taskId: number, userId: number) {
  await apiClient.delete(`/task-shares/${taskId}/${userId}`)
}
