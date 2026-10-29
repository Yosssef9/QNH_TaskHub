import type { TaskTag } from '../tags/tags.api'
import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type { TaskPriority, TaskStatus, TaskDueFilter, TaskTypeFilter } from '../types/task.types'

export interface EligibleTaskUser { userId: number; userCode: string; userName: string; email: string | null }
export interface EligibleTaskUsersResponse { items: EligibleTaskUser[]; page: number; pageSize: number }
export interface GeneralAssignedSubtask {
  id: number; title: string; dueDate: string | null; isCompleted: boolean; workNotes: string | null
}
export interface GeneralAssignedTask {
  taskId: number; title: string; description: string | null; status: TaskStatus; priority: TaskPriority
  dueDate: string | null; creatorUserId: number; creatorName: string; isMainAssignee: boolean
  subtaskTotal: number; subtaskCompleted: number; assignedSubtasks: GeneralAssignedSubtask[]
  isProxy?: boolean;teamTask?: boolean;teamMemberCount?: number;mainAssigneeCount?: number;mainCompletedCount?: number
  tags?: TaskTag[]
  teamRoster?: Array<{userId:number;userName:string;userCode:string;email:string|null;mainAssignee:boolean}>
}
export interface GeneralAssignedQuery {
  page: number; pageSize: number; search?: string; status?: TaskStatus; priority?: TaskPriority
  due?: TaskDueFilter; taskType?: TaskTypeFilter; tagIds?: string; tagMatch?: "ANY" | "ALL" | "UNTAGGED"; sortBy?: 'assignedAt' | 'dueDate' | 'priority' | 'title' | 'status'
  sortDirection?: 'asc' | 'desc'
}
export interface GeneralAssignedResponse { items: GeneralAssignedTask[]; page: number; pageSize: number; total: number }

export async function getEligibleTaskUsers(search: string, page = 1) {
  const result = await apiClient.get<ApiSuccessResponse<EligibleTaskUsersResponse>>('/general-assignments/eligible-users', {
    params: { search, page, pageSize: 50 },
  })
  return result.data.data
}
export async function getAssignedGeneralTasks(query: GeneralAssignedQuery) {
  const result = await apiClient.get<ApiSuccessResponse<GeneralAssignedResponse>>('/general-assignments/assigned', { params: query })
  return result.data.data
}
export async function assignMainTask(input: {taskId: number; assigneeUserId: number | null}) {
  await apiClient.put(`/general-assignments/task/${input.taskId}/assignee`, { assigneeUserId: input.assigneeUserId })
}
export async function assignSubtask(input: {subtaskId: number; assigneeUserId: number | null}) {
  await apiClient.put(`/general-assignments/subtask/${input.subtaskId}/assignee`, { assigneeUserId: input.assigneeUserId })
}
export async function saveWorkNotes(input: {subtaskId: number; workNotes: string | null}) {
  await apiClient.post(`/general-assignments/subtask/${input.subtaskId}/work-notes`, {workNotes: input.workNotes})
}
export async function saveCompletionSummary(input: {taskId: number; completionSummary: string | null}) {
  await apiClient.post(`/general-assignments/task/${input.taskId}/completion-summary`, {completionSummary:input.completionSummary})
}

export async function getEligibleTaskUser(userId: number) {
  const result = await apiClient.get<ApiSuccessResponse<EligibleTaskUser>>(`/general-assignments/eligible-users/${userId}`)
  return result.data.data
}




export async function setTaskProxy(input:{taskId:number;subtaskId?:number|null;proxyUserId:number|null}){
  const endpoint=input.subtaskId == null ? `/general-assignments/task/${input.taskId}/proxy`
    : `/general-assignments/subtask/${input.subtaskId}/proxy`
  await apiClient.put(endpoint,{proxyUserId:input.proxyUserId})
}
