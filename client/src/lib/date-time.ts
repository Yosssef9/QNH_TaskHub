export const APP_TIME_ZONE = 'Asia/Riyadh'

export function formatDateTime(value: Date | string | number, locale = 'en-SA'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
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
