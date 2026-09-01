import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import listPlugin from '@fullcalendar/react/list'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import classicThemePlugin from '@fullcalendar/react/themes/classic'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import '../calendar-theme.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import type { MeetingScheduleEntry } from '@/features/meetings/types/meeting.types'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/cn'
import { APP_TIME_ZONE } from '@/lib/date-time'

import type {
  CalendarSearchTarget,
  CalendarTask,
  CalendarViewMode,
  CalendarVisibleRange,
} from '../types/calendar.types'
import { CalendarMeetingEvent } from './CalendarMeetingEvent'
import { CalendarTaskEvent } from './CalendarTaskEvent'
import { CalendarToolbar } from './CalendarToolbar'

const CALENDAR_SLOT_MIN_TIME = '06:00:00'
const CALENDAR_SLOT_MAX_TIME = '22:00:00'
const CALENDAR_SLOT_DURATION = '00:30:00'

interface Props {
  tasks: CalendarTask[]
  meetings: MeetingScheduleEntry[]
  meetingsEnabled: boolean
  isFetching: boolean
  showEmpty: boolean
  viewMode: CalendarViewMode
  selectedDate: string | null
  searchTarget: CalendarSearchTarget | null
  showAdjacentDates: boolean
  displayPreferencePending: boolean
  onViewModeChange: (viewMode: CalendarViewMode) => void
  onRangeChange: (range: CalendarVisibleRange) => void
  onSelectDate: (date: string) => void
  onOpenTask: (taskId: number) => void
  onOpenMeeting: (meetingId: number) => void
  onShowAdjacentDatesChange: (showAdjacentDates: boolean) => void
}

function dateOnlyInTimeZone(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dayOfWeekInAppTimeZone(value: Date): number {
  const [year, month, day] = dateOnlyInTimeZone(value).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function isWeekendInAppTimeZone(value: Date): boolean {
  const day = dayOfWeekInAppTimeZone(value)
  return day === 5 || day === 6
}

function meetingEventId(meeting: MeetingScheduleEntry): string {
  if (meeting.visibility === 'FULL') return `meeting-${meeting.meetingId}`
  return [
    'busy',
    meeting.room.id,
    meeting.organizer.userId,
    meeting.startAtUtc,
    meeting.endAtUtc,
  ].join('-')
}

export function TaskCalendar({
  isFetching,
  meetings,
  meetingsEnabled,
  onOpenMeeting,
  onOpenTask,
  onRangeChange,
  onSelectDate,
  onViewModeChange,
  selectedDate,
  searchTarget,
  showAdjacentDates,
  displayPreferencePending,
  showEmpty,
  tasks,
  viewMode,
  onShowAdjacentDatesChange,
}: Props) {
  const { i18n, t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isCompactMonth = useMediaQuery('(max-width: 639px)')
  const calendarRef = useRef<FullCalendar | null>(null)
  const isRtl = i18n.dir() === 'rtl'
  const [currentTitle, setCurrentTitle] = useState(() =>
    new Intl.DateTimeFormat(i18n.language, {
      month: 'long',
      year: 'numeric',
      timeZone: APP_TIME_ZONE,
    }).format(new Date()),
  )
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language, { useGrouping: false }),
    [i18n.language],
  )
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: APP_TIME_ZONE }),
    [i18n.language],
  )
  const timeGridDayHeaderFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: APP_TIME_ZONE,
      }),
    [i18n.language],
  )
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'long',
        year: 'numeric',
        timeZone: APP_TIME_ZONE,
      }),
    [i18n.language],
  )
  const dayLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: APP_TIME_ZONE,
      }),
    [i18n.language],
  )
  const shortDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        timeZone: APP_TIME_ZONE,
      }),
    [i18n.language],
  )

  const events = useMemo(
    () => [
      ...tasks.map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        start: task.calendarDate,
        allDay: true,
        extendedProps: { kind: 'TASK' as const, task },
      })),
      ...meetings.map((meeting) => ({
        id: meetingEventId(meeting),
        title: meeting.visibility === 'BUSY' ? t('calendar.meetingBusy') : meeting.title,
        start: meeting.startAtUtc,
        end: meeting.endAtUtc,
        allDay: false,
        interactive: meeting.visibility === 'FULL',
        extendedProps: { kind: 'MEETING' as const, meeting },
      })),
    ],
    [meetings, t, tasks],
  )

  const itemCountByDate = useMemo(() => {
    const counts = new Map<string, number>()
    for (const task of tasks) {
      counts.set(task.calendarDate, (counts.get(task.calendarDate) ?? 0) + 1)
    }
    for (const meeting of meetings) {
      const meetingDate = dateOnlyInTimeZone(new Date(meeting.startAtUtc))
      counts.set(meetingDate, (counts.get(meetingDate) ?? 0) + 1)
    }
    return counts
  }, [meetings, tasks])

  function api() {
    return calendarRef.current?.getApi()
  }

  useEffect(() => {
    const calendarApi = api()
    if (!calendarApi) return

    const effectiveViewMode =
      !meetingsEnabled && (viewMode === 'WEEK' || viewMode === 'DAY') ? 'MONTH' : viewMode
    if (effectiveViewMode !== viewMode) {
      onViewModeChange(effectiveViewMode)
      return
    }

    const targetView =
      effectiveViewMode === 'MONTH'
        ? 'dayGridMonth'
        : effectiveViewMode === 'WEEK'
          ? 'timeGridWeek'
          : effectiveViewMode === 'DAY'
            ? 'timeGridDay'
            : 'listMonth'

    if (calendarApi.view.type !== targetView) calendarApi.changeView(targetView)
  }, [meetingsEnabled, onViewModeChange, viewMode])

  useEffect(() => {
    if (!searchTarget) return
    calendarRef.current?.getApi().gotoDate(searchTarget.calendarDate)
  }, [searchTarget])

  useEffect(() => {
    if (!searchTarget || !tasks.some((task) => task.id === searchTarget.taskId)) return

    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `[data-calendar-task-id="${searchTarget.taskId}"]`,
      )
      element?.scrollIntoView({ block: 'center', behavior: 'auto' })
      element?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [searchTarget, tasks])

  function formatViewTitle(type: string, start: Date, end: Date): string {
    if (type === 'timeGridDay') return dayLabelFormatter.format(start)
    if (type === 'timeGridWeek') {
      const inclusiveEnd = new Date(end.getTime() - 1)
      return `${shortDateFormatter.format(start)} – ${shortDateFormatter.format(inclusiveEnd)}`
    }
    return monthFormatter.format(start)
  }

  function openDate(date: string) {
    if (meetingsEnabled) {
      api()?.changeView('timeGridDay', date)
      onViewModeChange('DAY')
      return
    }
    onSelectDate(date)
  }

  return (
    <Card className="relative overflow-hidden" aria-busy={isFetching}>
      <CalendarToolbar
        title={currentTitle}
        viewMode={viewMode}
        meetingsEnabled={meetingsEnabled}
        onViewModeChange={onViewModeChange}
        showAdjacentDates={showAdjacentDates}
        displayPreferencePending={displayPreferencePending}
        onShowAdjacentDatesChange={onShowAdjacentDatesChange}
        onPrevious={() => api()?.prev()}
        onToday={() => api()?.today()}
        onNext={() => api()?.next()}
      />

      <div
        aria-hidden="true"
        className={cn('h-0.5', isFetching ? 'bg-primary' : 'bg-transparent')}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {isFetching ? t('calendar.loadingItems') : ''}
      </span>

      {showEmpty && viewMode === 'MONTH' ? (
        <div className="border-b bg-muted/25 px-4 py-2.5 text-center text-xs text-muted-foreground sm:px-5">
          {t('calendar.emptyPeriod')}
        </div>
      ) : null}

      <div className="p-2 sm:p-4 lg:p-5">
        <FullCalendar
          ref={calendarRef}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            interactionPlugin,
            classicThemePlugin,
          ]}
          initialView="dayGridMonth"
          colorScheme={resolvedTheme}
          headerToolbar={false}
          direction={isRtl ? 'rtl' : 'ltr'}
          firstDay={0}
          timeZone={APP_TIME_ZONE}
          height="auto"
          borderless
          fixedWeekCount={false}
          showNonCurrentDates={showAdjacentDates}
          dayNarrowWidth={72}
          dayMaxEvents={isCompactMonth ? 2 : 3}
          eventInteractive
          events={events}
          allDaySlot
          allDayHeaderContent={() => t('calendar.allDay')}
          slotDuration={CALENDAR_SLOT_DURATION}
          slotHeaderInterval={CALENDAR_SLOT_DURATION}
          slotMinTime={CALENDAR_SLOT_MIN_TIME}
          slotMaxTime={CALENDAR_SLOT_MAX_TIME}
          scrollTime={CALENDAR_SLOT_MIN_TIME}
          nowIndicator
          slotEventOverlap={false}
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            meridiem: false,
          }}
          slotHeaderFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            meridiem: false,
          }}
          className="taskhub-calendar text-foreground"
          viewClass="overflow-hidden rounded-xl border border-border/80 bg-card"
          dayHeaderClass={(state) =>
            cn(
              'border-primary/15 text-[11px] font-semibold sm:text-sm',
              isWeekendInAppTimeZone(state.date)
                ? 'border-border/80 bg-muted/70 text-muted-foreground'
                : 'bg-primary/[0.08] text-primary',
            )
          }
          dayHeaderInnerClass="py-2.5"
          dayCellTopClass="taskhub-calendar-day-top"
          dayCellInnerClass="taskhub-calendar-day-inner"
          dayCellBottomClass="taskhub-calendar-day-bottom"
          dayCellClass={(state) => {
            const cellDate = dateOnlyInTimeZone(state.date)
            const isWeekend = isWeekendInAppTimeZone(state.date)
            return cn(
              'bg-card align-top min-h-16 sm:min-h-24 xl:min-h-28',
              !state.isOther || showAdjacentDates ? 'cursor-pointer' : 'cursor-default',
              isWeekend && !state.isOther && 'bg-muted/[0.18]',
              state.isOther &&
                showAdjacentDates &&
                'bg-muted/20 text-muted-foreground hover:bg-muted/35',
              state.isOther && !showAdjacentDates && 'bg-muted/[0.08] text-muted-foreground',
              !state.isOther &&
                !state.isToday &&
                selectedDate !== cellDate &&
                (isWeekend ? 'hover:bg-muted/35' : 'hover:bg-primary/[0.035]'),
              state.isToday &&
                selectedDate !== cellDate &&
                'bg-primary/[0.11] ring-primary/35 ring-1 ring-inset hover:bg-primary/[0.14]',
              state.isToday &&
                selectedDate === cellDate &&
                'bg-primary/[0.15] ring-primary/50 ring-2 ring-inset hover:bg-primary/[0.17]',
              !state.isToday &&
                selectedDate === cellDate &&
                (isWeekend
                  ? 'bg-muted/35 ring-primary/30 ring-1 ring-inset hover:bg-muted/45'
                  : 'bg-primary/[0.08] ring-primary/30 ring-1 ring-inset hover:bg-primary/[0.1]'),
              searchTarget?.calendarDate === cellDate && 'ring-primary/65 ring-2 ring-inset',
            )
          }}
          eventClass={(info) => {
            const props = info.event.extendedProps as {
              kind?: 'TASK' | 'MEETING'
              meeting?: MeetingScheduleEntry
            }
            const busy = props.kind === 'MEETING' && props.meeting?.visibility === 'BUSY'
            return cn(
              'taskhub-calendar-event border-0 bg-transparent shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              info.view.type !== 'listMonth' && 'p-0 leading-none',
              busy ? 'cursor-default' : 'cursor-pointer',
            )
          }}
          eventDidMount={(info) => {
            const props = info.event.extendedProps as {
              kind?: 'TASK' | 'MEETING'
              task?: CalendarTask
            }
            if (props.kind === 'TASK' && props.task) {
              info.el.dataset.calendarTaskId = String(props.task.id)
            }
          }}
          listItemEventClass="cursor-pointer border-border/70 px-3 py-2.5 hover:bg-muted/30 focus-visible:bg-muted/30 sm:px-4"
          listItemEventBeforeClass="hidden"
          listItemEventTimeClass="hidden"
          listDayHeaderClass="bg-muted/55 border-border"
          moreLinkClass="text-primary text-[11px] font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm sm:text-xs"
          moreLinkHint={(count) => t('calendar.moreItemsHint', { count })}
          dayHeaderContent={(info) =>
            viewMode === 'WEEK' || viewMode === 'DAY'
              ? timeGridDayHeaderFormatter.format(info.date)
              : weekdayFormatter.format(info.date)
          }
          dayCellTopContent={(info) => {
            const cellDate = dateOnlyInTimeZone(info.date)
            const itemCount = itemCountByDate.get(cellDate) ?? 0
            const dateLabel = dayLabelFormatter.format(info.date)

            return (
              <button
                type="button"
                className={cn(
                  'focus-visible:ring-ring inline-grid min-w-7 place-items-center rounded-full px-1 py-0.5 text-xs font-semibold outline-none focus-visible:ring-2 sm:text-sm',
                  info.isToday &&
                    'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20',
                  info.isOther && !info.isToday && 'text-muted-foreground',
                  selectedDate === cellDate && !info.isToday && 'bg-primary/12 text-primary',
                )}
                aria-label={t('calendar.openDateItemsLabel', { date: dateLabel, count: itemCount })}
                aria-pressed={selectedDate === cellDate}
                onClick={(event) => {
                  event.stopPropagation()
                  openDate(cellDate)
                }}
              >
                {numberFormatter.format(info.date.getDate())}
              </button>
            )
          }}
          listDayFormat={{ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }}
          listDayAltFormat={false}
          listDayHeaderContent={(info) =>
            info.level === 0 ? (
              <span className={cn('font-semibold', info.isToday && 'text-primary')}>
                {dayLabelFormatter.format(info.date)}
              </span>
            ) : null
          }
          noEventsContent={t('calendar.emptyAgenda')}
          moreLinkContent={(info) =>
            info.isNarrow
              ? `+${numberFormatter.format(info.num)}`
              : t('calendar.moreItems', { count: info.num })
          }
          eventContent={(info) => {
            const props = info.event.extendedProps as {
              kind?: 'TASK' | 'MEETING'
              task?: CalendarTask
              meeting?: MeetingScheduleEntry
            }

            if (props.kind === 'MEETING' && props.meeting) {
              return (
                <CalendarMeetingEvent
                  meeting={props.meeting}
                  monthGrid={info.view.type === 'dayGridMonth'}
                  timeText={info.timeText}
                />
              )
            }

            if (props.kind === 'TASK' && props.task) {
              return (
                <CalendarTaskEvent
                  task={props.task}
                  monthGrid={info.view.type === 'dayGridMonth'}
                  searchHighlighted={searchTarget?.taskId === props.task.id}
                />
              )
            }

            return null
          }}
          dateClick={(info) => {
            if (info.view.type !== 'dayGridMonth' || !info.allDay) return
            const clickedDate = info.dateStr.slice(0, 10)
            const currentMonth = dateOnlyInTimeZone(info.view.currentStart).slice(0, 7)
            if (!showAdjacentDates && clickedDate.slice(0, 7) !== currentMonth) return
            openDate(clickedDate)
          }}
          moreLinkClick={(info) => {
            info.jsEvent.preventDefault()
            openDate(dateOnlyInTimeZone(info.date))
          }}
          eventClick={(info) => {
            info.jsEvent.preventDefault()
            const props = info.event.extendedProps as {
              kind?: 'TASK' | 'MEETING'
              task?: CalendarTask
              meeting?: MeetingScheduleEntry
            }
            if (props.kind === 'TASK' && props.task) {
              onOpenTask(props.task.id)
              return
            }
            if (
              props.kind === 'MEETING' &&
              props.meeting?.visibility === 'FULL' &&
              props.meeting.meetingId
            ) {
              onOpenMeeting(props.meeting.meetingId)
            }
          }}
          datesSet={(info) => {
            setCurrentTitle(formatViewTitle(info.view.type, info.start, info.end))
            onRangeChange({
              start: dateOnlyInTimeZone(info.start),
              end: dateOnlyInTimeZone(info.end),
              currentDate: dateOnlyInTimeZone(info.view.currentStart),
            })
          }}
        />
      </div>
    </Card>
  )
}
