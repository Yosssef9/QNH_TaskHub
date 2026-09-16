import { AlertTriangle, ArrowLeft, CalendarDays, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Copy, DoorOpen, List, Sparkles } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useMeetingSeriesDetail } from '@/features/meetings/series/use-meeting-series'
import type { MeetingSeriesMemberSummary } from '@/features/meetings/series/meeting-series.types'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRiyadhDateInput, formatTimeRange } from '@/lib/date-time'

type MemberFilter = 'ALL' | 'UPCOMING' | 'PAST' | 'CUSTOMIZED' | 'CANCELLED'
type ViewMode = 'LIST' | 'CALENDAR'

function statusVariant(status: MeetingSeriesMemberSummary['status']) {
  if (status === 'SCHEDULED') return 'success' as const
  if (status === 'CANCELLED') return 'destructive' as const
  if (status === 'PENDING_APPROVAL') return 'warning' as const
  return 'secondary' as const
}

function patternSummary(
  schedule: import('@/features/meetings/series/meeting-series.types').MeetingSeriesScheduleInput,
  t: TFunction,
) {
  if (schedule.mode === 'CUSTOM') return t('meetings.seriesManagement.customSchedule')

  const pattern = schedule.pattern
  if (pattern.type === 'DAILY') {
    return pattern.interval === 1
      ? t('meetings.seriesManagement.pattern.dailyEvery')
      : t('meetings.seriesManagement.pattern.dailyEveryN', { interval: pattern.interval })
  }

  if (pattern.type === 'WEEKLY') {
    const days = pattern.daysOfWeek
      .map((day) => t(`meetings.series.weekdays.${day}`))
      .join(t('meetings.seriesManagement.pattern.daySeparator'))

    return pattern.interval === 1
      ? t('meetings.seriesManagement.pattern.weeklyEvery', { days })
      : t('meetings.seriesManagement.pattern.weeklyEveryN', {
          interval: pattern.interval,
          days,
        })
  }

  if (pattern.type === 'MONTHLY_DATE') {
    return pattern.interval === 1
      ? t('meetings.seriesManagement.pattern.monthlyDateEvery', {
          day: pattern.dayOfMonth,
        })
      : t('meetings.seriesManagement.pattern.monthlyDateEveryN', {
          interval: pattern.interval,
          day: pattern.dayOfMonth,
        })
  }

  const ordinal = t(
    `meetings.series.ordinals.${pattern.ordinal === -1 ? 'LAST' : String(pattern.ordinal)}`,
  )
  const day = t(`meetings.series.weekdays.${pattern.dayOfWeek}`)

  return pattern.interval === 1
    ? t('meetings.seriesManagement.pattern.monthlyRelativeEvery', {
        ordinal,
        day,
      })
    : t('meetings.seriesManagement.pattern.monthlyRelativeEveryN', {
        interval: pattern.interval,
        ordinal,
        day,
      })
}

function isCurrentlyDifferent(member: MeetingSeriesMemberSummary) {
  return Boolean(
    member.currentStartAtUtc &&
      member.currentEndAtUtc &&
      (member.currentStartAtUtc !== member.initialStartAtUtc ||
        member.currentEndAtUtc !== member.initialEndAtUtc ||
        member.currentRoomId !== member.initialRoomId),
  )
}

interface SeriesCalendarMonth {
  year: number
  month: number
  key: string
}

function seriesCalendarMonths(members: readonly MeetingSeriesMemberSummary[]): SeriesCalendarMonth[] {
  const months = new Map<string, SeriesCalendarMonth>()

  for (const member of members) {
    const date = formatRiyadhDateInput(member.currentStartAtUtc ?? member.initialStartAtUtc)
    const [yearText, monthText] = date.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    const key = `${year}-${String(month).padStart(2, '0')}`
    months.set(key, { year, month, key })
  }

  return [...months.values()].sort((left, right) => left.key.localeCompare(right.key))
}

function daysInSeriesMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function firstSeriesWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

function SeriesCalendar({
  members,
  locale,
  timeFormat,
  onOpen,
}: {
  members: MeetingSeriesMemberSummary[]
  locale: string
  timeFormat: '12H' | '24H'
  onOpen: (meetingId: number) => void
}) {
  const { i18n, t } = useTranslation()
  const rtl = i18n.dir() === 'rtl'
  const PreviousIcon = rtl ? ChevronRight : ChevronLeft
  const NextIcon = rtl ? ChevronLeft : ChevronRight
  const today = formatRiyadhDateInput(new Date())

  const months = useMemo(() => seriesCalendarMonths(members), [members])
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null)

  useEffect(() => {
    if (months.length === 0) {
      setActiveMonthKey(null)
      return
    }

    if (!activeMonthKey || !months.some((month) => month.key === activeMonthKey)) {
      const todayMonth = today.slice(0, 7)
      const initialMonth = months.find((month) => month.key >= todayMonth) ?? months[0]!
      setActiveMonthKey(initialMonth.key)
    }
  }, [activeMonthKey, months, today])

  const activeMonth =
    months.find((month) => month.key === activeMonthKey) ?? months[0] ?? null
  const activeMonthIndex = activeMonth
    ? months.findIndex((month) => month.key === activeMonth.key)
    : -1

  const membersByDate = useMemo(() => {
    const map = new Map<string, MeetingSeriesMemberSummary[]>()

    for (const member of members) {
      const date = formatRiyadhDateInput(member.currentStartAtUtc ?? member.initialStartAtUtc)
      const current = map.get(date) ?? []
      current.push(member)
      current.sort((left, right) =>
        (left.currentStartAtUtc ?? left.initialStartAtUtc).localeCompare(
          right.currentStartAtUtc ?? right.initialStartAtUtc,
        ),
      )
      map.set(date, current)
    }

    return map
  }, [members])

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, dayIndex) =>
        new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          timeZone: 'UTC',
        }).format(new Date(Date.UTC(2026, 8, 13 + dayIndex, 12))),
      ),
    [locale],
  )

  if (!activeMonth) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        {t('meetings.seriesManagement.noMembers')}
      </Card>
    )
  }

  const totalDays = daysInSeriesMonth(activeMonth.year, activeMonth.month)
  const leading = firstSeriesWeekday(activeMonth.year, activeMonth.month)
  const monthTitle = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(activeMonth.year, activeMonth.month - 1, 1, 12)))

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <div>
          <h3 className="text-base font-semibold">{monthTitle}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('meetings.seriesManagement.calendarHint')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={activeMonthIndex <= 0}
            aria-label={t('meetings.series.redesign.previousMonth')}
            onClick={() => {
              const previous = months[activeMonthIndex - 1]
              if (previous) setActiveMonthKey(previous.key)
            }}
          >
            <PreviousIcon aria-hidden="true" className="size-4" />
          </Button>

          <span className="text-muted-foreground min-w-20 text-center text-xs font-medium">
            {activeMonthIndex + 1} / {months.length}
          </span>

          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={activeMonthIndex < 0 || activeMonthIndex >= months.length - 1}
            aria-label={t('meetings.series.redesign.nextMonth')}
            onClick={() => {
              const next = months[activeMonthIndex + 1]
              if (next) setActiveMonthKey(next.key)
            }}
          >
            <NextIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b bg-muted/60">
        {weekdays.map((weekday, index) => (
          <div
            key={`${activeMonth.key}-weekday-${index}`}
            className="border-e px-1 py-3 text-center text-xs font-bold last:border-e-0"
          >
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {Array.from({ length: leading }, (_, index) => (
          <div
            key={`${activeMonth.key}-leading-${index}`}
            aria-hidden="true"
            className="min-h-28 border-b border-e bg-muted/[0.10] p-2 last:border-e-0 sm:min-h-32"
          />
        ))}

        {Array.from({ length: totalDays }, (_, index) => {
          const day = index + 1
          const date = `${activeMonth.key}-${String(day).padStart(2, '0')}`
          const dayMembers = membersByDate.get(date) ?? []
          const hasMeeting = dayMembers.length > 0
          const allCancelled =
            hasMeeting && dayMembers.every((member) => member.status === 'CANCELLED')
          const hasCustomized = dayMembers.some(
            (member) => member.wasCustomizedAtCreation || isCurrentlyDifferent(member),
          )
          const isToday = date === today

          return (
            <div
              key={date}
              className={cn(
                'min-h-28 border-b border-e p-2 last:border-e-0 sm:min-h-32',
                allCancelled
                  ? 'bg-destructive/[0.055]'
                  : hasCustomized
                    ? 'bg-primary/[0.055]'
                    : hasMeeting
                      ? 'bg-primary/[0.025]'
                      : 'bg-background',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-1">
                <span
                  className={cn(
                    'grid size-7 place-items-center rounded-full text-xs font-bold',
                    allCancelled
                      ? 'bg-destructive/12 text-destructive'
                      : hasCustomized
                        ? 'bg-primary/12 text-primary'
                        : hasMeeting
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground',
                    isToday && 'ring-primary ring-2 ring-offset-1 ring-offset-background',
                  )}
                >
                  {day}
                </span>

                {allCancelled ? (
                  <AlertTriangle aria-hidden="true" className="text-destructive size-3.5" />
                ) : hasCustomized ? (
                  <Sparkles aria-hidden="true" className="text-primary size-3.5" />
                ) : hasMeeting ? (
                  <CheckCircle2 aria-hidden="true" className="text-success size-3.5" />
                ) : null}
              </div>

              <div className="space-y-1.5">
                {dayMembers.slice(0, 3).map((member) => {
                  const start = member.currentStartAtUtc ?? member.initialStartAtUtc
                  const end = member.currentEndAtUtc ?? member.initialEndAtUtc
                  const customized =
                    member.wasCustomizedAtCreation || isCurrentlyDifferent(member)
                  const cancelled = member.status === 'CANCELLED'

                  return (
                    <button
                      key={member.meetingId}
                      type="button"
                      title={`${member.title} · ${formatTimeRange(start, end, locale, timeFormat)}`}
                      className={cn(
                        'w-full rounded-lg border px-2 py-1.5 text-start text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        cancelled
                          ? 'border-destructive/40 bg-destructive/10 text-destructive'
                          : customized
                            ? 'border-primary/35 bg-primary/10 text-primary'
                            : 'border-primary/20 bg-background text-foreground hover:border-primary/40',
                      )}
                      onClick={() => onOpen(member.meetingId)}
                    >
                      <span dir="ltr" className="block truncate text-start">
                        {formatTimeRange(start, end, locale, timeFormat)}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate font-normal">
                        #{member.sequenceNumber} {member.title}
                      </span>
                    </button>
                  )
                })}

                {dayMembers.length > 3 ? (
                  <p className="text-muted-foreground px-1 text-[10px] font-medium">
                    {t('meetings.series.calendar.more', {
                      count: dayMembers.length - 3,
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t bg-muted/20 px-4 py-3 text-xs sm:px-5">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary/10 border-primary/25 size-3 rounded border" />
          {t('meetings.series.redesign.calendarMeetingDay')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-primary/10 border-primary/35 size-3 rounded border" />
          {t('meetings.seriesManagement.customized')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-destructive/10 border-destructive/35 size-3 rounded border" />
          {t('meetings.seriesManagement.cancelled')}
        </span>
      </div>
    </section>
  )
}

export function MeetingSeriesDetailsPage() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const seriesId = Number(params.seriesId)
  const detail = useMeetingSeriesDetail(Number.isInteger(seriesId) && seriesId > 0 ? seriesId : null)
  const timeFormat = useTimeFormatPreference()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-SA'
  const arabic = i18n.language.startsWith('ar')
  const [filter, setFilter] = useState<MemberFilter>('ALL')
  const [view, setView] = useState<ViewMode>('LIST')

  if (detail.isLoading) return <LoadingState className="min-h-[28rem]" />
  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        className="min-h-[28rem]"
        title={t('meetings.seriesManagement.detailLoadErrorTitle')}
        description={t('meetings.seriesManagement.detailLoadErrorDescription')}
        onRetry={() => void detail.refetch()}
      />
    )
  }

  const series = detail.data
  const now = Date.now()
  const filteredMembers = series.members.filter((member) => {
    if (filter === 'ALL') return true
    if (filter === 'CUSTOMIZED') return member.wasCustomizedAtCreation
    if (filter === 'CANCELLED') return member.status === 'CANCELLED'
    const start = new Date(member.currentStartAtUtc ?? member.initialStartAtUtc).getTime()
    if (filter === 'UPCOMING') return member.status === 'SCHEDULED' && start >= now
    return start < now || member.status === 'CANCELLED'
  })

  const defaultRoomName = (() => {
    const first = series.members[0]
    if (!first) return '—'
    const defaultRoomMember = series.members.find((member) => member.initialRoomId === series.defaults.roomId) ?? first
    return arabic ? defaultRoomMember.initialRoomNameAr : defaultRoomMember.initialRoomNameEn
  })()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('meetings.seriesManagement.title')}
        title={series.defaults.title}
        description={patternSummary(series.schedule, t)}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/meetings/series')}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t('meetings.seriesManagement.backToSeries')}
            </Button>
            <Button onClick={() => navigate(`/meetings/series/new?duplicate=${series.seriesId}`)}>
              <Copy aria-hidden="true" className="size-4" />
              {t('meetings.seriesManagement.duplicate')}
            </Button>
          </div>
        )}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4"><p className="text-muted-foreground text-xs">{t('meetings.seriesManagement.meetings')}</p><p className="mt-1 text-2xl font-bold">{series.meetingCount}</p></Card>
        <Card className="p-4"><p className="text-muted-foreground text-xs">{t('meetings.seriesManagement.upcoming')}</p><p className="mt-1 text-2xl font-bold">{series.upcomingCount}</p></Card>
        <Card className="p-4"><p className="text-muted-foreground text-xs">{t('meetings.seriesManagement.customized')}</p><p className="mt-1 text-2xl font-bold">{series.customizedCount}</p></Card>
        <Card className="p-4"><p className="text-muted-foreground text-xs">{t('meetings.seriesManagement.cancelled')}</p><p className="mt-1 text-2xl font-bold">{series.cancelledCount}</p></Card>
        <Card className="p-4"><p className="text-muted-foreground text-xs">{t('meetings.seriesManagement.created')}</p><p className="mt-1 text-sm font-semibold">{formatDateTime(series.createdAtUtc, locale, timeFormat, { dateStyle: 'medium' })}</p></Card>
      </section>

      <Card className="p-5">
        <div className="flex items-center gap-2"><CalendarRange aria-hidden="true" className="text-primary size-5" /><h2 className="font-semibold">{t('meetings.seriesManagement.overview')}</h2></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><p className="text-muted-foreground text-xs">{t('meetings.seriesManagement.originalPattern')}</p><p className="mt-1 font-medium">{patternSummary(series.schedule, t)}</p></div>
          <div><p className="text-muted-foreground text-xs">{t('meetings.seriesManagement.defaultTime')}</p><p className="mt-1 font-medium">{series.defaults.startTime} – {series.defaults.endTime}</p></div>
          <div><p className="text-muted-foreground text-xs">{t('meetings.seriesManagement.defaultRoom')}</p><p className="mt-1 font-medium">{defaultRoomName}</p></div>
          <div><p className="text-muted-foreground text-xs">{t('meetings.seriesManagement.attendees')}</p><p className="mt-1 font-medium">{series.defaultAttendees.length + (series.defaults.organizerAttending ? 1 : 0)}</p></div>
        </div>
        {series.defaults.description ? <p className="text-muted-foreground mt-4 border-t pt-4 text-sm leading-6">{series.defaults.description}</p> : null}
      </Card>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{t('meetings.seriesManagement.memberMeetings')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t('meetings.seriesManagement.memberMeetingsDescription')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'UPCOMING', 'PAST', 'CUSTOMIZED', 'CANCELLED'] as const).map((value) => (
              <Button key={value} variant={filter === value ? 'default' : 'outline'} size="sm" onClick={() => setFilter(value)}>
                {t(`meetings.seriesManagement.memberFilters.${value}`)}
              </Button>
            ))}
            <span className="bg-border mx-1 hidden h-6 w-px sm:block" />
            <div
              className="inline-flex items-center rounded-xl border bg-muted/50 p-1"
              role="group"
              aria-label={t('meetings.seriesManagement.viewMode')}
            >
              <Button
                type="button"
                variant={view === 'LIST' ? 'default' : 'ghost'}
                size="sm"
                aria-pressed={view === 'LIST'}
                className={cn('gap-2', view === 'LIST' && 'shadow-sm')}
                onClick={() => setView('LIST')}
              >
                <List aria-hidden="true" className="size-4" />
                {t('meetings.seriesManagement.agendaViewLabel')}
              </Button>
              <Button
                type="button"
                variant={view === 'CALENDAR' ? 'default' : 'ghost'}
                size="sm"
                aria-pressed={view === 'CALENDAR'}
                className={cn('gap-2', view === 'CALENDAR' && 'shadow-sm')}
                onClick={() => setView('CALENDAR')}
              >
                <CalendarDays aria-hidden="true" className="size-4" />
                {t('meetings.seriesManagement.calendarViewLabel')}
              </Button>
            </div>
          </div>
        </div>

        {view === 'CALENDAR' ? (
          <SeriesCalendar members={filteredMembers} locale={locale} timeFormat={timeFormat} onOpen={(meetingId) => navigate(`/meetings/${meetingId}`)} />
        ) : (
          <div className="space-y-3">
            {filteredMembers.map((member) => {
              const start = member.currentStartAtUtc ?? member.initialStartAtUtc
              const end = member.currentEndAtUtc ?? member.initialEndAtUtc
              const roomName = arabic ? (member.currentRoomNameAr ?? member.initialRoomNameAr) : (member.currentRoomNameEn ?? member.initialRoomNameEn)
              const changedAfterCreation = isCurrentlyDifferent(member)
              return (
                <Card key={member.meetingId} className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground text-xs font-bold">#{member.sequenceNumber}</span>
                        <h3 className="truncate font-semibold">{member.title}</h3>
                        <Badge variant={statusVariant(member.status)}>{t(`meetings.status.${member.status}`)}</Badge>
                        {member.wasCustomizedAtCreation ? <Badge><Sparkles aria-hidden="true" className="me-1 size-3" />{t('meetings.seriesManagement.customized')}</Badge> : null}
                        {changedAfterCreation ? <Badge variant="warning">{t('meetings.seriesManagement.changedLater')}</Badge> : null}
                      </div>
                      <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                        <span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="size-4" />{formatDateTime(start, locale, timeFormat, { dateStyle: 'medium' })}</span>
                        <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-4" />{formatTimeRange(start, end, locale, timeFormat)}</span>
                        <span className="inline-flex items-center gap-1.5"><DoorOpen aria-hidden="true" className="size-4" />{roomName}</span>
                      </div>
                      {member.wasCustomizedAtCreation && member.originalStartAtUtc ? (
                        <p className="text-muted-foreground mt-2 text-xs">{t('meetings.seriesManagement.originally', { value: formatDateTime(member.originalStartAtUtc, locale, timeFormat, { dateStyle: 'medium' }) })}</p>
                      ) : null}
                    </div>
                    <Button variant="outline" onClick={() => navigate(`/meetings/${member.meetingId}`)}>{t('meetings.seriesManagement.openMeeting')}</Button>
                  </div>
                </Card>
              )
            })}
            {filteredMembers.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">{t('meetings.seriesManagement.noMembers')}</Card> : null}
          </div>
        )}
      </section>
    </div>
  )
}
