import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  PersonalTask,
  SaveTaskInput,
  TaskListFilters,
  TaskListResult,
  TaskSummary,
  TaskStatus,
  TaskDetails,
  Subtask,
  TaskAttachment,
} from '../types/task.types'

export async function getTaskSummary(listId: number): Promise<TaskSummary> {
  const response = await apiClient.get<ApiSuccessResponse<TaskSummary>>(
    `/lists/${listId}/tasks/summary`,
  )
  return response.data.data
}

export async function getTasks(listId: number, filters: TaskListFilters): Promise<TaskListResult> {
  const response = await apiClient.get<ApiSuccessResponse<TaskListResult>>(
    `/lists/${listId}/tasks`,
    {
      params: {
        ...filters,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
      },
    },
  )
  return response.data.data
}

export async function getKpiTasks(
  instanceId: number,
  filters: TaskListFilters,
): Promise<TaskListResult> {
  const response = await apiClient.get<ApiSuccessResponse<TaskListResult>>(`/kpi-instances/${instanceId}/tasks`, {
    params: {
      ...filters,
      status: filters.status || undefined,
      priority: filters.priority || undefined,
    },
  })
  return response.data.data
}

export async function getAllKpiTasks(filters: TaskListFilters): Promise<TaskListResult> {
  const response = await apiClient.get<ApiSuccessResponse<TaskListResult>>('/kpi-tasks', {
    params: {
      ...filters,
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      kpiId: filters.kpiId || undefined,
      cycleId: filters.cycleId || undefined,
    },
  })
  return response.data.data
}

export async function createTask(input: {
  listId: number
  values: SaveTaskInput
}): Promise<PersonalTask> {
  const values = { ...input.values }
  delete values.listId
  const response = await apiClient.post<ApiSuccessResponse<{ task: PersonalTask }>>(
    `/lists/${input.listId}/tasks`,
    values,
  )
  return response.data.data.task
}

export async function createKpiTask(input: {
  kpiInstanceId: number
  values: SaveTaskInput
}): Promise<PersonalTask> {
  const values = { ...input.values }
  delete values.listId
  const response = await apiClient.post<ApiSuccessResponse<{ task: PersonalTask }>>(
    `/kpi-instances/${input.kpiInstanceId}/tasks`,
    values,
  )
  return response.data.data.task
}

export async function createGlobalKpiTask(input: {
  cycleId: number
  kpiInstanceId: number
  values: SaveTaskInput
}): Promise<PersonalTask> {
  const response = await apiClient.post<ApiSuccessResponse<{ task: PersonalTask }>>('/kpi-tasks', {
    ...input.values,
    cycleId: input.cycleId,
    kpiInstanceId: input.kpiInstanceId,
  })
  return response.data.data.task
}

export async function updateTask(input: {
  taskId: number
  values: SaveTaskInput
}): Promise<PersonalTask> {
  const response = await apiClient.patch<ApiSuccessResponse<{ task: PersonalTask }>>(
    `/tasks/${input.taskId}`,
    input.values,
  )
  return response.data.data.task
}

export async function changeTaskStatus(input: {
  taskId: number
  status: TaskStatus
  cancellationReason?: string
}): Promise<PersonalTask> {
  const response = await apiClient.patch<ApiSuccessResponse<{ task: PersonalTask }>>(
    `/tasks/${input.taskId}/status`,
    {
      status: input.status,
      ...(input.cancellationReason ? { cancellationReason: input.cancellationReason } : {}),
    },
  )
  return response.data.data.task
}

export async function deleteTask(taskId: number): Promise<void> {
  await apiClient.delete(`/tasks/${taskId}`)
}

export async function restoreTask(taskId: number): Promise<PersonalTask> {
  const response = await apiClient.post<ApiSuccessResponse<{ task: PersonalTask }>>(
    `/tasks/${taskId}/restore`,
  )
  return response.data.data.task
}

export async function getTaskDetails(taskId: number): Promise<TaskDetails> {
  const response = await apiClient.get<ApiSuccessResponse<TaskDetails>>(`/tasks/${taskId}/details`)
  return response.data.data
}

export async function createSubtask(input: {
  taskId: number
  title: string
  dueDate?: string | null
}): Promise<Subtask> {
  const response = await apiClient.post<ApiSuccessResponse<{ subtask: Subtask }>>(
    `/tasks/${input.taskId}/subtasks`,
    { title: input.title, dueDate: input.dueDate ?? null },
  )
  return response.data.data.subtask
}

export async function updateSubtask(input: {
  subtaskId: number
  title?: string
  dueDate?: string | null
}): Promise<Subtask> {
  const { subtaskId, ...values } = input
  const response = await apiClient.patch<ApiSuccessResponse<{ subtask: Subtask }>>(
    `/subtasks/${subtaskId}`,
    values,
  )
  return response.data.data.subtask
}

export async function completeSubtask(input: {
  subtaskId: number
  isCompleted: boolean
}): Promise<void> {
  await apiClient.patch(`/subtasks/${input.subtaskId}/completion`, {
    isCompleted: input.isCompleted,
  })
}

export async function deleteSubtask(subtaskId: number): Promise<void> {
  await apiClient.delete(`/subtasks/${subtaskId}`)
}

export async function reorderSubtasks(input: {
  taskId: number
  subtaskIds: number[]
}): Promise<void> {
  const subtaskIds = input.subtaskIds.map((id) => Number(id))

  await apiClient.put(`/tasks/${input.taskId}/subtasks/reorder`, { subtaskIds })
}

export async function uploadAttachment(input: {
  taskId?: number
  subtaskId?: number
  file: File
}): Promise<TaskAttachment> {
  const form = new FormData()
  form.append('file', input.file)
  const url = input.subtaskId
    ? `/subtasks/${input.subtaskId}/attachments`
    : `/tasks/${input.taskId}/attachments`
  const response = await apiClient.post<ApiSuccessResponse<{ attachment: TaskAttachment }>>(
    url,
    form,
  )
  return response.data.data.attachment
}

export async function downloadAttachment(attachment: TaskAttachment): Promise<void> {
  const response = await apiClient.get<Blob>(`/attachments/${attachment.id}/download`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = attachment.originalFileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function getAttachmentPreview(
  attachmentId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/attachments/${attachmentId}/preview`, {
    responseType: 'blob',
    ...(signal ? { signal } : {}),
  })
  return response.data
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await apiClient.delete(`/attachments/${attachmentId}`)
}
