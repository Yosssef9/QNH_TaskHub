import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type { TaskListFilters } from '../types/task.types'

export type TaskGroup = {
  id: number
  listId: number
  parentGroupId: number | null
  name: string
  displayOrder: number
  directTaskCount: number
  totalTaskCount: number
  directDoneCount: number
  totalDoneCount: number
}
export type GroupCollection = { groups: TaskGroup[]; ungroupedCount: number; ungroupedDoneCount: number }

export type TaskGroupFilters = Pick<TaskListFilters,
  'search' | 'status' | 'priority' | 'due' | 'taskType' | 'tagIds' | 'tagMatch'>;

export async function getTaskGroups(listId: number, filters?: TaskGroupFilters): Promise<GroupCollection> {
  const r = await apiClient.get<ApiSuccessResponse<GroupCollection>>(`/lists/${listId}/groups`, {
    params: filters ? {
      search: filters.search.trim() || undefined,
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      due: filters.due,
      taskType: filters.taskType,
      tagIds: filters.tagIds || undefined,
      tagMatch: filters.tagMatch,
    } : undefined,
  })
  return r.data.data
}
export async function createTaskGroup(input: {listId:number;name:string;parentGroupId:number|null}) {
  const {listId,...values}=input
  await apiClient.post(`/lists/${listId}/groups`,values)
}
export async function updateTaskGroup(input: {listId:number;id:number;name?:string;parentGroupId?:number|null;displayOrder?:number}) {
  const {listId,id,...values}=input
  await apiClient.patch(`/lists/${listId}/groups/${id}`,values)
}
export async function deleteTaskGroup(input:{listId:number;id:number}) {
  await apiClient.delete(`/lists/${input.listId}/groups/${input.id}`)
}
export async function moveTaskToGroup(input:{taskId:number;groupId:number|null}) {
  await apiClient.patch(`/tasks/${input.taskId}/group`,{groupId:input.groupId})
}

export async function reorderTaskGroups(input:{listId:number;parentGroupId:number|null;groupIds:number[]}){
  const {listId,...body}=input
  await apiClient.put(`/lists/${listId}/groups/order`,body)
}

export async function bulkMoveTasks(input:{listId:number;taskIds:number[];groupId:number|null}){
  const {listId,...body}=input
  await apiClient.patch(`/lists/${listId}/groups/tasks/bulk`,body)
}
