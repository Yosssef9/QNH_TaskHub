import { ArrowRight, Clock3 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { formatClockTime } from '@/lib/date-time'
import { cn } from '@/lib/cn'

const DAY_MINUTES = 24 * 60
const STEP_MINUTES = 15
const MIN_DURATION_MINUTES = 30
const LAST_SELECTABLE_MINUTE = DAY_MINUTES - STEP_MINUTES

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

function minutesToTime(value: number): string {
  const bounded = Math.max(0, Math.min(LAST_SELECTABLE_MINUTE, Math.round(value)))
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`
}

interface MeetingTimeRangePickerProps {
  startTime: string
  endTime: string
  disabled?: boolean
  error?: string | undefined
  className?: string
  onChange: (startTime: string, endTime: string) => void
}

export function MeetingTimeRangePicker({
  startTime,
  endTime,
  disabled = false,
  error,
  className,
  onChange,
}: MeetingTimeRangePickerProps) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-SA'
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)
  const currentDuration = Math.max(MIN_DURATION_MINUTES, endMinutes - startMinutes)

  const startOptions = useMemo(
    () =>
      Array.from(
        { length: Math.floor((LAST_SELECTABLE_MINUTE - MIN_DURATION_MINUTES) / STEP_MINUTES) + 1 },
        (_, index) => index * STEP_MINUTES,
      ),
    [],
  )

  const endOptions = useMemo(() => {
    const firstEnd = startMinutes + MIN_DURATION_MINUTES
    if (firstEnd > LAST_SELECTABLE_MINUTE) return []
    return Array.from(
      { length: Math.floor((LAST_SELECTABLE_MINUTE - firstEnd) / STEP_MINUTES) + 1 },
      (_, index) => firstEnd + index * STEP_MINUTES,
    )
  }, [startMinutes])

  function changeStart(nextStartTime: string) {
    const nextStartMinutes = timeToMinutes(nextStartTime)
    const nextEndMinutes = Math.min(LAST_SELECTABLE_MINUTE, nextStartMinutes + currentDuration)
    onChange(nextStartTime, minutesToTime(nextEndMinutes))
  }

  function changeEnd(nextEndTime: string) {
    onChange(startTime, nextEndTime)
  }

  return (
    <div className={className}>
      <div className={cn('rounded-xl border bg-background p-4', error && 'border-destructive/50')}>
        <div className="mb-3 flex items-start gap-2">
          <Clock3 aria-hidden="true" className="text-primary mt-0.5 size-4" />
          <div>
            <p className="text-sm font-semibold">{t('meetings.series.redesign.timeTitle')}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('meetings.series.redesign.timeHint')}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t('meetings.series.fields.startTime')}
            </label>
            <Select value={startTime} disabled={disabled} onValueChange={changeStart}>
              <SelectTrigger aria-label={t('meetings.series.fields.startTime')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {startOptions.map((option) => {
                  const value = minutesToTime(option)
                  return (
                    <SelectItem key={value} value={value}>
                      <span className="font-medium tabular-nums">
                        {formatClockTime(value, locale, timeFormat)}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <ArrowRight
            aria-hidden="true"
            className="text-muted-foreground mb-2 hidden size-4 shrink-0 sm:block rtl:rotate-180"
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t('meetings.series.fields.endTime')}
            </label>
            <Select value={endTime} disabled={disabled} onValueChange={changeEnd}>
              <SelectTrigger aria-label={t('meetings.series.fields.endTime')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {endOptions.map((option) => {
                  const value = minutesToTime(option)
                  return (
                    <SelectItem key={value} value={value}>
                      <span className="font-medium tabular-nums">
                        {formatClockTime(value, locale, timeFormat)}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-destructive mt-2 text-xs font-medium">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
