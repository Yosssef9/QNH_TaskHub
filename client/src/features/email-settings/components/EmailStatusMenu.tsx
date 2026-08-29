import {
  CircleAlert,
  Loader2,
  Mail,
  MailCheck,
  MailX,
  Settings2,
} from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { ApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'

import { useEmailSettings, useUpdateEmailSettings } from '../hooks/use-email-settings'
import type { EmailSettingsData } from '../types/email-settings.types'

type EmailHeaderState = 'ENABLED' | 'USER_OFF' | 'SYSTEM_DISABLED' | 'NO_DESTINATION' | 'UNAVAILABLE'

function maskEmail(value: string): string {
  const at = value.lastIndexOf('@')
  if (at <= 0) return value

  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  const visible = local.slice(0, Math.min(2, local.length))
  const hiddenLength = Math.max(2, Math.min(4, local.length - visible.length))
  return `${visible}${'*'.repeat(hiddenLength)}@${domain}`
}

function resolveState(settings: EmailSettingsData | undefined, hasError: boolean): EmailHeaderState {
  if (hasError || !settings) return 'UNAVAILABLE'
  if (!settings.systemEnabled) return 'SYSTEM_DISABLED'
  if (!settings.canEnableEmail || !settings.activeEmail) return 'NO_DESTINATION'
  if (!settings.notificationsEnabled) return 'USER_OFF'
  return 'ENABLED'
}

const stateTone: Record<EmailHeaderState, string> = {
  ENABLED: 'bg-success',
  USER_OFF: 'bg-muted-foreground/70',
  SYSTEM_DISABLED: 'bg-warning',
  NO_DESTINATION: 'bg-warning',
  UNAVAILABLE: 'bg-warning',
}

export function EmailStatusMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const query = useEmailSettings()
  const updateMutation = useUpdateEmailSettings()
  const settings = query.data
  const state = resolveState(settings, query.isError)
  const enabledEventCount = settings?.preferences.filter((item) => item.enabled).length ?? 0
  const totalEventCount = settings?.preferences.length ?? 0
  const effectiveEnabled = state === 'ENABLED'

  async function setMaster(enabled: boolean) {
    if (!settings) return

    try {
      await updateMutation.mutateAsync({ notificationsEnabled: enabled })
      toast.success(t(enabled ? 'emailSettings.toasts.enabled' : 'emailSettings.toasts.disabled'))
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'EMAIL_DESTINATION_REQUIRED'
          ? t('emailSettings.errors.destinationRequired')
          : error instanceof ApiClientError && error.message
            ? error.message
            : t('emailSettings.errors.save'),
      )
    }
  }

  function openSettings() {
    setOpen(false)
    navigate('/settings')
  }

  const tooltip = query.isPending
    ? t('emailSettings.header.loading')
    : t(`emailSettings.header.states.${state}.tooltip`)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={tooltip}
          title={tooltip}
        >
          {state === 'USER_OFF' ? (
            <MailX aria-hidden="true" className="size-5" />
          ) : effectiveEnabled ? (
            <MailCheck aria-hidden="true" className="size-5" />
          ) : (
            <Mail aria-hidden="true" className="size-5" />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'absolute bottom-1 end-1 size-2.5 rounded-full ring-2 ring-background',
              query.isPending ? 'bg-muted-foreground/45 animate-pulse' : stateTone[state],
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(23rem,calc(100vw-1rem))] overflow-hidden p-0"
      >
        <div className="border-border flex items-center justify-between gap-4 border-b px-4 py-3.5">
          <div className="min-w-0">
            <p className="font-semibold">{t('emailSettings.header.title')}</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              {t('emailSettings.header.description')}
            </p>
          </div>
          <Switch
            checked={effectiveEnabled}
            disabled={
              query.isPending ||
              query.isError ||
              !settings?.systemEnabled ||
              !settings?.canEnableEmail ||
              updateMutation.isPending
            }
            aria-label={t('emailSettings.master.title')}
            onCheckedChange={(checked) => void setMaster(checked)}
          />
        </div>

        {query.isPending ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 px-4 py-9 text-sm">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {t('emailSettings.header.loading')}
          </div>
        ) : query.isError ? (
          <div className="px-4 py-5">
            <StatusMessage state="UNAVAILABLE" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('common.retry')}
              </Button>
              <Button variant="ghost" size="sm" onClick={openSettings}>
                <Settings2 aria-hidden="true" className="size-4" />
                {t('emailSettings.header.manage')}
              </Button>
            </div>
          </div>
        ) : settings ? (
          <div className="space-y-4 p-4">
            <StatusMessage state={state} />

            <div className="bg-muted/35 rounded-xl border px-3.5 py-3">
              <div className="flex items-start gap-3">
                <span className="bg-background text-primary grid size-9 shrink-0 place-items-center rounded-lg border shadow-sm">
                  <Mail aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                    {t('emailSettings.header.activeEmail')}
                  </p>
                  <p
                    className="mt-1 truncate text-sm font-semibold"
                    dir="ltr"
                    title={settings.activeEmail ?? undefined}
                  >
                    {settings.activeEmail
                      ? maskEmail(settings.activeEmail)
                      : t('emailSettings.destination.unavailable')}
                  </p>
                  {settings.activeEmail ? (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {settings.activeEmailSource === 'PORTAL'
                        ? t('emailSettings.destination.portalTitle')
                        : t('emailSettings.destination.alternateTitle')}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-0.5 text-sm">
              <span className="text-muted-foreground">
                {t('emailSettings.header.eventsLabel')}
              </span>
              <span className="font-semibold">
                {t('emailSettings.header.eventsEnabled', {
                  count: enabledEventCount,
                  total: totalEventCount,
                })}
              </span>
            </div>

            <Button variant="outline" className="w-full justify-between" onClick={openSettings}>
              <span className="flex items-center gap-2">
                <Settings2 aria-hidden="true" className="size-4" />
                {t('emailSettings.header.manage')}
              </span>
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function StatusMessage({ state }: { state: EmailHeaderState }) {
  const { t } = useTranslation()
  const warning = state === 'SYSTEM_DISABLED' || state === 'NO_DESTINATION' || state === 'UNAVAILABLE'
  const enabled = state === 'ENABLED'

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-3.5 py-3',
        enabled && 'border-success/25 bg-success/[0.08]',
        state === 'USER_OFF' && 'bg-muted/45',
        warning && 'border-warning/30 bg-warning/[0.08]',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
          enabled && 'bg-success/[0.12] text-success',
          state === 'USER_OFF' && 'bg-muted text-muted-foreground',
          warning && 'bg-warning/15 text-warning-foreground',
        )}
      >
        {enabled ? (
          <MailCheck aria-hidden="true" className="size-4" />
        ) : state === 'USER_OFF' ? (
          <MailX aria-hidden="true" className="size-4" />
        ) : (
          <CircleAlert aria-hidden="true" className="size-4" />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {t(`emailSettings.header.states.${state}.title`)}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-5">
          {t(`emailSettings.header.states.${state}.description`)}
        </p>
      </div>
    </div>
  )
}
