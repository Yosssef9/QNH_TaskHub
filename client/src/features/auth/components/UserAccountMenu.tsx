import { ChevronDown, ExternalLink, Languages, Monitor, Moon, Settings, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import type { Theme } from '@/app/providers/theme-context'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { clientEnv } from '@/config/env'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { useUpdatePreferences } from '@/features/preferences/hooks/use-update-preferences'
import { useTheme } from '@/hooks/use-theme'
import { getAppLanguage, setAppLanguage } from '@/i18n'
import { cn } from '@/lib/cn'

const themeOptions: readonly { value: Theme; labelKey: string; icon: LucideIcon }[] = [
  { value: 'light', labelKey: 'appearance.light', icon: Sun },
  { value: 'dark', labelKey: 'appearance.dark', icon: Moon },
  { value: 'system', labelKey: 'appearance.system', icon: Monitor },
]

const languageOptions = [
  { value: 'ar', labelKey: 'language.arabic' },
  { value: 'en', labelKey: 'language.english' },
] as const

export function UserAccountMenu() {
  const { t } = useTranslation()
  const { data } = useCurrentUser()
  const updatePreferences = useUpdatePreferences()
  const { setTheme, theme } = useTheme()
  const currentLanguage = getAppLanguage()
  const portalUrl = clientEnv.VITE_PORTAL_URL
  const user = data?.user
  const userInitial = user?.userName.trim().charAt(0) || 'Q'

  function changeTheme(nextTheme: Theme) {
    if (nextTheme === theme || updatePreferences.isPending) return

    const previousTheme = theme
    setTheme(nextTheme)
    updatePreferences.mutate(
      { theme: nextTheme.toUpperCase() as 'LIGHT' | 'DARK' | 'SYSTEM' },
      {
        onError: () => {
          setTheme(previousTheme)
          toast.error(t('preferences.saveError'))
        },
      },
    )
  }

  async function changeLanguage(nextLanguage: 'ar' | 'en') {
    if (nextLanguage === currentLanguage || updatePreferences.isPending) return

    const previousLanguage = currentLanguage
    await setAppLanguage(nextLanguage)
    updatePreferences.mutate(
      { languageCode: nextLanguage === 'ar' ? 'AR' : 'EN' },
      {
        onError: () => {
          void setAppLanguage(previousLanguage)
          toast.error(t('preferences.saveError'))
        },
      },
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'hover:bg-accent/70 focus-visible:ring-ring group flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1.5 text-start transition-colors outline-none focus-visible:ring-2',
            'sm:px-2',
          )}
          aria-label={t('account.openMenu')}
        >
          <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold">
            {userInitial}
          </span>
          {user ? (
            <span className="hidden min-w-0 xl:block">
              <span className="block max-w-40 truncate text-sm leading-5 font-semibold">
                {user.userName}
              </span>
              <span className="text-muted-foreground block text-xs leading-4">{user.userCode}</span>
            </span>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className="text-muted-foreground hidden size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 xl:block"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[20rem] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-full text-base font-bold">
            {userInitial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {user?.userName ?? t('common.appName')}
            </p>
            {user ? <p className="text-muted-foreground mt-0.5 text-xs">{user.userCode}</p> : null}
          </div>
        </div>

        <div className="border-border border-t px-4 py-4">
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <Languages aria-hidden="true" className="text-muted-foreground size-4" />
              <p className="text-sm font-medium">{t('language.title')}</p>
            </div>
            <div className="bg-muted/70 grid grid-cols-2 gap-1 rounded-xl p-1">
              {languageOptions.map((option) => {
                const selected = currentLanguage === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={updatePreferences.isPending}
                    className={cn(
                      'focus-visible:ring-ring rounded-lg px-3 py-2 text-sm font-medium transition-all outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
                      selected
                        ? 'bg-primary/15 text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                    )}
                    onClick={() => void changeLanguage(option.value)}
                  >
                    {t(option.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sun aria-hidden="true" className="text-muted-foreground size-4" />
              <p className="text-sm font-medium">{t('appearance.title')}</p>
            </div>
            <div className="bg-muted/70 grid grid-cols-3 gap-1 rounded-xl p-1">
              {themeOptions.map((option) => {
                const Icon = option.icon
                const selected = theme === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={updatePreferences.isPending}
                    className={cn(
                      'focus-visible:ring-ring flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-xs font-medium transition-all outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
                      selected
                        ? 'bg-primary/15 text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                    )}
                    onClick={() => changeTheme(option.value)}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    <span className="max-w-full truncate">{t(option.labelKey)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="border-border border-t p-2">
          <Link
            to="/settings"
            className="hover:bg-accent focus-visible:ring-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2"
          >
            <Settings aria-hidden="true" className="text-muted-foreground size-4" />
            <span>{t('navigation.settings')}</span>
          </Link>

          {portalUrl ? (
            <a
              href={portalUrl}
              className="text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              <span>{t('portal.return')}</span>
            </a>
          ) : (
            <div
              className="text-muted-foreground flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm opacity-55"
              title={t('portal.notConfigured')}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              <span>{t('portal.return')}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
