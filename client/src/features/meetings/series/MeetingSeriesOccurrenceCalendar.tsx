import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import type { TimeFormatPreference } from '@/features/auth/types/auth.types'
import { formatClockTime, formatRiyadhDateInput } from '@/lib/date-time'

import type { MeetingSeriesPreviewOccurrence } from './meeting-series.types'

interface MeetingSeriesOccurrenceCalendarProps {
  occurrences: readonly MeetingSeriesPreviewOccurrence[]
  selectedOccurrenceKey: string | null
  locale: string
  timeFormat: TimeFormatPreference
  onSelect: (occurrenceKey: string) => void
}

interface CalendarMonth {
  year: number
  month: number
  key: string
}

function parseLocalDate(value: string) {
  const [yearText, monthText, dayText] = value.split('-')
  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
  }
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function calendarMonths(occurrences: readonly MeetingSeriesPreviewOccurrence[]): CalendarMonth[] {
  const keys = new Map<string, CalendarMonth>()
  for (const occurrence of occurrences) {
    const { year, month } = parseLocalDate(occurrence.date)
    const key = monthKey(year, month)
    keys.set(key, { year, month, key })
  }
  return [...keys.values()].sort((left, right) => left.key.localeCompare(right.key))
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

export function MeetingSeriesOccurrenceCalendar({
  occurrences,
  selectedOccurrenceKey,
  locale,
  timeFormat,
  onSelect,
}: MeetingSeriesOccurrenceCalendarProps) {
  const { i18n, t } = useTranslation()
  const rtl = i18n.dir() === 'rtl'
  const PreviousIcon = rtl ? ChevronRight : ChevronLeft
  const NextIcon = rtl ? ChevronLeft : ChevronRight
  const today = formatRiyadhDateInput(new Date())

  const months = useMemo(() => calendarMonths(occurrences), [occurrences])
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null)

  useEffect(() => {
    if (months.length === 0) {
      setActiveMonthKey(null)
      return
    }
    if (!activeMonthKey || !months.some((month) => month.key === activeMonthKey)) {
      setActiveMonthKey(months[0]!.key)
    }
  }, [activeMonthKey, months])

  const activeMonth =
    months.find((month) => month.key === activeMonthKey) ?? months[0] ?? null
  const activeMonthIndex = activeMonth
    ? months.findIndex((month) => month.key === activeMonth.key)
    : -1

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, MeetingSeriesPreviewOccurrence[]>()
    for (const occurrence of occurrences) {
      const current = map.get(occurrence.date) ?? []
      current.push(occurrence)
      map.set(occurrence.date, current)
    }
    return map
  }, [occurrences])

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, dayIndex) =>
        new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
          new Date(Date.UTC(2026, 8, 13 + dayIndex, 12)),
        ),
      ),
    [locale],
  )

  if (!activeMonth) {
    return (
      <div className="text-muted-foreground rounded-2xl border bg-card p-8 text-center text-sm">
        {t('meetings.series.redesign.noMeetingsInFilter')}
      </div>
    )
  }

  const totalDays = daysInMonth(activeMonth.year, activeMonth.month)
  const leading = firstWeekday(activeMonth.year, activeMonth.month)
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
            {t('meetings.series.redesign.calendarHint')}
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
          const dayOccurrences = occurrencesByDate.get(date) ?? []
          const hasMeeting = dayOccurrences.length > 0
          const hasAttention = dayOccurrences.some((occurrence) => !occurrence.validation.isValid)
          const hasCustomized = dayOccurrences.some((occurrence) => occurrence.isCustomized)
          const isToday = date === today

          return (
            <div
              key={date}
              className={cn(
                'min-h-28 border-b border-e p-2 last:border-e-0 sm:min-h-32',
                hasAttention
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
                    hasAttention
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

                {hasAttention ? (
                  <AlertTriangle aria-hidden="true" className="text-destructive size-3.5" />
                ) : hasCustomized ? (
                  <Sparkles aria-hidden="true" className="text-primary size-3.5" />
                ) : hasMeeting ? (
                  <CheckCircle2 aria-hidden="true" className="text-success size-3.5" />
                ) : null}
              </div>

              <div className="space-y-1.5">
                {dayOccurrences.slice(0, 3).map((occurrence) => {
                  const invalid = !occurrence.validation.isValid
                  const selected = selectedOccurrenceKey === occurrence.occurrenceKey
                  return (
                    <button
                      key={occurrence.occurrenceKey}
                      type="button"
                      title={`${occurrence.title} · ${formatClockTime(occurrence.startTime, locale, timeFormat)}–${formatClockTime(occurrence.endTime, locale, timeFormat)}`}
                      className={cn(
                        'w-full rounded-lg border px-2 py-1.5 text-start text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        invalid
                          ? 'border-destructive/40 bg-destructive/10 text-destructive'
                          : occurrence.isCustomized
                            ? 'border-primary/35 bg-primary/10 text-primary'
                            : 'border-primary/20 bg-background text-foreground hover:border-primary/40',
                        selected && 'ring-2 ring-ring/50',
                      )}
                      onClick={() => onSelect(occurrence.occurrenceKey)}
                    >
                      <span dir="ltr" className="block truncate text-start">
                        {formatClockTime(occurrence.startTime, locale, timeFormat)}–{formatClockTime(occurrence.endTime, locale, timeFormat)}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate font-normal">
                        {occurrence.title}
                      </span>
                    </button>
                  )
                })}

                {dayOccurrences.length > 3 ? (
                  <p className="text-muted-foreground px-1 text-[10px] font-medium">
                    {t('meetings.series.calendar.more', {
                      count: dayOccurrences.length - 3,
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
          <span className="bg-destructive/10 border-destructive/35 size-3 rounded border" />
          {t('meetings.series.redesign.statusAttention')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-primary/10 border-primary/35 size-3 rounded border" />
          {t('meetings.series.redesign.statusChanged')}
        </span>
      </div>
    </section>
  )
}
