import { BellRing, Clock3, FileClock, Loader2, MailWarning } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ApiClientError } from '@/lib/api-error'

import { useContractSettings, useUpdateContractSettings } from '../hooks/use-contracts'
import type { ContractUserSettings } from '../types/contracts.types'

interface ContractSettingsPanelProps {
  emailSystemEnabled: boolean
  emailNotificationsEnabled: boolean
  hasActiveEmail: boolean
}

type NumericSetting = 'expiringSoonDays' | 'expirationReminderLeadDays' | 'noticeReminderLeadDays'

export function ContractSettingsPanel({
  emailSystemEnabled,
  emailNotificationsEnabled,
  hasActiveEmail,
}: ContractSettingsPanelProps) {
  const { t } = useTranslation()
  const query = useContractSettings()
  const mutation = useUpdateContractSettings()
  const [expiringSoonDays, setExpiringSoonDays] = useState('90')
  const [expirationLeadDays, setExpirationLeadDays] = useState('30')
  const [noticeLeadDays, setNoticeLeadDays] = useState('14')

  useEffect(() => {
    if (!query.data) return
    setExpiringSoonDays(String(query.data.expiringSoonDays))
    setExpirationLeadDays(String(query.data.expirationReminderLeadDays))
    setNoticeLeadDays(String(query.data.noticeReminderLeadDays))
  }, [query.data])

  if (query.isPending) return <LoadingState />
  if (query.isError || !query.data) return <ErrorState onRetry={() => void query.refetch()} />

  const settings = query.data
  const emailAvailable = emailSystemEnabled && emailNotificationsEnabled && hasActiveEmail

  async function save(next: ContractUserSettings, successKey = 'contracts.settings.saved') {
    try {
      await mutation.mutateAsync(next)
      toast.success(t(successKey))
    } catch (error) {
      toast.error(
        t(
          error instanceof ApiClientError && error.code === 'CONTRACT_SETTINGS_CHANGED'
            ? 'contracts.errors.changed'
            : 'contracts.settings.saveError',
        ),
      )
      void query.refetch()
    }
  }

  async function saveNumber(
    key: NumericSetting,
    raw: string,
    reset: (value: string) => void,
  ) {
    const value = Number(raw)
    if (!Number.isInteger(value) || value < 1 || value > 365) {
      toast.error(t('contracts.settings.invalidDays'))
      reset(String(settings[key]))
      return
    }
    if (value === settings[key]) return
    await save({ ...settings, [key]: value })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('contracts.settings.trackingTitle')}</CardTitle>
            <CardDescription>{t('contracts.settings.trackingDescription')}</CardDescription>
          </div>
          <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
            {mutation.isPending ? (
              <Loader2 aria-hidden="true" className="size-5 animate-spin" />
            ) : (
              <Clock3 aria-hidden="true" className="size-5" />
            )}
          </span>
        </CardHeader>
        <CardContent>
          <label className="block max-w-sm">
            <span className="text-sm font-medium">{t('contracts.settings.expiringSoon')}</span>
            <span className="text-muted-foreground mt-1 block text-xs leading-5">
              {t('contracts.settings.expiringSoonDescription')}
            </span>
            <div className="mt-3 flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={365}
                value={expiringSoonDays}
                disabled={mutation.isPending}
                onChange={(event) => setExpiringSoonDays(event.target.value)}
                onBlur={() => void saveNumber('expiringSoonDays', expiringSoonDays, setExpiringSoonDays)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
              <span className="text-muted-foreground shrink-0 text-sm">{t('contracts.days')}</span>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('contracts.settings.remindersTitle')}</CardTitle>
            <CardDescription>{t('contracts.settings.remindersDescription')}</CardDescription>
          </div>
          <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
            <BellRing aria-hidden="true" className="size-5" />
          </span>
        </CardHeader>
        <CardContent className="space-y-5">
          {!emailAvailable ? (
            <div className="border-warning/40 bg-warning/10 text-warning-foreground flex items-start gap-3 rounded-xl border p-4">
              <MailWarning aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{t('contracts.settings.emailUnavailableTitle')}</p>
                <p className="mt-1 text-xs leading-5">{t('contracts.settings.emailUnavailableDescription')}</p>
              </div>
            </div>
          ) : null}

          <ReminderSetting
            icon={Clock3}
            title={t('contracts.settings.expirationTitle')}
            description={t('contracts.settings.expirationDescription')}
            emailLabel={t('contracts.settings.expirationEmail')}
            checked={settings.expirationEmailEnabled}
            days={expirationLeadDays}
            disabled={mutation.isPending}
            onToggle={(checked) => void save({ ...settings, expirationEmailEnabled: checked })}
            onDaysChange={setExpirationLeadDays}
            onDaysCommit={() =>
              void saveNumber('expirationReminderLeadDays', expirationLeadDays, setExpirationLeadDays)
            }
          />

          <ReminderSetting
            icon={FileClock}
            title={t('contracts.settings.noticeTitle')}
            description={t('contracts.settings.noticeDescription')}
            emailLabel={t('contracts.settings.noticeEmail')}
            checked={settings.noticeEmailEnabled}
            days={noticeLeadDays}
            disabled={mutation.isPending}
            onToggle={(checked) => void save({ ...settings, noticeEmailEnabled: checked })}
            onDaysChange={setNoticeLeadDays}
            onDaysCommit={() =>
              void saveNumber('noticeReminderLeadDays', noticeLeadDays, setNoticeLeadDays)
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

function ReminderSetting({
  icon: Icon,
  title,
  description,
  emailLabel,
  checked,
  days,
  disabled,
  onToggle,
  onDaysChange,
  onDaysCommit,
}: {
  icon: LucideIcon
  title: string
  description: string
  emailLabel: string
  checked: boolean
  days: string
  disabled: boolean
  onToggle: (checked: boolean) => void
  onDaysChange: (value: string) => void
  onDaysCommit: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="bg-muted/25 rounded-xl border p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-muted-foreground mt-1 text-xs leading-5">{description}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block max-w-sm">
          <span className="text-sm font-medium">{t('contracts.settings.remindBefore')}</span>
          <div className="mt-2 flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={365}
              value={days}
              disabled={disabled}
              onChange={(event) => onDaysChange(event.target.value)}
              onBlur={onDaysCommit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
            <span className="text-muted-foreground shrink-0 text-sm">{t('contracts.days')}</span>
          </div>
        </label>

        <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-3 py-2.5 sm:min-w-56">
          <span className="text-sm font-medium">{emailLabel}</span>
          <Switch checked={checked} disabled={disabled} onCheckedChange={onToggle} />
        </div>
      </div>
    </div>
  )
}
