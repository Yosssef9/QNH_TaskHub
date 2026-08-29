import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type { PersonalList, SaveListInput } from '../types/list.types'

export async function getLists(): Promise<PersonalList[]> {
  const response = await apiClient.get<ApiSuccessResponse<{ lists: PersonalList[] }>>('/lists')
  return response.data.data.lists
}

export async function createList(input: SaveListInput): Promise<PersonalList> {
  const response = await apiClient.post<ApiSuccessResponse<{ list: PersonalList }>>('/lists', input)
  return response.data.data.list
}

export async function updateList(input: {
  listId: number
  values: SaveListInput
}): Promise<PersonalList> {
  const response = await apiClient.patch<ApiSuccessResponse<{ list: PersonalList }>>(
    `/lists/${input.listId}`,
    input.values,
  )
  return response.data.data.list
}

export async function reorderLists(listIds: number[]): Promise<PersonalList[]> {
  const response = await apiClient.put<ApiSuccessResponse<{ lists: PersonalList[] }>>(
    '/lists/reorder',
    { listIds },
  )
  return response.data.data.lists
}

export async function archiveList(listId: number): Promise<void> {
  await apiClient.delete(`/lists/${listId}`)
}
