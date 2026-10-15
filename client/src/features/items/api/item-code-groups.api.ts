import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

export interface ItemCodeGroup {
  id: number
  name: string
  prefix: string
  rowVersion: string
}
export interface ItemCodeGroupInput { name: string; prefix: string }
const endpoint = '/procurement/item-code-groups'

export async function listItemCodeGroups(): Promise<ItemCodeGroup[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ items: ItemCodeGroup[] }>>(endpoint)
  return response.data.data.items
}
export async function createItemCodeGroup(input: ItemCodeGroupInput): Promise<ItemCodeGroup> {
  const response = await apiClient.post<ApiSuccessResponse<ItemCodeGroup>>(endpoint, input)
  return response.data.data
}
export async function updateItemCodeGroup(id: number, input: ItemCodeGroupInput & { rowVersion: string }): Promise<ItemCodeGroup> {
  const response = await apiClient.patch<ApiSuccessResponse<ItemCodeGroup>>(`${endpoint}/${id}`, input)
  return response.data.data
}
export async function deleteItemCodeGroup(id: number, rowVersion: string): Promise<void> {
  await apiClient.delete(`${endpoint}/${id}`, { params: { rowVersion } })
}
