import { CalendarClock, ListChecks, MapPin, UsersRound } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TimeFormatPreference } from '@/features/auth/types/auth.types'
import { getMeetingRoomAccent } from '@/features/meetings/meeting-room-colors'
import type { MeetingScheduleEntry } from '@/features/meetings/types/meeting.types'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/date-time'

interface Props {
  meeting: MeetingScheduleEntry
  viewType: string
  timeText: string
  timeFormat?: TimeFormatPreference
}

type TimeCardDensity = 'COMPACT' | 'STANDARD' | 'EXPANDED'

interface RenderedSize {
  width: number
  height: number
}

function durationMinutes(meeting: MeetingScheduleEntry): number {
  return Math.max(
    0,
    Math.round(
      (new Date(meeting.endAtUtc).getTime() - new Date(meeting.startAtUtc).getTime()) / 60_000,
    ),
  )
}

function fallbackDensity(minutes: number): TimeCardDensity {
  if (minutes <= 45) return 'COMPACT'
  if (minutes <= 90) return 'STANDARD'
  return 'EXPANDED'
}

function resolveDensity(minutes: number, size: RenderedSize | null): TimeCardDensity {
  if (!size) return fallbackDensity(minutes)

  // FullCalendar can make a long Meeting narrow when several Meetings overlap.
  // Density therefore follows the actual rendered box, not duration alone.
  if (size.height < 70 || size.width < 190) return 'COMPACT'
  if (size.height < 145 || size.width < 320) return 'STANDARD'
  return 'EXPANDED'
}

export function formatMeetingCardTimeRange(
  startAtUtc: string,
  endAtUtc: string,
  locale: string,
  timeFormat: TimeFormatPreference,
): string {
  const startText = formatTime(startAtUtc, locale, timeFormat)
  const endText = formatTime(endAtUtc, locale, timeFormat)

  if (locale.toLowerCase().startsWith('ar') && timeFormat === '12H') {
    const match = endText.match(/^(.*?)\s+(ص|م)$/)
    if (match) {
      const [, endClock, endPeriod] = match
      return `${startText} ${endClock} - ${endPeriod}`
    }
  }

  return `${startText} – ${endText}`
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  )
}

function MeetingAvatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      className={cn(
        'meeting-person-avatar grid shrink-0 place-items-center rounded-full font-bold',
        large ? 'size-8 text-[10px]' : 'size-6 text-[8px]',
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

function StatusBadge({ children }: { children: ReactNode }) {
  return <span className="meeting-status-badge meeting-card-status shrink-0">{children}</span>
}

export function CalendarMeetingEvent({
  meeting,
  viewType,
  timeText,
  timeFormat = '12H',
}: Props) {
  const { i18n, t } = useTranslation()
  const cardRef = useRef<HTMLDivElement>(null)
  const [renderedSize, setRenderedSize] = useState<RenderedSize | null>(null)
  const isArabic = i18n.language.toLowerCase().startsWith('ar')
  const roomName = isArabic ? meeting.room.nameAr : meeting.room.nameEn
  const isBusy = meeting.visibility === 'BUSY'
  const isFull = meeting.visibility === 'FULL'
  const isPreview = meeting.visibility === 'PREVIEW'
  const title = isBusy ? t('calendar.meetingBusy') : meeting.title
  const minutes = durationMinutes(meeting)
  const monthGrid = viewType === 'dayGridMonth'
  const agendaView = viewType === 'listMonth'
  const weekView = viewType === 'timeGridWeek'
  const dayView = viewType === 'timeGridDay'
  const density = resolveDensity(minutes, renderedSize)
  const compact = density === 'COMPACT'
  const standard = density === 'STANDARD'
  const expanded = density === 'EXPANDED'
  const weekCompact =
    weekView &&
    (renderedSize
      ? renderedSize.height < 58 || renderedSize.width < 132
      : minutes <= 45)
  const accent = getMeetingRoomAccent(meeting.room.colorKey)
  const style = { '--meeting-room-accent': accent } as CSSProperties

  useEffect(() => {
    if (monthGrid || agendaView) return

    const element = cardRef.current
    if (!element) return

    const updateSize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      setRenderedSize((current) => {
        if (
          current &&
          Math.abs(current.width - width) < 1 &&
          Math.abs(current.height - height) < 1
        ) {
          return current
        }
        return { width, height }
      })
    }

    const initial = element.getBoundingClientRect()
    updateSize(initial.width, initial.height)

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      updateSize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [agendaView, monthGrid, viewType])

  const hasValidTimes =
    !Number.isNaN(new Date(meeting.startAtUtc).getTime()) &&
    !Number.isNaN(new Date(meeting.endAtUtc).getTime())
  const rangeText = hasValidTimes
    ? formatMeetingCardTimeRange(meeting.startAtUtc, meeting.endAtUtc, i18n.language, timeFormat)
    : timeText
  const startTimeText = hasValidTimes
    ? formatTime(meeting.startAtUtc, i18n.language, timeFormat)
    : timeText

  // Normal SCHEDULED state is intentionally implicit in the schedule. Only an
  // exceptional state receives a visible badge so repeated status pills do not
  // compete with the Meeting title and room identity.
  const statusLabel =
    isFull && meeting.hasPendingReschedule ? t('calendar.rescheduleRequested') : null

  const agendaSummary =
    isFull && meeting.agendaTopicCount > 0
      ? meeting.agendaPlannedMinutes > 0
        ? t('calendar.agendaTopicsWithMinutes', {
            count: meeting.agendaTopicCount,
            minutes: meeting.agendaPlannedMinutes,
          })
        : t('calendar.agendaTopicsCount', { count: meeting.agendaTopicCount })
      : null

  const tooltip = (
    <TooltipContent
      side="top"
      align="start"
      sideOffset={10}
      style={style}
      className="meeting-calendar-tooltip w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover p-0 text-popover-foreground shadow-xl"
    >
      <span aria-hidden="true" className="meeting-tooltip-accent block h-[3px] w-full" />
      <div className="p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className="min-w-0 break-words text-[15px] font-bold leading-5 text-foreground">
            {title}
          </p>
          {statusLabel ? <StatusBadge>{statusLabel}</StatusBadge> : null}
        </div>

        <div className="meeting-tooltip-schedule mt-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span dir="ltr" className="font-semibold tabular-nums">
              {rangeText}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{roomName}</span>
          </div>
        </div>

        {!isBusy ? (
          <>
            <div className="my-3 h-px bg-border/70" />
            <div className="space-y-3">
              <div>
                <p className="meeting-tooltip-label">{t('meetings.create.organizerLabel')}</p>
                <div className="mt-1.5 flex min-w-0 items-center gap-2">
                  <MeetingAvatar name={meeting.organizer.userName} large />
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                    {meeting.organizer.userName}
                  </span>
                </div>
              </div>

              {isFull ? (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <span className="inline-flex items-center gap-2 text-foreground">
                    <UsersRound aria-hidden="true" className="size-4 text-muted-foreground" />
                    <span className="font-medium">
                      {t('calendar.participantsCount', { count: meeting.participantCount })}
                    </span>
                  </span>
                  {agendaSummary ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <ListChecks aria-hidden="true" className="size-4" />
                      <span>{agendaSummary}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </TooltipContent>
  )

  if (agendaView) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            style={style}
            className={cn(
              'meeting-agenda-card group flex min-w-0 items-stretch gap-3 rounded-xl border p-3 text-start sm:gap-4 sm:p-4',
              isBusy && 'meeting-busy-card',
            )}
          >
            <div className="meeting-agenda-time shrink-0 self-start text-xs font-bold tabular-nums">
              <span dir="ltr">{rangeText}</span>
            </div>
            <div aria-hidden="true" className="meeting-agenda-rail relative w-3 shrink-0">
              <span className="meeting-agenda-dot absolute top-1.5 left-1/2 size-2.5 -translate-x-1/2 rounded-full" />
              <span className="meeting-agenda-line absolute top-4 bottom-[-1rem] left-1/2 w-px -translate-x-1/2" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <strong className="min-w-0 truncate text-sm font-bold text-foreground sm:text-base">
                  {title}
                </strong>
                {statusLabel ? <StatusBadge>{statusLabel}</StatusBadge> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:text-sm">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{roomName}</span>
                </span>
                {!isBusy ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{meeting.organizer.userName}</span>
                  </span>
                ) : null}
                {isFull ? (
                  <span className="inline-flex items-center gap-1.5">
                    <UsersRound aria-hidden="true" className="size-3.5" />
                    {meeting.participantCount}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        {tooltip}
      </Tooltip>
    )
  }

  if (monthGrid) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            style={style}
            className={cn(
              'meeting-month-pill flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-foreground sm:text-xs',
              isBusy && 'meeting-busy-card',
            )}
          >
            <span aria-hidden="true" className="meeting-room-dot size-1.5 shrink-0 rounded-full" />
            {startTimeText ? (
              <span dir="ltr" className="meeting-month-time shrink-0 font-bold tabular-nums">
                {startTimeText}
              </span>
            ) : null}
            <span className="min-w-0 truncate font-semibold">{title}</span>
          </div>
        </TooltipTrigger>
        {tooltip}
      </Tooltip>
    )
  }

  if (weekView) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={cardRef}
            style={style}
            className={cn(
              'meeting-time-card meeting-week-card relative h-full min-h-0 overflow-hidden rounded-xl border text-start text-foreground',
              weekCompact ? 'meeting-time-card--compact meeting-week-card--compact' : 'meeting-time-card--standard',
              isPreview && 'meeting-time-card--preview',
              isBusy && 'meeting-busy-card',
            )}
          >
            <span aria-hidden="true" className="meeting-room-accent absolute inset-y-0 w-1" />
            <div
              className={cn(
                'meeting-time-card-body flex h-full min-h-0 flex-col overflow-hidden',
                weekCompact ? 'justify-center px-2.5 py-1.5' : 'justify-center px-3 py-2.5',
              )}
            >
              <div className="meeting-card-heading flex min-w-0 items-start justify-between gap-2">
                <strong
                  className={cn(
                    'meeting-card-title min-w-0 truncate font-bold',
                    weekCompact
                      ? 'text-[10px] leading-3.5 sm:text-[11px]'
                      : 'text-[11px] leading-4 sm:text-xs',
                  )}
                >
                  {title}
                </strong>
                {!weekCompact && statusLabel ? <StatusBadge>{statusLabel}</StatusBadge> : null}
              </div>

              <div
                className={cn(
                  'meeting-week-meta flex min-w-0 items-center justify-between gap-2',
                  weekCompact ? 'mt-0.5' : 'mt-1.5',
                )}
              >
                <span
                  dir="ltr"
                  className={cn(
                    'meeting-card-time min-w-0 truncate font-semibold tabular-nums',
                    weekCompact ? 'text-[9px]' : 'text-[10px] sm:text-[11px]',
                  )}
                >
                  {rangeText}
                </span>
                {!weekCompact && isFull ? (
                  <span className="meeting-week-participants flex shrink-0 items-center gap-1 text-[9px] font-semibold text-foreground/75 sm:text-[10px]">
                    <UsersRound aria-hidden="true" className="size-3" />
                    {meeting.participantCount}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        {tooltip}
      </Tooltip>
    )
  }

  const commonCardClasses = cn(
    'meeting-time-card relative h-full min-h-0 overflow-hidden rounded-xl border text-start text-foreground',
    compact && 'meeting-time-card--compact',
    standard && 'meeting-time-card--standard',
    expanded && 'meeting-time-card--expanded',
    dayView && 'meeting-time-card--day',
    isPreview && 'meeting-time-card--preview',
    isBusy && 'meeting-busy-card',
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div ref={cardRef} style={style} className={commonCardClasses}>
          <span aria-hidden="true" className="meeting-room-accent absolute inset-y-0 w-1" />

          {compact ? (
            <div className="meeting-time-card-body flex h-full min-h-0 flex-col justify-center overflow-hidden px-2.5 py-1.5">
              <strong className="meeting-card-title truncate text-[11px] font-bold leading-4 sm:text-xs">
                {title}
              </strong>
              <span
                dir="ltr"
                className="meeting-card-time mt-0.5 truncate text-[10px] font-semibold tabular-nums"
              >
                {rangeText}
              </span>
            </div>
          ) : standard ? (
            <div className="meeting-time-card-body flex h-full min-h-0 flex-col overflow-hidden px-3 py-2.5 sm:px-3.5">
              <div className="meeting-card-heading flex min-w-0 items-start justify-between gap-2">
                <strong className="meeting-card-title min-w-0 truncate text-xs font-bold leading-4 sm:text-[13px]">
                  {title}
                </strong>
                {statusLabel ? <StatusBadge>{statusLabel}</StatusBadge> : null}
              </div>

              <div className="meeting-card-details mt-1.5 space-y-1.5">
                <div
                  dir="ltr"
                  className="meeting-card-time text-[10px] font-semibold tabular-nums sm:text-[11px]"
                >
                  {rangeText}
                </div>
                <div className="meeting-card-room flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground sm:text-[11px]">
                  <MapPin aria-hidden="true" className="size-3 shrink-0" />
                  <span className="min-w-0 truncate">{roomName}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="meeting-time-card-body flex h-full min-h-0 flex-col overflow-hidden px-3.5 py-3 sm:px-4">
              <div className="meeting-card-heading flex min-w-0 items-start justify-between gap-3">
                <strong className="meeting-card-title min-w-0 truncate text-[13px] font-bold leading-[1.1rem] sm:text-sm">
                  {title}
                </strong>
                {statusLabel ? <StatusBadge>{statusLabel}</StatusBadge> : null}
              </div>

              <div className="meeting-card-details mt-2.5 space-y-1.5">
                <div
                  dir="ltr"
                  className="meeting-card-time text-[11px] font-semibold tabular-nums sm:text-xs"
                >
                  {rangeText}
                </div>
                <div className="meeting-card-room flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground sm:text-[11px]">
                  <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{roomName}</span>
                </div>
              </div>

              {!isBusy ? (
                <div className="meeting-card-footer mt-auto flex min-w-0 items-center justify-between gap-3 pt-2.5">
                  <div className="meeting-card-organizer flex min-w-0 items-center gap-2">
                    <MeetingAvatar name={meeting.organizer.userName} />
                    <span className="min-w-0 truncate text-[10px] font-medium text-foreground/85 sm:text-[11px]">
                      {meeting.organizer.userName}
                    </span>
                  </div>
                  {isFull ? (
                    <span className="meeting-card-participants flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-foreground/80 sm:text-[11px]">
                      <UsersRound aria-hidden="true" className="size-3.5" />
                      {meeting.participantCount}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </TooltipTrigger>
      {tooltip}
    </Tooltip>
  )
}

