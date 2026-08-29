import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheck,
  BellRing,
  CircleAlert,
  Loader2,
  Mail,
  MailCheck,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'

import {
  useDeleteAlternateEmail,
  useSendTestEmail,
  useUpdateEmailSettings,
} from '../hooks/use-email-settings'
import type {
  EmailAddressSource,
  EmailPreferenceEvent,
  EmailSettingsData,
} from '../types/email-settings.types'
import { AlternateEmailDialog } from './AlternateEmailDialog'

interface EmailSettingsPanelProps {
  settings: EmailSettingsData
}

const taskEvents: EmailPreferenceEvent[] = [
  'TASK_OVERDUE',
  'HIGH_PRIORITY_TASK_DUE_TOMORROW',
  'TASK_DUE_TODAY',
]
const cycleEvents: EmailPreferenceEvent[] = [
  'CURRENT_CYCLE_ENDING_SOON',
  'CURRENT_CYCLE_PAST_END',
]
const kpiEvents: EmailPreferenceEvent[] = ['KPI_BELOW_TARGET', 'KPI_MEASUREMENT_DUE']

function settingError(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message || fallback : fallback
}

export function EmailSettingsPanel({ settings }: EmailSettingsPanelProps) {
  const { t } = useTranslation()
  const [alternateDialogOpen, setAlternateDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const updateMutation = useUpdateEmailSettings()
  const deleteMutation = useDeleteAlternateEmail()
  const testMutation = useSendTestEmail()

  async function setMaster(enabled: boolean) {
    try {
      await updateMutation.mutateAsync({ notificationsEnabled: enabled })
      toast.success(t(enabled ? 'emailSettings.toasts.enabled' : 'emailSettings.toasts.disabled'))
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'EMAIL_DESTINATION_REQUIRED'
          ? t('emailSettings.errors.destinationRequired')
          : settingError(error, t('emailSettings.errors.save')),
      )
    }
  }

  async function setSource(source: EmailAddressSource) {
    if (source === settings.activeEmailSource) return
    try {
      await updateMutation.mutateAsync({ activeEmailSource: source })
      toast.success(t('emailSettings.toasts.destinationChanged'))
    } catch (error) {
      toast.error(settingError(error, t('emailSettings.errors.save')))
    }
  }

  async function setPreference(eventType: EmailPreferenceEvent, enabled: boolean) {
    try {
      await updateMutation.mutateAsync({ preferences: [{ eventType, enabled }] })
    } catch (error) {
      toast.error(settingError(error, t('emailSettings.errors.save')))
    }
  }

  async function deleteAlternate() {
    try {
      await deleteMutation.mutateAsync()
      toast.success(t('emailSettings.toasts.alternateDeleted'))
      setDeleteConfirmOpen(false)
    } catch (error) {
      toast.error(settingError(error, t('emailSettings.errors.save')))
    }
  }

  async function sendTest() {
    try {
      const result = await testMutation.mutateAsync()
      toast.success(t('emailSettings.toasts.testSent', { email: result.recipient }))
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'EMAIL_TEST_SEND_FAILED'
          ? t('emailSettings.errors.testFailed')
          : settingError(error, t('emailSettings.errors.testFailed')),
      )
    }
  }

  const preferenceMap = new Map(settings.preferences.map((item) => [item.eventType, item.enabled]))

  return (
    <div className="space-y-6">
      {!settings.systemEnabled ? (
        <div className="border-warning/40 bg-warning/10 text-warning-foreground flex items-start gap-3 rounded-xl border p-4">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{t('emailSettings.systemDisabled.title')}</p>
            <p className="mt-1 text-sm leading-6">{t('emailSettings.systemDisabled.description')}</p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>{t('emailSettings.master.title')}</CardTitle>
            <CardDescription>{t('emailSettings.master.description')}</CardDescription>
          </div>
          <Switch
            checked={settings.notificationsEnabled}
            disabled={!settings.systemEnabled || updateMutation.isPending || !settings.canEnableEmail}
            aria-label={t('emailSettings.master.title')}
            onCheckedChange={(checked) => void setMaster(checked)}
          />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('emailSettings.destination.title')}</CardTitle>
          <CardDescription>{t('emailSettings.destination.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <EmailDestinationRow
            source="PORTAL"
            title={t('emailSettings.destination.portalTitle')}
            description={t('emailSettings.destination.portalDescription')}
            email={settings.portalEmail}
            selected={settings.activeEmailSource === 'PORTAL'}
            disabled={!settings.portalEmail || updateMutation.isPending}
            verified={Boolean(settings.portalEmail)}
            onSelect={() => void setSource('PORTAL')}
          />

          <EmailDestinationRow
            source="ALTERNATE"
            title={t('emailSettings.destination.alternateTitle')}
            description={
              settings.alternateEmail
                ? t('emailSettings.destination.alternateDescription')
                : t('emailSettings.destination.noAlternate')
            }
            email={settings.alternateEmail}
            selected={settings.activeEmailSource === 'ALTERNATE'}
            disabled={!settings.alternateVerified || updateMutation.isPending}
            verified={settings.alternateVerified}
            onSelect={() => void setSource('ALTERNATE')}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!settings.systemEnabled}
                  onClick={() => setAlternateDialogOpen(true)}
                >
                  <Pencil aria-hidden="true" className="size-3.5" />
                  {settings.alternateEmail
                    ? t('emailSettings.alternate.change')
                    : t('emailSettings.alternate.add')}
                </Button>
                {settings.alternateEmail ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    )}
                    {t('emailSettings.alternate.delete')}
                  </Button>
                ) : null}
              </div>
            }
          />

          {settings.pendingVerification ? (
            <button
              type="button"
              className="bg-primary/5 text-primary hover:bg-primary/10 flex w-full items-center justify-between gap-3 rounded-xl border border-primary/15 px-4 py-3 text-start"
              onClick={() => setAlternateDialogOpen(true)}
            >
              <span className="flex items-center gap-3">
                <MailCheck aria-hidden="true" className="size-5 shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">
                    {t('emailSettings.verification.pending')}
                  </span>
                  <span className="mt-0.5 block text-xs opacity-80">
                    {settings.pendingVerification.maskedEmail}
                  </span>
                </span>
              </span>
              <span className="text-xs font-semibold">{t('emailSettings.verification.continue')}</span>
            </button>
          ) : null}
        </CardContent>
      </Card>

      <Card className={cn(!settings.notificationsEnabled && 'opacity-70')}>
        <CardHeader>
          <CardTitle>{t('emailSettings.events.title')}</CardTitle>
          <CardDescription>{t('emailSettings.events.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <PreferenceGroup
            icon={BellRing}
            title={t('emailSettings.events.groups.tasks')}
            events={taskEvents}
            values={preferenceMap}
            disabled={!settings.notificationsEnabled || updateMutation.isPending}
            onChange={setPreference}
          />
          <PreferenceGroup
            icon={Mail}
            title={t('emailSettings.events.groups.cycles')}
            events={cycleEvents}
            values={preferenceMap}
            disabled={!settings.notificationsEnabled || updateMutation.isPending}
            onChange={setPreference}
          />
          <PreferenceGroup
            icon={BadgeCheck}
            title={t('emailSettings.events.groups.kpis')}
            events={kpiEvents}
            values={preferenceMap}
            disabled={!settings.notificationsEnabled || updateMutation.isPending}
            onChange={setPreference}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('emailSettings.test.title')}</CardTitle>
            <CardDescription>{t('emailSettings.test.description')}</CardDescription>
          </div>
          <Button
            variant="outline"
            disabled={!settings.systemEnabled || !settings.activeEmail || testMutation.isPending}
            onClick={() => void sendTest()}
          >
            {testMutation.isPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-4" />
            )}
            {t('emailSettings.test.action')}
          </Button>
        </CardHeader>
      </Card>

      <ConfirmModal
        open={deleteConfirmOpen}
        title={t('emailSettings.alternate.deleteTitle')}
        message={t('emailSettings.alternate.deleteConfirm')}
        confirmText={t('emailSettings.alternate.delete')}
        cancelText={t('common.cancel')}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => void deleteAlternate()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <AlternateEmailDialog
        open={alternateDialogOpen}
        onOpenChange={setAlternateDialogOpen}
        pendingVerification={settings.pendingVerification}
      />
    </div>
  )
}

function EmailDestinationRow({
  title,
  description,
  email,
  selected,
  disabled,
  verified,
  onSelect,
  actions,
}: {
  source: EmailAddressSource
  title: string
  description: string
  email: string | null
  selected: boolean
  disabled: boolean
  verified: boolean
  onSelect: () => void
  actions?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        selected && 'border-primary/40 bg-primary/[0.035]',
        disabled && !email && 'bg-muted/25',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <label className={cn('flex min-w-0 flex-1 items-start gap-3', disabled ? 'cursor-default' : 'cursor-pointer')}>
          <input
            type="radio"
            name="active-email-destination"
            checked={selected}
            disabled={disabled}
            className="accent-primary mt-1 size-4 shrink-0"
            onChange={onSelect}
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{title}</span>
              {selected ? (
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {t('emailSettings.destination.active')}
                </span>
              ) : null}
              {verified && email ? (
                <span className="bg-success/10 text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  <BadgeCheck aria-hidden="true" className="size-3" />
                  {t('emailSettings.destination.verified')}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground mt-1 block text-sm leading-5">{description}</span>
            <span className={cn('mt-2 block break-all text-sm font-medium', !email && 'text-muted-foreground')}>
              {email ?? t('emailSettings.destination.unavailable')}
            </span>
          </span>
        </label>
        {actions ? <div className="shrink-0 ps-7 sm:ps-0">{actions}</div> : null}
      </div>
    </div>
  )
}

function PreferenceGroup({
  icon: Icon,
  title,
  events,
  values,
  disabled,
  onChange,
}: {
  icon: LucideIcon
  title: string
  events: EmailPreferenceEvent[]
  values: Map<EmailPreferenceEvent, boolean>
  disabled: boolean
  onChange: (eventType: EmailPreferenceEvent, enabled: boolean) => Promise<void>
}) {
  const { t } = useTranslation()

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-muted text-muted-foreground grid size-8 place-items-center rounded-lg">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="divide-border overflow-hidden rounded-xl border">
        {events.map((eventType) => {
          const checked = values.get(eventType) ?? false
          return (
            <div key={eventType} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t(`emailSettings.events.types.${eventType}.title`)}</p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                  {t(`emailSettings.events.types.${eventType}.description`)}
                </p>
              </div>
              <Switch
                checked={checked}
                disabled={disabled}
                aria-label={t(`emailSettings.events.types.${eventType}.title`)}
                onCheckedChange={(next) => void onChange(eventType, next)}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
