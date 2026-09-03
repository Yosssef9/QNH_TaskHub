import type { TimeFormatPreference } from '@/features/auth/types/auth.types'

export const APP_TIME_ZONE = 'Asia/Riyadh'

interface TimeFormatOptions {
  timeFormat?: TimeFormatPreference
  includeDate?: boolean
  dateStyle?: 'short' | 'medium' | 'long' | 'full'
}

function timePartsOptions(timeFormat: TimeFormatPreference): Intl.DateTimeFormatOptions {
  return timeFormat === '24H'
    ? {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23',
      }
    : {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }
}

export function formatTime(
  value: Date | string | number,
  locale = 'en-SA',
  timeFormat: TimeFormatPreference = '12H',
): string {
  return new Intl.DateTimeFormat(locale, {
    ...timePartsOptions(timeFormat),
    numberingSystem: 'latn',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value))
}


export function formatClockTime(
  time: string,
  locale = 'en-SA',
  timeFormat: TimeFormatPreference = '12H',
): string {
  if (!/^\d{2}:\d{2}$/.test(time)) return time
  return formatTime(`2000-01-01T${time}:00+03:00`, locale, timeFormat)
}

export function formatTimeRange(
  start: Date | string | number,
  end: Date | string | number,
  locale = 'en-SA',
  timeFormat: TimeFormatPreference = '12H',
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    ...timePartsOptions(timeFormat),
    numberingSystem: 'latn',
    timeZone: APP_TIME_ZONE,
  })
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`
}

function datePartsOptions(
  dateStyle: NonNullable<TimeFormatOptions['dateStyle']>,
): Intl.DateTimeFormatOptions {
  if (dateStyle === 'short') {
    return { year: 'numeric', month: '2-digit', day: '2-digit' }
  }
  if (dateStyle === 'long') {
    return { year: 'numeric', month: 'long', day: 'numeric' }
  }
  if (dateStyle === 'full') {
    return { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  }
  return { year: 'numeric', month: 'short', day: 'numeric' }
}

export function formatDateTime(
  value: Date | string | number,
  locale = 'en-SA',
  timeFormat: TimeFormatPreference = '12H',
  options: TimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    ...datePartsOptions(options.dateStyle ?? 'medium'),
    ...timePartsOptions(options.timeFormat ?? timeFormat),
    numberingSystem: 'latn',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value))
}

export function formatCalendarAxisTime(
  value: Date | string | number,
  locale = 'en-SA',
  timeFormat: TimeFormatPreference = '12H',
): string {
  if (timeFormat === '24H') {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
      numberingSystem: 'latn',
      timeZone: APP_TIME_ZONE,
    }).format(new Date(value))
  }

  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    hour12: true,
    numberingSystem: 'latn',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value))
}

type RiyadhDateTimePart = 'year' | 'month' | 'day' | 'hour' | 'minute'

function formatPart(value: Date | string | number, type: RiyadhDateTimePart): string {
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      numberingSystem: 'latn',
    })
      .formatToParts(new Date(value))
      .find((part) => part.type === type)?.value ?? ''
  )
}

export function formatRiyadhDateInput(value: Date | string | number): string {
  const year = formatPart(value, 'year')
  const month = formatPart(value, 'month')
  const day = formatPart(value, 'day')
  return `${year}-${month}-${day}`
}

export function formatRiyadhTimeInput(value: Date | string | number): string {
  const hour = formatPart(value, 'hour')
  const minute = formatPart(value, 'minute')
  return `${hour}:${minute}`
}

export function riyadhLocalDateTimeToUtcIso(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('A valid Riyadh date and time are required.')
  }

  // QNH scheduling is fixed to Asia/Riyadh. Saudi Arabia currently uses UTC+03:00 year-round.
  const value = new Date(`${date}T${time}:00+03:00`)
  if (Number.isNaN(value.getTime())) {
    throw new Error('A valid Riyadh date and time are required.')
  }
  return value.toISOString()
}
