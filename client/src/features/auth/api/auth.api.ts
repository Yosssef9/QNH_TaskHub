import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type { AuthMeData } from '../types/auth.types'

export async function getCurrentUser(): Promise<AuthMeData> {
  const response = await apiClient.get<ApiSuccessResponse<AuthMeData>>('/auth/me')

  return response.data.data
}
