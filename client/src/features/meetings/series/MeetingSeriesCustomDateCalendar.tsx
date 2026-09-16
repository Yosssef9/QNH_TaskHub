import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

interface CalendarCell {
  date: string
  day: number
  inMonth: boolean
}

function parseDate(value: string): { year: number; month: number; day: number } {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number)
  return { year, month, day }
}

function formatDate(year: number, monthIndex: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function monthKey(value: string): string {
  return value.slice(0, 7)
}

function shiftMonth(value: string, delta: number): string {
  const { year, month } = parseDate(`${value}-01`)
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthCells(value: string): CalendarCell[] {
  const { year, month } = parseDate(`${value}-01`)
  const monthIndex = month - 1
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const previousMonthDays = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()

  return Array.from({ length: 42 }, (_, index) => {
    const rawDay = index - firstWeekday + 1
    if (rawDay < 1) {
      const date = new Date(Date.UTC(year, monthIndex - 1, previousMonthDays + rawDay))
      return {
        date: formatDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        day: date.getUTCDate(),
        inMonth: false,
      }
    }
    if (rawDay > daysInMonth) {
      const date = new Date(Date.UTC(year, monthIndex + 1, rawDay - daysInMonth))
      return {
        date: formatDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        day: date.getUTCDate(),
        inMonth: false,
      }
    }
    return { date: formatDate(year, monthIndex, rawDay), day: rawDay, inMonth: true }
  })
}

function weekdayLabels(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const sunday = Date.UTC(2026, 8, 13)
  return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(sunday + index * 86_400_000)))
}

function monthLabel(value: string, locale: string): string {
  const { year, month } = parseDate(`${value}-01`)
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function dateLabel(value: string, locale: string): string {
  const { year, month, day } = parseDate(value)
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function MeetingSeriesCustomDateCalendar({
  dates,
  locale,
  minDate,
  maxCount,
  onChange,
}: {
  dates: readonly string[]
  locale: string
  minDate: string
  maxCount: number
  onChange: (dates: string[]) => void
}) {
  const { t, i18n } = useTranslation()
  const sortedDates = useMemo(() => [...dates].sort(), [dates])
  const firstVisibleDate = sortedDates[0] ?? minDate
  const [visibleMonth, setVisibleMonth] = useState(monthKey(firstVisibleDate))
  const [jumpDate, setJumpDate] = useState(firstVisibleDate)
  const selected = useMemo(() => new Set(sortedDates), [sortedDates])
  const cells = useMemo(() => monthCells(visibleMonth), [visibleMonth])
  const weekdays = useMemo(() => weekdayLabels(locale), [locale])
  const today = minDate

  function toggleDate(date: string) {
    if (date < minDate) return
    if (selected.has(date)) {
      onChange(sortedDates.filter((item) => item !== date))
      return
    }
    if (sortedDates.length >= maxCount) return
    onChange([...sortedDates, date].sort())
  }

  function jump(value: string) {
    if (!value) return
    setJumpDate(value)
    setVisibleMonth(monthKey(value))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-2xl border bg-background shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                <CalendarDays aria-hidden="true" className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold capitalize">
                  {monthLabel(visibleMonth, locale)}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t('meetings.series.redesign.customCalendar.clickHint')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('meetings.series.redesign.previousMonth')}
                onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}
              >
                {i18n.dir() === 'rtl' ? (
                  <ChevronRight aria-hidden="true" className="size-4" />
                ) : (
                  <ChevronLeft aria-hidden="true" className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setJumpDate(today)
                  setVisibleMonth(monthKey(today))
                }}
              >
                <LocateFixed aria-hidden="true" className="size-4" />
                {t('meetings.series.redesign.customCalendar.today')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('meetings.series.redesign.nextMonth')}
                onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}
              >
                {i18n.dir() === 'rtl' ? (
                  <ChevronLeft aria-hidden="true" className="size-4" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b bg-muted/35">
            {weekdays.map((weekday) => (
              <div
                key={weekday}
                className="px-1 py-2.5 text-center text-[11px] font-bold tracking-wide text-muted-foreground uppercase"
              >
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 p-2 sm:p-3">
            {cells.map((cell) => {
              const isSelected = selected.has(cell.date)
              const isPast = cell.date < minDate
              const isToday = cell.date === today
              const canSelect = !isPast && cell.inMonth
              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={!canSelect}
                  aria-pressed={isSelected}
                  aria-label={dateLabel(cell.date, locale)}
                  className={cn(
                    'relative m-0.5 min-h-14 rounded-xl border p-1.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-16',
                    !cell.inMonth && 'pointer-events-none border-transparent opacity-0',
                    cell.inMonth && !isSelected && !isPast && 'border-transparent hover:border-primary/25 hover:bg-primary/[0.04]',
                    isPast && 'cursor-not-allowed border-transparent text-muted-foreground/35',
                    isToday && !isSelected && 'border-primary/35 bg-primary/[0.025]',
                    isSelected && 'border-primary bg-primary/10 text-primary shadow-sm',
                  )}
                  onClick={() => toggleDate(cell.date)}
                >
                  <span className="flex items-start justify-between gap-1">
                    <span
                      className={cn(
                        'grid size-7 place-items-center rounded-full text-sm font-semibold',
                        isToday && !isSelected && 'bg-primary/10 text-primary',
                        isSelected && 'bg-primary text-primary-foreground',
                      )}
                    >
                      {cell.day}
                    </span>
                    {isSelected ? (
                      <Check aria-hidden="true" className="mt-1 size-3.5 shrink-0" />
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border bg-muted/10 p-4">
            <div className="mb-3 flex items-start gap-2.5">
              <LocateFixed aria-hidden="true" className="text-primary mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">
                  {t('meetings.series.redesign.customCalendar.jumpTitle')}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                  {t('meetings.series.redesign.customCalendar.jumpHint')}
                </p>
              </div>
            </div>
            <DatePicker
              value={jumpDate}
              onChange={jump}
              minDate={minDate}
              label={t('meetings.series.redesign.customCalendar.jumpLabel')}
            />
          </div>

          <div className="rounded-2xl border bg-muted/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {t('meetings.series.redesign.customCalendar.selectedTitle')}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t('meetings.series.redesign.selectedDatesCount', { count: sortedDates.length })}
                </p>
              </div>
              <span className="bg-primary/10 text-primary inline-flex min-w-8 items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold">
                {sortedDates.length}
              </span>
            </div>

            {sortedDates.length > 0 ? (
              <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pe-1 [scrollbar-width:thin]">
                {sortedDates.map((date) => (
                  <div
                    key={date}
                    className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-start text-xs font-medium hover:text-primary"
                      onClick={() => {
                        setJumpDate(date)
                        setVisibleMonth(monthKey(date))
                      }}
                    >
                      {dateLabel(date, locale)}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 rounded-full"
                      aria-label={t('meetings.series.redesign.removeDate')}
                      onClick={() => toggleDate(date)}
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground mt-3 rounded-lg border border-dashed p-3 text-center text-xs">
                {t('meetings.series.redesign.customCalendar.empty')}
              </p>
            )}

            <p
              className={cn(
                'mt-3 text-xs leading-5',
                sortedDates.length >= maxCount ? 'text-destructive font-medium' : 'text-muted-foreground',
              )}
            >
              {t('meetings.series.redesign.customCalendar.limitHint', { max: maxCount })}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
