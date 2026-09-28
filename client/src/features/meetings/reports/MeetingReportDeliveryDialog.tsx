import { CalendarClock, Clock3, Info, LoaderCircle, Mail, RefreshCcw, UsersRound } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { hasReportDeliveryEvidence, reportDeliveryCounts, type ReportDeliveryCountKey } from './meeting-report-status.view'
import { MeetingReportStatusBadge } from './MeetingReportStatusBadge'
import type { MeetingReportSchedule } from './meeting-report-status.types'

const countTone: Record<ReportDeliveryCountKey, string> = {
  sent: 'bg-success/12 text-success-foreground',
  queued: 'bg-info/12 text-info-foreground',
  processing: 'bg-info/12 text-info-foreground',
  retrying: 'bg-warning/15 text-warning-foreground',
  failed: 'bg-destructive/10 text-destructive',
  skipped: 'bg-muted/60 text-muted-foreground',
  notQueued: 'bg-muted/60 text-muted-foreground',
  needsReview: 'bg-warning/15 text-warning-foreground',
}

/** Shares the row's query result. Opening this dialog never queues mail or adds another polling loop. */
export function MeetingReportDeliveryDialog({ data, isPending, isError, isFetching, onRefresh, format }: {
  data: MeetingReportSchedule | undefined
  isPending: boolean
  isError: boolean
  isFetching: boolean
  onRefresh: () => void
  format: (date: string) => string
}) {
  const { t, i18n } = useTranslation()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const key = 'meetings.report.automatic'
  const eligible = data?.scheduleState === 'WAITING' || data?.scheduleState === 'DUE'
  return (
    <DialogContent variant="modal" closeLabel={t('common.close')} dir={i18n.language.toLowerCase().startsWith('ar') ? 'rtl' : 'ltr'}
      className="max-h-[90dvh] w-[min(38rem,calc(100vw-2rem))] overflow-hidden p-0"
      onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus() }}>
      <div className="sticky top-0 z-10 border-b border-border/70 bg-background px-5 pb-4 pe-16 pt-5 sm:px-6 sm:pe-16">
        <DialogTitle ref={titleRef} tabIndex={-1} className="text-lg font-bold outline-none">
          {t(`${key}.compact.detailsTitle`)}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-xs leading-5">
          {t(`${key}.compact.detailsDescription`)}
        </DialogDescription>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {isPending ? <p role="status" className="text-muted-foreground text-sm">{t(`${key}.loading`)}</p> : null}
        {isError ? <p role="alert" className="text-destructive text-sm">{t(`${key}.loadFailed`)}</p> : null}
        {data && !isError ? (
          <>
            <MeetingReportStatusBadge data={data} detailed />
            {!data.automaticDeliveryEnabled ? (
              <p className="bg-muted/40 text-muted-foreground rounded-lg px-3 py-2.5 text-xs leading-5">
                {t(`${key}.availability.${data.automaticDeliveryReason ?? 'DISABLED'}`, { defaultValue: t(`${key}.disabledNotice`) })}
              </p>
            ) : null}
            <section className="flex min-w-0 items-start gap-3">
              <CalendarClock aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 space-y-1 text-sm">
                <h3 className="font-semibold">{t(`${key}.${eligible && data.automaticDeliveryEnabled ? 'scheduledFor' : 'calculatedFor'}`)}</h3>
                {data.reportDueAtUtc ? (
                  <>
                    <p className="tabular-nums"><bdi>{format(data.reportDueAtUtc)}</bdi></p>
                    <p className="text-muted-foreground text-xs leading-5">{t(`${key}.grace`, { minutes: data.graceMinutes })} · <bdi>{data.timeZone}</bdi></p>
                  </>
                ) : null}
                {!eligible ? <p className="text-muted-foreground text-xs leading-5">{t(`${key}.reason.${data.scheduleState}`)}</p> : null}
                {data.hasPendingReschedule && data.reportDueAtUtc ? <p className="text-warning-foreground text-xs leading-5">{t(`${key}.pendingReschedule`)}</p> : null}
              </div>
            </section>

            <section className="flex min-w-0 items-start gap-3 border-t border-border/70 pt-4">
              <UsersRound aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t(`${key}.compact.audienceTitle`)}</h3>
                <p className="text-muted-foreground mt-1 text-xs leading-5">{t(`${key}.audience`, { count: data.delivery.totalRecipients })}</p>
              </div>
            </section>

            <section className="border-t border-border/70 pt-4">
              <h3 className="mb-3 flex items-center gap-3 text-sm font-semibold">
                <Mail aria-hidden="true" className="text-primary size-5 shrink-0" />{t(`${key}.compact.summaryTitle`)}
              </h3>
              {hasReportDeliveryEvidence(data) ? (
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {reportDeliveryCounts(data).map(({ key: countKey, count }) => (
                    <div key={countKey} className={cn('min-w-0 rounded-lg px-3 py-2.5 text-center', countTone[countKey])}>
                      <dt className="text-xs">{t(`${key}.compact.countLabels.${countKey}`)}</dt>
                      <dd className="mt-1 text-lg font-bold tabular-nums">{count}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="text-muted-foreground text-xs leading-5">{t(`${key}.compact.noDelivery`)}</p>}
            </section>

            <dl className="grid gap-x-5 gap-y-3 border-t border-border/70 pt-4 text-xs sm:grid-cols-2">
              {data.delivery.lastSentAtUtc ? <div><dt className="text-muted-foreground">{t(`${key}.lastSent`)}</dt><dd className="mt-1 font-medium tabular-nums"><bdi>{format(data.delivery.lastSentAtUtc)}</bdi></dd></div> : null}
              {data.automaticDeliveryEnabled && data.delivery.nextAttemptAtUtc ? <div><dt className="text-muted-foreground">{t(`${key}.nextAttempt`)}</dt><dd className="mt-1 font-medium tabular-nums"><bdi>{format(data.delivery.nextAttemptAtUtc)}</bdi></dd></div> : null}
              <div><dt className="text-muted-foreground inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{t(`${key}.checkedAt`)}</dt><dd className="mt-1 font-medium tabular-nums"><bdi>{format(data.checkedAtUtc)}</bdi></dd></div>
              {data.activatedAtUtc ? <div><dt className="text-muted-foreground">{t(`${key}.activation`)}</dt><dd className="mt-1 font-medium tabular-nums"><bdi>{format(data.activatedAtUtc)}</bdi></dd></div> : null}
              {data.automaticDeliveryEnabled ? <div><dt className="text-muted-foreground">{t(`${key}.lastScan`)}</dt><dd className="mt-1 font-medium tabular-nums">{data.lastAutomaticScanAtUtc ? <bdi>{format(data.lastAutomaticScanAtUtc)}</bdi> : t(`${key}.awaitingScan`)}</dd></div> : null}
            </dl>
            <div className="bg-info/8 text-info-foreground flex gap-2.5 rounded-lg border border-info/15 p-3">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-2 text-xs leading-5">
                <p>{t(`${key}.deliveryNote`)}</p>
                <p>{t(`${key}.preparation`)}</p>
                <p>{t(`${key}.manualHint`)}</p>
              </div>
            </div>
          </>
        ) : null}
      </div>
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border/70 bg-background px-5 py-4 sm:px-6">
        <Button variant="outline" disabled={isFetching} onClick={onRefresh}>
          {isFetching ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <RefreshCcw className="size-4" aria-hidden="true" />}
          {t(`${key}.refresh`)}
        </Button>
        <DialogClose asChild><Button variant="ghost">{t('common.close')}</Button></DialogClose>
      </div>
    </DialogContent>
  )
}
