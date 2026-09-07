import { Clock3, Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

const DEFAULT_DURATION_PRESETS = [30, 60, 90, 120] as const

export function formatMeetingDuration(minutes: number, t: TFunction): string {
  if (minutes < 60) return t('meetings.create.durationMinutes', { count: minutes })
  if (minutes % 60 === 0) return t('meetings.create.durationHours', { count: minutes / 60 })
  return t('meetings.create.durationHoursMinutes', {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  })
}

interface MeetingDurationPickerProps {
  valueMinutes: number
  disabled?: boolean
  minMinutes?: number
  maxMinutes?: number
  stepMinutes?: number
  title?: string
  description?: string
  error?: string | undefined
  focusRequestId?: number
  onChange: (minutes: number) => void
}

export function MeetingDurationPicker({
  valueMinutes,
  disabled = false,
  minMinutes = 30,
  maxMinutes = 1440,
  stepMinutes = 30,
  title,
  description,
  error,
  focusRequestId = 0,
  onChange,
}: MeetingDurationPickerProps) {
  const { t } = useTranslation()
  const boundedValue = Math.max(minMinutes, Math.min(valueMinutes, maxMinutes))
  const isPreset = DEFAULT_DURATION_PRESETS.includes(
    boundedValue as (typeof DEFAULT_DURATION_PRESETS)[number],
  )
  const [customMode, setCustomMode] = useState(!isPreset)
  const activeControlRef = useRef<HTMLButtonElement | null>(null)
  const changeSource = useRef<'PRESET' | 'CUSTOM' | null>(null)

  useEffect(() => {
    const source = changeSource.current
    changeSource.current = null
    if (source === 'CUSTOM') {
      setCustomMode(true)
      return
    }
    if (source === 'PRESET') {
      setCustomMode(false)
      return
    }
    setCustomMode(
      !DEFAULT_DURATION_PRESETS.includes(boundedValue as (typeof DEFAULT_DURATION_PRESETS)[number]),
    )
  }, [boundedValue])

  useEffect(() => {
    if (focusRequestId <= 0) return
    window.requestAnimationFrame(() => {
      activeControlRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
      activeControlRef.current?.focus({ preventScroll: true })
    })
  }, [focusRequestId])

  function applyPreset(minutes: number) {
    const next = Math.max(minMinutes, Math.min(minutes, maxMinutes))
    changeSource.current = 'PRESET'
    setCustomMode(false)
    onChange(next)
  }

  function enableCustom() {
    setCustomMode(true)
  }

  function adjustCustom(delta: number) {
    const next = Math.max(minMinutes, Math.min(boundedValue + delta, maxMinutes))
    changeSource.current = 'CUSTOM'
    setCustomMode(true)
    onChange(next)
  }

  const heading = title ?? t('meetings.create.howLong')
  const hint = description ?? t('meetings.create.howLongHint')

  return (
    <div
      className={cn('bg-background space-y-3 rounded-xl border p-4', error && 'border-destructive')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Clock3 aria-hidden="true" className="text-primary mt-0.5 size-4" />
          <div>
            <p className="text-sm font-semibold">{heading}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
          </div>
        </div>
        <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-semibold">
          {formatMeetingDuration(boundedValue, t)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {DEFAULT_DURATION_PRESETS.filter(
          (minutes) => minutes >= minMinutes && minutes <= maxMinutes,
        ).map((minutes) => {
          const selected = !customMode && boundedValue === minutes
          return (
            <Button
              key={minutes}
              ref={selected ? activeControlRef : undefined}
              type="button"
              size="sm"
              variant={selected ? 'default' : 'outline'}
              disabled={disabled}
              onClick={() => applyPreset(minutes)}
            >
              {formatMeetingDuration(minutes, t)}
            </Button>
          )
        })}

        <Button
          ref={customMode ? activeControlRef : undefined}
          type="button"
          size="sm"
          variant={customMode ? 'default' : 'outline'}
          disabled={disabled}
          onClick={enableCustom}
        >
          {t('meetings.create.customDuration')}
        </Button>
      </div>

      {customMode ? (
        <div className="bg-muted/30 flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('meetings.create.decreaseDuration')}
            disabled={disabled || boundedValue <= minMinutes}
            onClick={() => adjustCustom(-stepMinutes)}
          >
            <Minus aria-hidden="true" className="size-4" />
          </Button>

          <div className="min-w-32 text-center">
            <p className="font-semibold">{formatMeetingDuration(boundedValue, t)}</p>
            <p className="text-muted-foreground text-[11px]">
              {t('meetings.create.adjustDurationHint')}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('meetings.create.increaseDuration')}
            disabled={disabled || boundedValue + stepMinutes > maxMinutes}
            onClick={() => adjustCustom(stepMinutes)}
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  )
}
