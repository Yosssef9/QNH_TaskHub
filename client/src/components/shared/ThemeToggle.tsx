import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Theme } from '@/app/providers/theme-context'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/cn'
import { useUpdatePreferences } from '@/features/preferences/hooks/use-update-preferences'
import toast from 'react-hot-toast'

const themeOptions: readonly { value: Theme; labelKey: string; icon: LucideIcon }[] = [
  { value: 'light', labelKey: 'appearance.light', icon: Sun },
  { value: 'dark', labelKey: 'appearance.dark', icon: Moon },
  { value: 'system', labelKey: 'appearance.system', icon: Monitor },
]

export function ThemeToggle() {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const updatePreferences = useUpdatePreferences()
  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun

  function changeTheme(nextTheme: Theme) {
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

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('appearance.changeTheme')}>
              <CurrentIcon aria-hidden="true" className="size-5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('appearance.changeTheme')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-48 p-1.5">
        <p className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
          {t('appearance.title')}
        </p>
        {themeOptions.map((option) => {
          const Icon = option.icon
          const isSelected = option.value === theme

          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                'hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-2',
                isSelected && 'bg-accent',
              )}
              disabled={updatePreferences.isPending}
              onClick={() => changeTheme(option.value)}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="flex-1 text-start">{t(option.labelKey)}</span>
              {isSelected ? <Check aria-hidden="true" className="text-primary size-4" /> : null}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
