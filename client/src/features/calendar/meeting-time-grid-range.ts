import { APP_TIME_ZONE } from '@/lib/date-time'

const MINUTES_PER_DAY = 24 * 60
const DEFAULT_MEETING_SLOT_MIN_MINUTES = 7 * 60
// FullCalendar slotMaxTime is exclusive. 20:00 keeps the normal schedule visible through 19:59.
const DEFAULT_MEETING_SLOT_MAX_MINUTES = 20 * 60

interface VisibleDateRange {
  start: string
  end: string
}

interface MeetingTimeBounds {
  startAtUtc: string
  endAtUtc: string
}

export interface MeetingTimeGridSlotRange {
  slotMinTime: string
  slotMaxTime: string
  expandedBeforeDefault: boolean
  expandedAfterDefault: boolean
}

interface LocalDateTimeCoordinate {
  coordinateMinutes: number
}

function dateOrdinal(dateOnly: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const milliseconds = Date.UTC(year, month - 1, day)
  const normalized = new Date(milliseconds)
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return null
  }

  return Math.floor(milliseconds / 86_400_000)
}

function localCoordinate(value: string): LocalDateTimeCoordinate | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const ordinal = dateOrdinal(`${values.year}-${values.month}-${values.day}`)
  const hour = Number(values.hour)
  const minute = Number(values.minute)
  if (ordinal === null || !Number.isFinite(hour) || !Number.isFinite(minute)) return null

  return { coordinateMinutes: ordinal * MINUTES_PER_DAY + hour * 60 + minute }
}

function durationString(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.min(MINUTES_PER_DAY, totalMinutes))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

/**
 * Keeps the Meeting schedule at its normal 07:00-20:00 TimeGrid window, but
 * expands to whole-hour boundaries when Meetings in the currently visible
 * Day/Week would otherwise be clipped. A Meeting crossing midnight requires
 * the full 00:00-24:00 axis so both visible segments remain reachable.
 */
export function resolveMeetingTimeGridSlotRange(
  meetings: readonly MeetingTimeBounds[],
  visibleRange: VisibleDateRange | null,
): MeetingTimeGridSlotRange {
  let earliestMinutes = DEFAULT_MEETING_SLOT_MIN_MINUTES
  let latestMinutes = DEFAULT_MEETING_SLOT_MAX_MINUTES

  const rangeStartOrdinal = visibleRange ? dateOrdinal(visibleRange.start) : null
  const rangeEndOrdinal = visibleRange ? dateOrdinal(visibleRange.end) : null
  if (rangeStartOrdinal === null || rangeEndOrdinal === null || rangeEndOrdinal <= rangeStartOrdinal) {
    return {
      slotMinTime: durationString(earliestMinutes),
      slotMaxTime: durationString(latestMinutes),
      expandedBeforeDefault: false,
      expandedAfterDefault: false,
    }
  }

  const rangeStartCoordinate = rangeStartOrdinal * MINUTES_PER_DAY
  const rangeEndCoordinate = rangeEndOrdinal * MINUTES_PER_DAY

  for (const meeting of meetings) {
    const start = localCoordinate(meeting.startAtUtc)
    const end = localCoordinate(meeting.endAtUtc)
    if (!start || !end || end.coordinateMinutes <= start.coordinateMinutes) continue

    const clippedStart = Math.max(start.coordinateMinutes, rangeStartCoordinate)
    const clippedEnd = Math.min(end.coordinateMinutes, rangeEndCoordinate)
    if (clippedEnd <= clippedStart) continue

    const startDay = Math.floor(clippedStart / MINUTES_PER_DAY)
    const endDay = Math.floor((clippedEnd - 1) / MINUTES_PER_DAY)
    if (startDay !== endDay) {
      earliestMinutes = 0
      latestMinutes = MINUTES_PER_DAY
      continue
    }

    const startMinuteOfDay = clippedStart - startDay * MINUTES_PER_DAY
    const endRemainder = clippedEnd % MINUTES_PER_DAY
    const endMinuteOfDay = endRemainder === 0 ? MINUTES_PER_DAY : endRemainder
    earliestMinutes = Math.min(earliestMinutes, startMinuteOfDay)
    latestMinutes = Math.max(latestMinutes, endMinuteOfDay)
  }

  const roundedMin = Math.max(0, Math.floor(earliestMinutes / 60) * 60)
  const roundedMax = Math.min(MINUTES_PER_DAY, Math.ceil(latestMinutes / 60) * 60)

  return {
    slotMinTime: durationString(roundedMin),
    slotMaxTime: durationString(roundedMax),
    expandedBeforeDefault: roundedMin < DEFAULT_MEETING_SLOT_MIN_MINUTES,
    expandedAfterDefault: roundedMax > DEFAULT_MEETING_SLOT_MAX_MINUTES,
  }
}
