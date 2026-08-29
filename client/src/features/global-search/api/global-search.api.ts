import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type { GlobalSearchData } from '../types/global-search.types'

export async function getGlobalSearch(query: string, limit = 18): Promise<GlobalSearchData> {
  const response = await apiClient.get<ApiSuccessResponse<GlobalSearchData>>('/search', {
    params: { q: query, limit },
  })

  return response.data.data
}
