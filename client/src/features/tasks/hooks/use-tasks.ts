import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  changeTaskStatus,
  completeSubtask,
  createGlobalKpiTask,
  createKpiTask,
  createSubtask,
  createTask,
  deleteAttachment,
  deleteSubtask,
  deleteTask,
  getAllKpiTasks,
  getKpiTasks,
  getTaskDetails,
  getTasks,
  getTaskSummary,
  reorderSubtasks,
  restoreTask,
  updateSubtask,
  updateTask,
  uploadAttachment,
} from '../api/tasks.api'
import type { TaskDetails, TaskListFilters } from '../types/task.types'

export const taskQueryRoot = ['tasks'] as const

export const DEFAULT_KPI_TASK_FILTERS = {
  search: '',
  due: 'ALL',
  sortBy: 'createdAt',
  sortDirection: 'desc',
  page: 1,
  pageSize: 20,
} satisfies TaskListFilters

export function allKpiTasksQueryOptions(
  filters: TaskListFilters = DEFAULT_KPI_TASK_FILTERS,
) {
  return {
    queryKey: [...taskQueryRoot, { allKpis: true as const }, filters] as const,
    queryFn: () => getAllKpiTasks(filters),
    staleTime: 30_000,
  }
}

export function useTaskSummary(listId: number | null) {
  return useQuery({
    queryKey: [...taskQueryRoot, 'summary', listId],
    queryFn: () => getTaskSummary(listId!),
    enabled: listId !== null,
  })
}

export function useTasks(
  container: { listId: number } | { kpiInstanceId: number } | { allKpis: true },
  filters: TaskListFilters,
) {
  const globalOptions = 'allKpis' in container ? allKpiTasksQueryOptions(filters) : null

  return useQuery({
    queryKey: globalOptions?.queryKey ?? [...taskQueryRoot, container, filters],
    queryFn: globalOptions
      ? globalOptions.queryFn
      : () => {
          if ('listId' in container) return getTasks(container.listId, filters)
          if ('kpiInstanceId' in container) return getKpiTasks(container.kpiInstanceId, filters)
          return getAllKpiTasks(filters)
        },
    placeholderData: keepPreviousData,
    ...(globalOptions ? { staleTime: globalOptions.staleTime } : {}),
  })
}

function useTaskMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryRoot }),
        queryClient.invalidateQueries({ queryKey: ['kpis'] }),
        queryClient.invalidateQueries({ queryKey: ['work-cycles'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
}

export function useCreateTask() {
  return useTaskMutation(createTask)
}
export function useCreateKpiTask() {
  return useTaskMutation(createKpiTask)
}
export function useCreateGlobalKpiTask() {
  return useTaskMutation(createGlobalKpiTask)
}
export function useUpdateTask() {
  return useTaskMutation(updateTask)
}
export function useChangeTaskStatus() {
  return useTaskMutation(changeTaskStatus)
}
export function useDeleteTask() {
  return useTaskMutation(deleteTask)
}
export function useRestoreTask() {
  return useTaskMutation(restoreTask)
}

export function useTaskDetails(taskId: number | null) {
  return useQuery({
    queryKey: [...taskQueryRoot, 'details', taskId],
    queryFn: () => getTaskDetails(taskId!),
    enabled: taskId !== null,
  })
}

export function useCreateSubtask() {
  return useTaskMutation(createSubtask)
}
export function useUpdateSubtask() {
  return useTaskMutation(updateSubtask)
}
export function useCompleteSubtask() {
  return useTaskMutation(completeSubtask)
}
export function useDeleteSubtask() {
  return useTaskMutation(deleteSubtask)
}

export function useReorderSubtasks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reorderSubtasks,
    onMutate: async ({ taskId, subtaskIds }) => {
      const queryKey = [...taskQueryRoot, 'details', taskId] as const
      await queryClient.cancelQueries({ queryKey })

      const previous = queryClient.getQueryData<TaskDetails>(queryKey)

      if (previous) {
        const byId = new Map(previous.subtasks.map((subtask) => [subtask.id, subtask]))
        const subtasks = subtaskIds.flatMap((id, index) => {
          const subtask = byId.get(id)
          return subtask ? [{ ...subtask, displayOrder: index + 1 }] : []
        })

        queryClient.setQueryData<TaskDetails>(queryKey, {
          ...previous,
          subtasks,
        })
      }

      return { previous, queryKey }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous)
      }
    },
    onSuccess: async (_result, { taskId }) => {
      await queryClient.invalidateQueries({
        queryKey: [...taskQueryRoot, 'details', taskId],
      })
    },
  })
}

export function useUploadAttachment() {
  return useTaskMutation(uploadAttachment)
}
export function useDeleteAttachment() {
  return useTaskMutation(deleteAttachment)
}
