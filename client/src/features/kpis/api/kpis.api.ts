import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type { KpiPeriodSummary, PersonalKpi, SaveKpiInput } from '../types/kpi.types'

export async function getKpis() {
  const response = await apiClient.get<ApiSuccessResponse<{ kpis: PersonalKpi[] }>>('/kpis')
  return response.data.data.kpis
}

export async function createKpi(values: SaveKpiInput) {
  const response = await apiClient.post<ApiSuccessResponse<{ kpi: PersonalKpi }>>('/kpis', values)
  return response.data.data.kpi
}

export async function updateKpi(input: { kpiId: number; values: SaveKpiInput }) {
  const response = await apiClient.put<ApiSuccessResponse<{ kpi: PersonalKpi }>>(
    `/kpis/${input.kpiId}`,
    input.values,
  )
  return response.data.data.kpi
}

export async function setKpiActive(input: { kpiId: number; isActive: boolean }) {
  const response = await apiClient.patch<ApiSuccessResponse<{ kpi: PersonalKpi }>>(
    `/kpis/${input.kpiId}/active`,
    { isActive: input.isActive },
  )
  return response.data.data.kpi
}

export async function archiveKpi(kpiId: number) {
  await apiClient.delete(`/kpis/${kpiId}`)
}

export async function reorderKpis(kpiIds: number[]): Promise<PersonalKpi[]> {
  const response = await apiClient.put<ApiSuccessResponse<{ kpis: PersonalKpi[] }>>(
    '/kpis/reorder',
    { kpiIds },
  )
  return response.data.data.kpis
}

export async function getKpiTaskDeadline(input: {
  kpiInstanceId: number
  referenceDate: string
}): Promise<{ dueDate: string }> {
  const response = await apiClient.get<ApiSuccessResponse<{ dueDate: string }>>(
    `/kpi-instances/${input.kpiInstanceId}/task-deadline`,
    { params: { referenceDate: input.referenceDate } },
  )
  return response.data.data
}

export async function getKpiSummary(input: {
  kpiInstanceId: number
  periodStart: string
  periodEnd: string
}): Promise<KpiPeriodSummary> {
  const response = await apiClient.get<ApiSuccessResponse<KpiPeriodSummary>>(
    `/kpi-instances/${input.kpiInstanceId}/summary`,
    { params: { periodStart: input.periodStart, periodEnd: input.periodEnd } },
  )
  return response.data.data
}

export async function saveKpiMeasurement(input: {
  kpiInstanceId: number
  periodStart: string
  periodEnd: string
  numeratorValue: number | null
  denominatorValue: number | null
  manualValue: number | null
}): Promise<KpiPeriodSummary> {
  const { kpiInstanceId, ...values } = input
  const response = await apiClient.put<ApiSuccessResponse<KpiPeriodSummary>>(
    `/kpi-instances/${kpiInstanceId}/measurement`,
    values,
  )
  return response.data.data
}
