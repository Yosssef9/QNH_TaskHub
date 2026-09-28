import { CalendarClock, FileText, Info, LoaderCircle, RefreshCcw, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { formatDateTime } from '@/lib/date-time'
import { hasReportDeliveryEvidence, reportDeliveryCounts, reportRowTiming } from './meeting-report-status.view'
import { MeetingReportDeliveryDialog } from './MeetingReportDeliveryDialog'
import { MeetingReportExportButton } from './MeetingReportExportButton'
import { MeetingReportStatusBadge } from './MeetingReportStatusBadge'
import { useMeetingReportStatus } from './use-meeting-report-status'

/** Integrated header row; the dialog reuses this single authorized status query. */
export function MeetingReportStatusPanel({ meetingId, meetingRowVersion }: {
  meetingId: number
  meetingRowVersion: string
}) {
  const { t, i18n } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const query = useMeetingReportStatus(meetingId, meetingRowVersion)
  const arabic = i18n.language.toLowerCase().startsWith('ar')
  // A failed refresh must not leave a misleading cached success or schedule on screen.
  const data = query.isError ? undefined : query.data
  const key = 'meetings.report.automatic'
  const format = (date: string) => formatDateTime(date, arabic ? 'ar-SA-u-ca-gregory' : 'en-GB', timeFormat, {
    timeZone: data?.timeZone,
  })
  const timing = data ? reportRowTiming(data) : null
  const counts = data && hasReportDeliveryEvidence(data) ? reportDeliveryCounts(data) : []
  const refresh = () => { void query.refetch() }

  return (
    <Dialog>
      <section className="min-w-0 border-t border-border/70 pt-4" dir={arabic ? 'rtl' : 'ltr'} aria-label={t(`${key}.title`)}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                <FileText className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold">{t(`${key}.compact.title`)}</h2>
                <div className="mt-1" aria-live="polite">
                  {data ? <MeetingReportStatusBadge data={data} /> : null}
                  {query.isPending ? <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"><LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />{t(`${key}.loading`)}</span> : null}
                  {query.isError ? <span role="alert" className="text-destructive inline-flex items-center gap-1.5 text-xs"><TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />{t(`${key}.compact.unavailable`)}</span> : null}
                </div>
              </div>
            </div>
            {timing ? (
              <div className="flex min-w-0 items-start gap-2 border-s border-border/70 ps-4">
                <CalendarClock className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 text-xs">
                  <p className="text-muted-foreground">{t(`${key}.${timing.label}`)}</p>
                  <p className="mt-0.5 font-semibold tabular-nums"><bdi>{format(timing.at)}</bdi></p>
                  {data && (timing.label === 'scheduledFor' || timing.label === 'calculatedFor') ? (
                    <p className="text-muted-foreground mt-0.5 leading-5">{t(`${key}.grace`, { minutes: data.graceMinutes })}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {query.isError ? <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={refresh} aria-label={t(`${key}.refresh`)}>
              <RefreshCcw className="size-4" aria-hidden="true" />{t(`${key}.compact.retry`)}
            </Button> : null}
            <DialogTrigger asChild>
              <Button variant="outline" className="min-w-0 flex-1 sm:flex-none">
                <Info className="size-4 shrink-0" aria-hidden="true" />{t(`${key}.compact.viewDetails`)}
              </Button>
            </DialogTrigger>
            {/* Keep this mounted and independent of status loading/errors or automatic-email availability. */}
            <MeetingReportExportButton meetingId={meetingId} className="min-w-0 flex-1 sm:flex-none" />
          </div>
        </div>
        {counts.length > 0 ? (
          <p className="text-muted-foreground mt-2 text-xs leading-5" aria-live="polite">
            {counts.map(({ key: countKey, count }) => t(`${key}.compact.counts.${countKey}`, { count })).join(' · ')}
          </p>
        ) : null}
      </section>
      <MeetingReportDeliveryDialog data={data} isPending={query.isPending} isError={query.isError}
        isFetching={query.isFetching} onRefresh={refresh} format={format} />
    </Dialog>
  )
}
