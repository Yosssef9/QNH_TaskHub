import { useMutation, useQueryClient } from '@tanstack/react-query'

import { currentUserQueryKey } from '@/features/auth/hooks/use-current-user'
import type { AuthMeData } from '@/features/auth/types/auth.types'

import { updatePreferences } from '../api/preferences.api'

export function useUpdatePreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updatePreferences,
    onSuccess: (preferences) => {
      queryClient.setQueryData<AuthMeData>(currentUserQueryKey, (current) =>
        current ? { ...current, preferences } : current,
      )
    },
  })
}
