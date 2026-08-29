import { useEffect } from 'react'

import type { Theme } from '@/app/providers/theme-context'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { useTheme } from '@/hooks/use-theme'
import { getAppLanguage, setAppLanguage, type AppLanguage } from '@/i18n'

const themeMap = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const satisfies Record<string, Theme>

const languageMap = {
  AR: 'ar',
  EN: 'en',
} as const satisfies Record<string, AppLanguage>

export function PreferencesSync() {
  const { data } = useCurrentUser()
  const { setTheme } = useTheme()
  const preferredTheme = data ? themeMap[data.preferences.theme] : null
  const preferredLanguage = data ? languageMap[data.preferences.languageCode] : null

  useEffect(() => {
    if (preferredTheme) setTheme(preferredTheme)
  }, [preferredTheme, setTheme])

  useEffect(() => {
    if (preferredLanguage && preferredLanguage !== getAppLanguage()) {
      void setAppLanguage(preferredLanguage)
    }
  }, [preferredLanguage])

  return null
}
