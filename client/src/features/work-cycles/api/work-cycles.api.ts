import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type { SaveWorkCycleInput, WorkCycle } from '../types/work-cycle.types'

export async function getWorkCycles(): Promise<WorkCycle[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ cycles: WorkCycle[] }>>('/work-cycles')
  return response.data.data.cycles
}

export async function getWorkCycle(cycleId: number): Promise<WorkCycle> {
  const response = await apiClient.get<ApiSuccessResponse<{ cycle: WorkCycle }>>(
    `/work-cycles/${cycleId}`,
  )
  return response.data.data.cycle
}

export async function createWorkCycle(input: SaveWorkCycleInput): Promise<WorkCycle> {
  const response = await apiClient.post<ApiSuccessResponse<{ cycle: WorkCycle }>>(
    '/work-cycles',
    input,
  )
  return response.data.data.cycle
}

export async function updateWorkCycle(input: {
  cycleId: number
  values: Partial<Omit<SaveWorkCycleInput, 'kpiIds'>>
}): Promise<WorkCycle> {
  const response = await apiClient.patch<ApiSuccessResponse<{ cycle: WorkCycle }>>(
    `/work-cycles/${input.cycleId}`,
    input.values,
  )
  return response.data.data.cycle
}

export async function addCycleKpis(input: {
  cycleId: number
  kpiIds: number[]
}): Promise<WorkCycle> {
  const response = await apiClient.post<ApiSuccessResponse<{ cycle: WorkCycle }>>(
    `/work-cycles/${input.cycleId}/kpis`,
    { kpiIds: input.kpiIds },
  )
  return response.data.data.cycle
}

export async function setCurrentWorkCycle(cycleId: number): Promise<WorkCycle> {
  const response = await apiClient.post<ApiSuccessResponse<{ cycle: WorkCycle }>>(
    `/work-cycles/${cycleId}/current`,
  )
  return response.data.data.cycle
}

export async function closeWorkCycle(cycleId: number): Promise<WorkCycle> {
  const response = await apiClient.post<ApiSuccessResponse<{ cycle: WorkCycle }>>(
    `/work-cycles/${cycleId}/close`,
  )
  return response.data.data.cycle
}

export async function reopenWorkCycle(cycleId: number): Promise<WorkCycle> {
  const response = await apiClient.post<ApiSuccessResponse<{ cycle: WorkCycle }>>(
    `/work-cycles/${cycleId}/reopen`,
  )
  return response.data.data.cycle
}

export async function archiveWorkCycle(cycleId: number): Promise<void> {
  await apiClient.delete(`/work-cycles/${cycleId}`)
}

export async function removeCycleKpi(input: { cycleId: number; instanceId: number }): Promise<void> {
  await apiClient.delete(`/work-cycles/${input.cycleId}/kpis/${input.instanceId}`)
}

export async function reorderWorkCycles(cycleIds: number[]): Promise<WorkCycle[]> {
  const response = await apiClient.put<ApiSuccessResponse<{ cycles: WorkCycle[] }>>(
    '/work-cycles/reorder',
    { cycleIds },
  )
  return response.data.data.cycles
}

export async function reorderCycleInstances(input: {
  cycleId: number
  instanceIds: number[]
}): Promise<WorkCycle> {
  const response = await apiClient.put<ApiSuccessResponse<{ cycle: WorkCycle }>>(
    `/work-cycles/${input.cycleId}/kpis/reorder`,
    { instanceIds: input.instanceIds },
  )
  return response.data.data.cycle
}
