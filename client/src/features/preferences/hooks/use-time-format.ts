import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import type { TimeFormatPreference } from '@/features/auth/types/auth.types'

export function useTimeFormatPreference(): TimeFormatPreference {
  return useCurrentUser().data?.preferences.timeFormat ?? '12H'
}
