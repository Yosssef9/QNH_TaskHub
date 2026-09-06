import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'
import type { ProcurementSavedView, ProcurementSavedViewDetail, ProcurementSavedViewInput } from '../types/procurement-saved-view.types'

export async function getSavedViews(): Promise<ProcurementSavedView[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: ProcurementSavedView[] }>>('/procurement/saved-views')
  return response.data.data.items
}
export async function getSavedView(id: number): Promise<ProcurementSavedViewDetail> {
  const response = await apiClient.get<ApiSuccessResponse<ProcurementSavedViewDetail>>(`/procurement/saved-views/${id}`)
  return response.data.data
}
export async function createSavedView(input: ProcurementSavedViewInput): Promise<ProcurementSavedViewDetail> {
  const response = await apiClient.post<ApiSuccessResponse<ProcurementSavedViewDetail>>('/procurement/saved-views', input)
  return response.data.data
}
export async function updateSavedView(id: number, input: ProcurementSavedViewInput & { rowVersion: string }): Promise<ProcurementSavedViewDetail> {
  const response = await apiClient.patch<ApiSuccessResponse<ProcurementSavedViewDetail>>(`/procurement/saved-views/${id}`, input)
  return response.data.data
}
export async function deleteSavedView(id: number, rowVersion: string): Promise<void> {
  await apiClient.delete(`/procurement/saved-views/${id}`, { params: { rowVersion } })
}
export async function duplicateSavedView(id: number, name?: string): Promise<ProcurementSavedViewDetail> {
  const response = await apiClient.post<ApiSuccessResponse<ProcurementSavedViewDetail>>(`/procurement/saved-views/${id}/duplicate`, name ? { name } : {})
  return response.data.data
}
export async function setDefaultSavedView(id: number): Promise<ProcurementSavedViewDetail> {
  const response = await apiClient.post<ApiSuccessResponse<ProcurementSavedViewDetail>>(`/procurement/saved-views/${id}/default`)
  return response.data.data
}
