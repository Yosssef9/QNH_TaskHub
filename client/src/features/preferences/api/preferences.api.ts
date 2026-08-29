import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type { UserPreferences } from '@/features/auth/types/auth.types'

export type UpdatePreferencesInput = Partial<
  Pick<UserPreferences, 'languageCode' | 'theme' | 'sidebarCollapsed'>
>

export async function updatePreferences(input: UpdatePreferencesInput): Promise<UserPreferences> {
  const response = await apiClient.patch<ApiSuccessResponse<{ preferences: UserPreferences }>>(
    '/users/me/preferences',
    input,
  )

  return response.data.data.preferences
}
