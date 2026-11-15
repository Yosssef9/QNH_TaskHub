import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

export interface ExpectedFinishEstimate {
  id: number | null
  taskId: number
  subtaskId: number | null
  assigneeUserId: number
  userName: string
  expectedFinishDate: string | null
  dueDate: string | null
  canEdit: boolean
}
export interface ExpectedFinishChange {
  id: number
  subtaskId: number | null
  assigneeUserId: number
  userName: string
  previousDate: string | null
  newDate: string | null
  changedAtUtc: string
}
export interface ExpectedFinishView {
  estimates: ExpectedFinishEstimate[]
  history: ExpectedFinishChange[]
  canViewAll: boolean
}
export const expectedFinishesApi = {
  view: async (taskId: number): Promise<ExpectedFinishView> => {
    const res = await apiClient.get<ApiSuccessResponse<ExpectedFinishView>>(`/expected-finishes/task/${taskId}`)
    return res.data.data
  },
  save: async (taskId: number, subtaskId: number | null, expectedFinishDate: string | null): Promise<ExpectedFinishView> => {
    const path = subtaskId === null ? `/expected-finishes/task/${taskId}` :
      `/expected-finishes/task/${taskId}/subtask/${subtaskId}`
    const res = await apiClient.patch<ApiSuccessResponse<ExpectedFinishView>>(path, { expectedFinishDate })
    return res.data.data
  },
}
