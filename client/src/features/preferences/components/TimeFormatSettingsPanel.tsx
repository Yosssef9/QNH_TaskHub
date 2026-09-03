import { Check, Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'

import { Card } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import type { TimeFormatPreference } from '@/features/auth/types/auth.types'
import { useUpdatePreferences } from '@/features/preferences/hooks/use-update-preferences'
import { cn } from '@/lib/cn'

const options: Array<{
  value: TimeFormatPreference
  primary: string
  secondary: string
}> = [
  { value: '12H', primary: '7:00 AM', secondary: '7:00 PM' },
  { value: '24H', primary: '07:00', secondary: '19:00' },
]

export function TimeFormatSettingsPanel() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const mutation = useUpdatePreferences()
  const value = currentUser.data?.preferences.timeFormat ?? '12H'

  function select(next: TimeFormatPreference) {
    if (next === value || mutation.isPending) return
    mutation.mutate(
      { timeFormat: next },
      {
        onSuccess: () => toast.success(t('settings.timeFormatSaved')),
        onError: () => toast.error(t('preferences.saveError')),
      },
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/20 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
            <Clock3 aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold sm:text-lg">{t('settings.timeFormatTitle')}</h2>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">
              {t('settings.timeFormatDescription')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('settings.timeFormatTitle')}>
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={mutation.isPending}
                className={cn(
                  'focus-visible:ring-ring relative rounded-2xl border p-4 text-start outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-70',
                  selected
                    ? 'border-primary/50 bg-primary/[0.055] shadow-sm'
                    : 'border-border bg-card hover:border-primary/25 hover:bg-muted/20',
                )}
                onClick={() => select(option.value)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn('text-sm font-semibold', selected && 'text-primary')}>
                      {option.value === '12H'
                        ? t('settings.timeFormat12Hour')
                        : t('settings.timeFormat24Hour')}
                    </p>
                    <div dir="ltr" className="mt-4 flex items-baseline gap-3 tabular-nums">
                      <span className="text-2xl font-semibold tracking-tight">{option.primary}</span>
                      <span className="text-muted-foreground text-sm">{option.secondary}</span>
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-transparent',
                    )}
                  >
                    <Check className="size-3.5" />
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-muted-foreground mt-4 text-xs leading-5">
          {t('settings.timeFormatGlobalHint')}
        </p>
      </div>
    </Card>
  )
}
