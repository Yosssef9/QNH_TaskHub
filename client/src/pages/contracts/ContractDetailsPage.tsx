import { Archive, BellRing, CalendarDays, Clock3, MailCheck, MailX, Paperclip, Pencil, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'

import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContractEditorDialog } from '@/features/contracts/components/ContractEditorDialog'
import { ContractFilesPanel } from '@/features/contracts/components/ContractFilesPanel'
import {
  PaymentFrequencyIndicator,
  PaymentTimingIndicator,
  RenewalIndicator,
  ValueTypeIndicator,
} from '@/features/contracts/components/ContractSelectIndicators'
import { ContractStatusBadge } from '@/features/contracts/components/ContractStatusBadge'
import { CurrencyAmount } from '@/features/contracts/components/CurrencyAmount'
import { daysUntilDate, displayDate } from '@/features/contracts/components/contract-display'
import {
  useArchiveContract,
  useContract,
  useContractActivity,
  useContractAttachments,
  useContractSettings,
  useRestoreContract,
} from '@/features/contracts/hooks/use-contracts'
import type { Contract, ContractActivity } from '@/features/contracts/types/contracts.types'
import type { ReactNode } from 'react'
import { ApiClientError } from '@/lib/api-error'
import { APP_TIME_ZONE } from '@/lib/date-time'

export function ContractDetailsPage() {
  const { i18n, t } = useTranslation()
  const params = useParams<{ contractId: string }>()
  const contractId = Number(params.contractId)
  const contractQuery = useContract(Number.isSafeInteger(contractId) && contractId > 0 ? contractId : null)
  const activityQuery = useContractActivity(Number.isSafeInteger(contractId) && contractId > 0 ? contractId : null)
  const attachmentsQuery = useContractAttachments(Number.isSafeInteger(contractId) && contractId > 0 ? contractId : null)
  const archiveMutation = useArchiveContract()
  const restoreMutation = useRestoreContract()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: 'overview' | 'files' | 'history' =
    searchParams.get('tab') === 'files'
      ? 'files'
      : searchParams.get('tab') === 'history'
        ? 'history'
        : 'overview'
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  if (!Number.isSafeInteger(contractId) || contractId <= 0) return <Navigate to="/not-found" replace />
  if (contractQuery.isPending) return <LoadingState />
  if (contractQuery.isError || !contractQuery.data)
    return <ErrorState onRetry={() => void contractQuery.refetch()} />

  const contract = contractQuery.data
  const fileCount = attachmentsQuery.data?.length ?? contract.fileCount
  const pending = archiveMutation.isPending || restoreMutation.isPending

  async function toggleArchive() {
    try {
      if (contract.isActive) await archiveMutation.mutateAsync(contract)
      else await restoreMutation.mutateAsync(contract)
      toast.success(t(contract.isActive ? 'contracts.archived' : 'contracts.restored'))
      setArchiveOpen(false)
    } catch (error) {
      toast.error(
        t(
          error instanceof ApiClientError && error.code === 'CONTRACT_CHANGED'
            ? 'contracts.errors.changed'
            : 'contracts.errors.save',
        ),
      )
    }
  }

  function changeTab(nextTab: 'overview' | 'files' | 'history') {
    const next = new URLSearchParams(searchParams)
    if (nextTab === 'overview') next.delete('tab')
    else next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t('contracts.navigation.section'), path: '/contracts' },
          { label: contract.title },
        ]}
      />

      <PageHeader
        eyebrow={contract.contractNumber ?? t('contracts.detailsEyebrow')}
        title={contract.title}
        description={contract.supplierName}
        actions={
          <>
            {contract.isActive ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" className="size-4" />
                {t('contracts.edit')}
              </Button>
            ) : null}
            <Button
              variant={contract.isActive ? 'outline' : 'default'}
              onClick={() => setArchiveOpen(true)}
            >
              {contract.isActive ? (
                <Archive aria-hidden="true" className="size-4" />
              ) : (
                <RotateCcw aria-hidden="true" className="size-4" />
              )}
              {t(contract.isActive ? 'contracts.archive' : 'contracts.restore')}
            </Button>
          </>
        }
      />

      {!contract.isActive ? (
        <div className="bg-muted/60 rounded-xl border p-4 text-sm">
          <p className="font-semibold">{t('contracts.archivedReadOnlyTitle')}</p>
          <p className="text-muted-foreground mt-1">{t('contracts.archivedReadOnlyDescription')}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <ContractStatusBadge state={contract.trackingState} daysRemaining={contract.daysRemaining} />
        {fileCount > 0 ? (
          <button
            type="button"
            className="text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2"
            onClick={() => changeTab('files')}
          >
            <Paperclip aria-hidden="true" className="size-3.5" />
            {t('contracts.files.count', { count: fileCount })}
          </button>
        ) : null}
        <span className="inline-flex flex-col items-start gap-1">
          <RenewalIndicator value={contract.isAutoRenewal ? 'YES' : 'NO'} pill />
          {contract.isAutoRenewal && contract.renewalTermMonths ? (
            <span className="text-muted-foreground text-xs">
              {t('contracts.monthsValue', { count: contract.renewalTermMonths })}
            </span>
          ) : null}
        </span>
      </div>

      <KeyDates contract={contract} locale={i18n.language} />

      <div className="inline-flex rounded-lg border p-1">
        <Button size="sm" variant={tab === 'overview' ? 'default' : 'ghost'} onClick={() => changeTab('overview')}>
          {t('contracts.overview')}
        </Button>
        <Button size="sm" variant={tab === 'files' ? 'default' : 'ghost'} onClick={() => changeTab('files')}>
          <Paperclip aria-hidden="true" className="size-3.5" />
          {t('contracts.files.tab', { count: fileCount })}
        </Button>
        <Button size="sm" variant={tab === 'history' ? 'default' : 'ghost'} onClick={() => changeTab('history')}>
          {t('contracts.history')}
        </Button>
      </div>

      {tab === 'overview' ? (
        <Overview contract={contract} locale={i18n.language} />
      ) : tab === 'files' ? (
        <ContractFilesPanel contract={contract} />
      ) : activityQuery.isPending ? (
        <LoadingState />
      ) : activityQuery.isError ? (
        <ErrorState onRetry={() => void activityQuery.refetch()} />
      ) : (
        <History items={activityQuery.data ?? []} locale={i18n.language} />
      )}

      <ContractEditorDialog open={editOpen} contract={contract} onOpenChange={setEditOpen} />

      <ConfirmModal
        open={archiveOpen}
        title={t(contract.isActive ? 'contracts.archiveTitle' : 'contracts.restoreTitle')}
        message={t(
          contract.isActive ? 'contracts.archiveDescription' : 'contracts.restoreDescription',
        )}
        confirmText={t(contract.isActive ? 'contracts.archive' : 'contracts.restore')}
        cancelText={t('common.cancel')}
        danger={contract.isActive}
        loading={pending}
        onConfirm={() => void toggleArchive()}
        onCancel={() => setArchiveOpen(false)}
      />
    </div>
  )
}

function KeyDates({ contract, locale }: { contract: Contract; locale: string }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardContent className="pt-5 sm:pt-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
          <DatePoint label={t('contracts.startDate')} value={displayDate(contract.startDate, locale)} />
          <div aria-hidden="true" className="bg-border hidden h-px w-full md:block" />
          <DatePoint
            label={t('contracts.noticeDeadline')}
            value={contract.noticeDeadline ? displayDate(contract.noticeDeadline, locale) : '—'}
            emphasized={Boolean(contract.noticeDeadline)}
            helper={
              contract.noticeDeadline ? (
                <NoticeDeadlineHint value={contract.noticeDeadline} />
              ) : null
            }
          />
          <div aria-hidden="true" className="bg-border hidden h-px w-full md:block" />
          <DatePoint
            label={t('contracts.endDate')}
            value={contract.endDate ? displayDate(contract.endDate, locale) : t('contracts.noEndDate')}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function DatePoint({
  label,
  value,
  emphasized = false,
  helper,
}: {
  label: string
  value: string
  emphasized?: boolean
  helper?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 md:flex-col md:text-center">
      <span className={emphasized ? 'bg-warning/15 text-warning-foreground' : 'bg-primary/10 text-primary'}>
        <span className="grid size-10 place-items-center rounded-full">
          <CalendarDays aria-hidden="true" className="size-5" />
        </span>
      </span>
      <div>
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="mt-1 font-semibold tabular-nums">{value}</p>
        {helper}
      </div>
    </div>
  )
}

function NoticeDeadlineHint({ value }: { value: string }) {
  const { t } = useTranslation()
  const remaining = daysUntilDate(value)
  if (remaining === null || remaining > 30) return null
  return (
    <p
      className={
        remaining < 0
          ? 'text-destructive mt-1 text-xs font-medium'
          : 'text-warning-foreground mt-1 text-xs font-medium'
      }
    >
      {remaining < 0
        ? t('contracts.noticeDeadlinePassed')
        : t('contracts.noticeDaysRemaining', { count: remaining })}
    </p>
  )
}

function Overview({ contract, locale }: { contract: Contract; locale: string }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{t('contracts.sections.basic')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info
            label={t('contracts.supplier')}
            value={
              <Link
                className="hover:bg-primary/10 hover:text-primary focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-2.5 py-1 text-xs outline-none focus-visible:ring-2"
                to={`/contracts/suppliers/${contract.supplierId}`}
              >
                {contract.supplierName}
              </Link>
            }
          />
          <Info
            label={t('contracts.contractNumber')}
            value={
              contract.contractNumber ? (
                <span dir="ltr" className="inline-block tabular-nums">{contract.contractNumber}</span>
              ) : (
                '—'
              )
            }
          />
          <Info label={t('contracts.startDate')} value={displayDate(contract.startDate, locale)} />
          <Info label={t('contracts.endDate')} value={contract.endDate ? displayDate(contract.endDate, locale) : t('contracts.noEndDate')} />
          <Info label={t('contracts.duration')} value={contract.durationDays === null ? '—' : t('contracts.durationDays', { count: contract.durationDays })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('contracts.renewal')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info label={t('contracts.automaticRenewal')} value={t(contract.isAutoRenewal ? 'common.yes' : 'common.no')} />
          <Info label={t('contracts.renewalTermMonths')} value={contract.renewalTermMonths ? t('contracts.monthsValue', { count: contract.renewalTermMonths }) : '—'} />
          <Info label={t('contracts.noticePeriodDays')} value={contract.noticePeriodDays ? t('contracts.daysValue', { count: contract.noticePeriodDays }) : '—'} />
          <Info label={t('contracts.noticeDeadline')} value={contract.noticeDeadline ? displayDate(contract.noticeDeadline, locale) : '—'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('contracts.sections.financial')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info
            label={t('contracts.valueType')}
            value={<ValueTypeIndicator value={contract.valueType} />}
          />
          <Info
            label={t('contracts.contractValue')}
            value={
              contract.valueType === 'VARIABLE' ? (
                <ValueTypeIndicator value="VARIABLE" />
              ) : (
                <CurrencyAmount value={contract.contractValueSar} className="text-base font-semibold" />
              )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('contracts.sections.payment')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info
            label={t('contracts.paymentFrequency')}
            value={
              <PaymentFrequencyIndicator value={contract.paymentFrequency ?? 'NONE'} />
            }
          />
          <Info
            label={t('contracts.paymentTiming')}
            value={<PaymentTimingIndicator value={contract.paymentTiming ?? 'NONE'} />}
          />
        </CardContent>
      </Card>

      <ReminderSummary contract={contract} locale={locale} />

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>{t('contracts.notes')}</CardTitle></CardHeader>
        <CardContent><p className="whitespace-pre-wrap text-sm leading-6">{contract.notes || '—'}</p></CardContent>
      </Card>
    </div>
  )
}

function addDateDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function currentDateInAppTimeZone(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function ReminderSummary({ contract, locale }: { contract: Contract; locale: string }) {
  const { t } = useTranslation()
  const settingsQuery = useContractSettings()
  if (settingsQuery.isPending) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>{t('contracts.reminders.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-sm">{t('common.loading')}</p></CardContent>
      </Card>
    )
  }
  if (!settingsQuery.data) return null

  const settings = settingsQuery.data
  const today = currentDateInAppTimeZone()
  const expirationTarget = contract.endDate
    ? addDateDays(contract.endDate, -settings.expirationReminderLeadDays)
    : null
  const noticeTarget = contract.noticeDeadline
    ? addDateDays(contract.noticeDeadline, -settings.noticeReminderLeadDays)
    : null

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{t('contracts.reminders.title')}</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">{t('contracts.reminders.description')}</p>
        </div>
        <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
          <BellRing aria-hidden="true" className="size-5" />
        </span>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <ReminderItem
          title={t('contracts.reminders.expiration')}
          eventDate={contract.endDate}
          targetDate={expirationTarget}
          emailEnabled={settings.expirationEmailEnabled}
          today={today}
          locale={locale}
        />
        <ReminderItem
          title={t('contracts.reminders.notice')}
          eventDate={contract.isAutoRenewal ? contract.noticeDeadline : null}
          targetDate={contract.isAutoRenewal ? noticeTarget : null}
          emailEnabled={settings.noticeEmailEnabled}
          today={today}
          locale={locale}
        />
      </CardContent>
    </Card>
  )
}

function ReminderItem({
  title,
  eventDate,
  targetDate,
  emailEnabled,
  today,
  locale,
}: {
  title: string
  eventDate: string | null
  targetDate: string | null
  emailEnabled: boolean
  today: string
  locale: string
}) {
  const { t } = useTranslation()
  let statusKey = 'notApplicable'
  let tone = 'bg-muted text-muted-foreground'
  if (eventDate && targetDate) {
    if (today > eventDate) {
      statusKey = 'passed'
      tone = 'bg-destructive/10 text-destructive'
    } else if (today >= targetDate) {
      statusKey = 'due'
      tone = 'bg-warning/10 text-warning-foreground'
    } else {
      statusKey = 'scheduled'
      tone = 'bg-info/10 text-info-foreground'
    }
  }

  return (
    <div className="bg-muted/25 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
            <Clock3 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {targetDate ? t('contracts.reminders.target', { date: displayDate(targetDate, locale) }) : t('contracts.reminders.notApplicable')}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
          {t(`contracts.reminders.status.${statusKey}`)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {emailEnabled ? <MailCheck aria-hidden="true" className="text-success size-4" /> : <MailX aria-hidden="true" className="text-muted-foreground size-4" />}
        <span className={emailEnabled ? 'text-foreground' : 'text-muted-foreground'}>
          {t(emailEnabled ? 'contracts.reminders.emailOn' : 'contracts.reminders.emailOff')}
        </span>
      </div>
    </div>
  )
}

function History({ items, locale }: { items: ContractActivity[]; locale: string }) {
  const { i18n, t } = useTranslation()
  if (items.length === 0) {
    return <div className="text-muted-foreground rounded-xl border p-8 text-center text-sm">{t('contracts.historyEmpty')}</div>
  }
  return (
    <Card>
      <CardContent className="pt-5 sm:pt-6">
        <div className="space-y-6">
          {items.map((item) => (
            <article key={item.id} className="relative ps-7 before:absolute before:start-2 before:top-3 before:h-[calc(100%+1.5rem)] before:w-px before:bg-border last:before:hidden">
              <span className="bg-primary absolute start-0 top-2 size-4 rounded-full border-4 border-background" />
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold">{t(`contracts.activity.${item.type}`)}</p>
                <time className="text-muted-foreground text-xs">
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAtUtc))}
                </time>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{item.actorName}</p>
              {item.type === 'ATTACHMENT_ADDED' || item.type === 'ATTACHMENT_REMOVED' ? (
                <AttachmentHistory item={item} />
              ) : item.changes ? (
                <div className="mt-3 space-y-2 rounded-lg border p-3">
                  {Object.entries(item.changes).map(([key, change]) => (
                    <div key={key} className="grid gap-2 border-b pb-3 text-sm last:border-b-0 last:pb-0 sm:grid-cols-[10rem_1fr_1fr] sm:items-start">
                      <span className="pt-1 font-medium">
                        {t(`contracts.historyFields.${key}`, { defaultValue: key })}
                      </span>
                      <HistoryValue
                        label={t('contracts.changeFrom')}
                        field={key}
                        value={change.from}
                        locale={locale}
                        yes={t('common.yes')}
                        no={t('common.no')}
                      />
                      <HistoryValue
                        label={t('contracts.changeTo')}
                        field={key}
                        value={change.to}
                        locale={locale}
                        yes={t('common.yes')}
                        no={t('common.no')}
                        emphasized
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function AttachmentHistory({ item }: { item: ContractActivity }) {
  const { t } = useTranslation()
  const fileName =
    item.type === 'ATTACHMENT_ADDED'
      ? item.changes?.fileName?.to
      : item.changes?.fileName?.from
  const sizeValue =
    item.type === 'ATTACHMENT_ADDED'
      ? item.changes?.sizeBytes?.to
      : item.changes?.sizeBytes?.from
  const size = Number(sizeValue)
  const sizeLabel = Number.isFinite(size)
    ? size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / (1024 * 1024)).toFixed(1)} MB`
    : null

  return (
    <div className="bg-muted/35 mt-3 rounded-lg border px-3 py-2 text-sm">
      <p className="font-medium">{typeof fileName === 'string' ? fileName : t('contracts.files.file')}</p>
      {sizeLabel ? <p className="text-muted-foreground mt-1 text-xs">{sizeLabel}</p> : null}
    </div>
  )
}

function HistoryValue({
  label,
  field,
  value,
  locale,
  yes,
  no,
  emphasized = false,
}: {
  label: string
  field: string
  value: unknown
  locale: string
  yes: string
  no: string
  emphasized?: boolean
}) {
  let content: ReactNode = '—'
  if (value !== null && value !== undefined && value !== '') {
    if (typeof value === 'boolean') content = value ? yes : no
    else if (field === 'contractValueSar') {
      const amount = Number(value)
      content = Number.isFinite(amount) ? <CurrencyAmount value={amount} /> : String(value)
    } else if ((field === 'startDate' || field === 'endDate') && typeof value === 'string') {
      content = displayDate(value, locale)
    } else if (field === 'contractNumber') {
      content = <span dir="ltr" className="inline-block tabular-nums">{String(value)}</span>
    } else content = String(value)
  }

  return (
    <div className="bg-muted/35 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-[11px] font-semibold">{label}</p>
      <div className={emphasized ? 'text-foreground mt-1 font-medium' : 'text-muted-foreground mt-1'}>
        {content}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}

