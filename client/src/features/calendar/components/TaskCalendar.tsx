import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import listPlugin from '@fullcalendar/react/list'
import classicThemePlugin from '@fullcalendar/react/themes/classic'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import '../calendar-theme.css'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/cn'
import { APP_TIME_ZONE } from '@/lib/date-time'

import type {
  CalendarTask,
  CalendarViewMode,
  CalendarVisibleRange,
} from '../types/calendar.types'
import { CalendarTaskEvent } from './CalendarTaskEvent'
import { CalendarToolbar } from './CalendarToolbar'

interface Props {
  tasks: CalendarTask[]
  isFetching: boolean
  showEmpty: boolean
  viewMode: CalendarViewMode
  selectedDate: string | null
  onViewModeChange: (viewMode: CalendarViewMode) => void
  onRangeChange: (range: CalendarVisibleRange) => void
  onSelectDate: (date: string) => void
  onOpenTask: (taskId: number) => void
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

export function TaskCalendar({
  isFetching,
  onOpenTask,
  onRangeChange,
  onSelectDate,
  onViewModeChange,
  selectedDate,
  showEmpty,
  tasks,
  viewMode,
}: Props) {
  const { i18n, t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isCompactMonth = useMediaQuery('(max-width: 639px)')
  const calendarRef = useRef<FullCalendar | null>(null)
  const isRtl = i18n.dir() === 'rtl'
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language, { useGrouping: false }),
    [i18n.language],
  )
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: APP_TIME_ZONE }),
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

  const events = useMemo(
    () =>
      tasks.map((task) => ({
        id: String(task.id),
        title: task.title,
        start: task.calendarDate,
        allDay: true,
        extendedProps: { task },
      })),
    [tasks],
  )
  const taskCountByDate = useMemo(() => {
    const counts = new Map<string, number>()
    for (const task of tasks) {
      counts.set(task.calendarDate, (counts.get(task.calendarDate) ?? 0) + 1)
    }
    return counts
  }, [tasks])

  function api() {
    return calendarRef.current?.getApi()
  }

  useEffect(() => {
    const calendarApi = api()
    if (!calendarApi) return
    const targetView = viewMode === 'MONTH' ? 'dayGridMonth' : 'listMonth'
    if (calendarApi.view.type !== targetView) calendarApi.changeView(targetView)
  }, [viewMode])

  const currentStart = calendarRef.current?.getApi().view.currentStart
  const currentTitle = monthFormatter.format(currentStart ?? new Date())

  return (
    <Card className="relative overflow-hidden" aria-busy={isFetching}>
      <CalendarToolbar
        title={currentTitle}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onPrevious={() => api()?.prev()}
        onToday={() => api()?.today()}
        onNext={() => api()?.next()}
      />

      <div
        aria-hidden="true"
        className={cn(
          'h-0.5',
          isFetching ? 'bg-primary' : 'bg-transparent',
        )}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {isFetching ? t('calendar.loadingTasks') : ''}
      </span>

      {showEmpty && viewMode === 'MONTH' ? (
        <div className="border-b bg-muted/25 px-4 py-2.5 text-center text-xs text-muted-foreground sm:px-5">
          {t('calendar.emptyPeriod')}
        </div>
      ) : null}

      <div className="p-2 sm:p-4 lg:p-5">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, listPlugin, interactionPlugin, classicThemePlugin]}
          initialView="dayGridMonth"
          colorScheme={resolvedTheme}
          headerToolbar={false}
          direction={isRtl ? 'rtl' : 'ltr'}
          firstDay={0}
          timeZone={APP_TIME_ZONE}
          height="auto"
          borderless
          fixedWeekCount
          showNonCurrentDates
          dayNarrowWidth={72}
          dayMaxEvents={isCompactMonth ? 2 : 3}
          eventInteractive
          events={events}
          className="taskhub-calendar text-foreground"
          viewClass="overflow-hidden rounded-xl border border-border/80 bg-card"
          dayHeaderClass="border-primary/15 bg-primary/[0.08] text-primary text-[11px] font-semibold sm:text-sm"
          dayHeaderInnerClass="py-2.5"
          dayCellTopClass="taskhub-calendar-day-top"
          dayCellInnerClass="taskhub-calendar-day-inner"
          dayCellBottomClass="taskhub-calendar-day-bottom"
          dayCellClass={(state) => {
            const cellDate = dateOnlyInTimeZone(state.date)
            return cn(
              'bg-card align-top min-h-16 cursor-pointer sm:min-h-24 xl:min-h-28',
              state.isOther && 'bg-muted/20 text-muted-foreground hover:bg-muted/35',
              !state.isOther && !state.isToday && selectedDate !== cellDate && 'hover:bg-primary/[0.035]',
              state.isToday && 'bg-primary/[0.055] hover:bg-primary/[0.075]',
              selectedDate === cellDate && 'bg-primary/[0.08] ring-primary/30 ring-1 ring-inset hover:bg-primary/[0.1]',
            )
          }}
          eventClass={(info) =>
            cn(
              'taskhub-calendar-event cursor-pointer border-0 bg-transparent shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              info.view.type !== 'listMonth' && 'p-0 leading-none',
            )
          }
          listItemEventClass="cursor-pointer border-border/70 px-3 py-2.5 hover:bg-muted/30 focus-visible:bg-muted/30 sm:px-4"
          listItemEventBeforeClass="hidden"
          listItemEventTimeClass="hidden"
          listDayHeaderClass="bg-muted/55 border-border"
          moreLinkClass="text-primary text-[11px] font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm sm:text-xs"
          moreLinkHint={(count) => t('calendar.moreTasksHint', { count })}
          dayHeaderContent={(info) => weekdayFormatter.format(info.date)}
          dayCellTopContent={(info) => {
            const cellDate = dateOnlyInTimeZone(info.date)
            const taskCount = taskCountByDate.get(cellDate) ?? 0
            const dateLabel = dayLabelFormatter.format(info.date)

            return (
              <button
                type="button"
                className={cn(
                  'focus-visible:ring-ring inline-grid min-w-7 place-items-center rounded-full px-1 py-0.5 text-xs font-semibold outline-none focus-visible:ring-2 sm:text-sm',
                  info.isToday && 'bg-primary text-primary-foreground',
                  info.isOther && !info.isToday && 'text-muted-foreground',
                  selectedDate === cellDate && !info.isToday && 'bg-primary/12 text-primary',
                )}
                aria-label={t('calendar.openDateLabel', { date: dateLabel, count: taskCount })}
                aria-pressed={selectedDate === cellDate}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectDate(cellDate)
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
              : t('calendar.moreTasks', { count: info.num })
          }
          eventContent={(info) => (
            <CalendarTaskEvent
              task={info.event.extendedProps.task as CalendarTask}
              monthGrid={info.view.type === 'dayGridMonth'}
            />
          )}
          dateClick={(info) => {
            if (info.allDay) onSelectDate(info.dateStr.slice(0, 10))
          }}
          moreLinkClick={(info) => {
            info.jsEvent.preventDefault()
            onSelectDate(dateOnlyInTimeZone(info.date))
          }}
          eventClick={(info) => {
            info.jsEvent.preventDefault()
            const taskId = Number(info.event.id)
            if (Number.isSafeInteger(taskId) && taskId > 0) onOpenTask(taskId)
          }}
          datesSet={(info) => {
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
