import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorOpen,
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import type { MeetingScheduleSlotInterval } from '@/features/auth/types/auth.types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonStyles } from '@/components/ui/button.styles'
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/cn'
import {
  formatClockTime,
  formatRiyadhDateInput,
  formatTime,
  riyadhLocalDateTimeToUtcIso,
} from '@/lib/date-time'
import { getMeetingRoomAccent } from '@/features/meetings/meeting-room-colors'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { useUpdatePreferences } from '@/features/preferences/hooks/use-update-preferences'

import { MeetingAgendaDisplay } from './MeetingAgendaDisplay'
import { MeetingDurationPicker, formatMeetingDuration } from './MeetingDurationPicker'
import { useMeetingDetail, useMeetingSchedule } from '../hooks/use-meetings'
import type { MeetingRoom, MeetingScheduleEntry } from '../types/meeting.types'

const DAY_MINUTES = 24 * 60
const SELECTION_STEP_MINUTES = 15
const MIN_MEETING_DURATION_MINUTES = 30
const DEFAULT_SLOT_VIEW_MINUTES: MeetingScheduleSlotInterval = 30
const SLOT_VIEW_OPTIONS = [15, 30, 60] as const satisfies readonly MeetingScheduleSlotInterval[]
const VISIBLE_OPTION_COUNT = 6
const WINDOW_STEP_OPTIONS = 4
const ROOM_REQUIRED_TOAST_ID = 'meeting-room-required-before-time'

export type MeetingScheduleFocusField = 'date' | 'room' | 'capacity' | 'duration' | 'time' | null

export interface MeetingScheduleValidationErrors {
  date?: string
  room?: string
  capacity?: string
  duration?: string
  time?: string
}

export interface MeetingScheduleSelectionState {
  selectedRoom: MeetingRoom | null
  hasCapacity: boolean
  hasKnownConflict: boolean
  isPast: boolean
  canSchedule: boolean
  isChecking: boolean
  hasScheduleLoadError: boolean
}

export interface MeetingScheduleSupplementalBusyRange {
  startTime: string
  endTime: string
  label?: string
}

interface MeetingSchedulePickerProps {
  date: string
  roomId: number | null
  rooms: MeetingRoom[]
  participantCount: number
  startTime: string
  endTime: string
  timeSelected?: boolean
  disabled?: boolean
  allowBusySelection?: boolean
  showDurationPicker?: boolean
  directTimeRangeSelection?: boolean
  supplementalBusyRanges?: readonly MeetingScheduleSupplementalBusyRange[]
  excludeMeetingId?: number | null
  heading?: string
  description?: string
  focused?: boolean
  validationErrors?: MeetingScheduleValidationErrors
  focusField?: MeetingScheduleFocusField
  focusRequestId?: number
  onFocusToggle?: () => void
  onFocusRequest?: () => void
  onValidationClear?: (field: keyof MeetingScheduleValidationErrors) => void
  onSelectionStateChange?: (state: MeetingScheduleSelectionState) => void
  onDateChange: (date: string) => void
  onRoomChange: (roomId: number | null) => void
  onDurationChange?: (minutes: number) => void
  onTimeChange: (startTime: string, endTime: string) => void
}

function dateOnlyToUtcDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12))
}

function shiftDateOnly(value: string, days: number): string {
  const date = dateOnlyToUtcDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

function minutesToTime(value: number): string {
  const bounded = Math.max(0, Math.min(1439, Math.round(value)))
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`
}

function durationBetween(startTime: string, endTime: string): number {
  return Math.max(MIN_MEETING_DURATION_MINUTES, timeToMinutes(endTime) - timeToMinutes(startTime))
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB
}

function scheduleStartUtcMs(date: string, startMinutes: number): number | null {
  try {
    const value = new Date(riyadhLocalDateTimeToUtcIso(date, minutesToTime(startMinutes))).getTime()
    return Number.isNaN(value) ? null : value
  } catch {
    return null
  }
}

function hasStartTimePassed(date: string, startMinutes: number, nowUtcMs: number): boolean {
  const startUtcMs = scheduleStartUtcMs(date, startMinutes)
  return startUtcMs !== null && startUtcMs <= nowUtcMs
}

function isQuarterHourAligned(minutes: number): boolean {
  return minutes % SELECTION_STEP_MINUTES === 0
}

function preferredSlotViewForStartMinutes(startMinutes: number): MeetingScheduleSlotInterval {
  const minuteWithinHour = startMinutes % 60
  if (minuteWithinHour === 0) return 60
  if (minuteWithinHour === 30) return 30
  return 15
}

function firstFutureDisplaySlotIndex(
  date: string,
  slotViewMinutes: MeetingScheduleSlotInterval,
  nowUtcMs: number,
): number {
  const totalSlots = DAY_MINUTES / slotViewMinutes
  for (let index = 0; index < totalSlots; index += 1) {
    if (!hasStartTimePassed(date, index * slotViewMinutes, nowUtcMs)) return index
  }
  return totalSlots - 1
}

function entryMinutes(
  entry: MeetingScheduleEntry,
  date: string,
): { start: number; end: number } | null {
  const dayStart = new Date(riyadhLocalDateTimeToUtcIso(date, '00:00')).getTime()
  const dayEnd = new Date(riyadhLocalDateTimeToUtcIso(shiftDateOnly(date, 1), '00:00')).getTime()
  const start = Math.max(new Date(entry.startAtUtc).getTime(), dayStart)
  const end = Math.min(new Date(entry.endAtUtc).getTime(), dayEnd)
  if (end <= start) return null
  return {
    start: Math.floor((start - dayStart) / 60_000),
    end: Math.ceil((end - dayStart) / 60_000),
  }
}

function formatDateLabel(
  date: string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    ...options,
  }).format(dateOnlyToUtcDate(date))
}

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join('')
    .toUpperCase()
}

function BusyMeetingBlock({
  entry,
  left,
  width,
  durationMinutes,
  locale,
}: {
  entry: MeetingScheduleEntry
  left: number
  width: number
  durationMinutes: number
  locale: string
}) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const [open, setOpen] = useState(false)
  const inspectable = entry.visibility === 'FULL'
  const detailQuery = useMeetingDetail(open && inspectable ? entry.meetingId : null)
  const roomName = i18n.language.startsWith('ar') ? entry.room.nameAr : entry.room.nameEn
  const quickTitle = entry.visibility === 'BUSY' ? t('meetings.create.slotBusy') : entry.title
  const timeText = `${formatTime(entry.startAtUtc, locale, timeFormat)} – ${formatTime(entry.endAtUtc, locale, timeFormat)}`
  const accent = getMeetingRoomAccent(entry.room.colorKey)
  const blockStyle = {
    left: `${left}%`,
    width: `${width}%`,
    backgroundImage:
      'repeating-linear-gradient(135deg, color-mix(in oklab, var(--warning) 34%, transparent) 0 6px, transparent 6px 12px)',
  }
  const blockClass =
    'group absolute inset-y-0 z-10 rounded-md border border-warning/65 bg-warning/20 text-warning-foreground shadow-xs outline-none transition hover:bg-warning/30 focus-visible:ring-2 focus-visible:ring-ring'

  const triggerContent = (
    <>
      {durationMinutes >= 60 ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 overflow-hidden px-1 text-[10px] font-bold tracking-wide uppercase">
          <span>{t('meetings.create.slotBusy')}</span>
          {inspectable ? <Eye aria-hidden="true" className="size-3 shrink-0" /> : null}
        </span>
      ) : null}
      <span
        role="tooltip"
        className="bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-[calc(100%+0.55rem)] left-1/2 z-40 hidden w-max max-w-64 -translate-x-1/2 overflow-hidden rounded-xl border text-start text-[11px] tracking-normal normal-case shadow-xl group-hover:block group-focus-visible:block"
      >
        <span className="flex min-w-52 items-stretch">
          <span aria-hidden="true" className="w-1 shrink-0" style={{ backgroundColor: accent }} />
          <span className="min-w-0 flex-1 px-3 py-2.5">
            <strong className="block truncate text-xs leading-5">{quickTitle}</strong>
            <span className="text-muted-foreground mt-1 flex items-center gap-1.5 tabular-nums">
              <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
              {timeText}
            </span>
            <span className="text-muted-foreground mt-1 flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{roomName}</span>
            </span>
            {entry.visibility !== 'BUSY' ? (
              <span className="text-muted-foreground mt-1 flex items-center gap-1.5">
                <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">
                  {t('meetings.organizedBy', { name: entry.organizer.userName })}
                </span>
              </span>
            ) : null}
            {inspectable ? (
              <span className="text-primary mt-1.5 block font-medium">
                {t('meetings.create.clickForMeetingDetails')}
              </span>
            ) : null}
          </span>
        </span>
      </span>
    </>
  )

  if (!inspectable) {
    return (
      <span
        role="note"
        tabIndex={0}
        className={blockClass}
        style={blockStyle}
        aria-label={`${quickTitle}. ${timeText}`}
      >
        {triggerContent}
      </span>
    )
  }

  const meeting = detailQuery.data?.meeting ?? null
  const statusVariant =
    meeting?.status === 'SCHEDULED'
      ? 'success'
      : meeting?.status === 'PENDING_APPROVAL'
        ? 'warning'
        : 'destructive'
  const previewPeople = meeting
    ? [meeting.organizer.userName, ...meeting.attendees.map((attendee) => attendee.userName)]
    : []
  const visiblePeople = previewPeople.slice(0, 3)
  const extraPeople = Math.max(0, previewPeople.length - visiblePeople.length)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={blockClass}
          style={blockStyle}
          aria-label={`${entry.title}. ${timeText}. ${t('meetings.create.clickForMeetingDetails')}`}
        >
          {triggerContent}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={10}
        collisionPadding={12}
        className="border-border/80 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0 shadow-2xl"
        style={{ '--meeting-preview-accent': accent } as CSSProperties}
      >
        <div className="relative overflow-hidden">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 start-0 w-1.5"
            style={{ backgroundColor: accent }}
          />

          <header className="border-border/70 bg-muted/20 border-b px-5 pt-4 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-[10px] font-bold tracking-[0.12em] uppercase">
                  {t('meetings.create.busyMeetingDetails')}
                </p>
                <h3 className="mt-1.5 line-clamp-2 text-lg leading-6 font-bold tracking-tight">
                  {entry.title}
                </h3>
              </div>
              {meeting ? (
                <Badge
                  variant={statusVariant}
                  className="border-border/60 shrink-0 gap-1.5 border px-2.5 py-1"
                >
                  {meeting.status === 'SCHEDULED' ? (
                    <CheckCircle2 aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Clock3 aria-hidden="true" className="size-3.5" />
                  )}
                  {t(`meetings.status.${meeting.status}`)}
                </Badge>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="bg-background/85 text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold tabular-nums shadow-xs">
                <Clock3 aria-hidden="true" className="text-primary size-3.5" />
                {timeText}
              </span>
            </div>
          </header>

          {detailQuery.isPending ? (
            <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 p-5 text-sm">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {t('meetings.create.loadingMeetingDetails')}
            </div>
          ) : detailQuery.isError || !meeting ? (
            <div className="text-destructive flex min-h-32 items-center justify-center p-5 text-center text-sm">
              {t('meetings.create.meetingDetailsLoadError')}
            </div>
          ) : (
            <div className="space-y-3.5 p-4 ps-5 text-sm">
              <div
                className="bg-muted/20 rounded-xl border p-3"
                style={{ borderInlineStartWidth: 3, borderInlineStartColor: accent }}
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="bg-background text-primary grid size-8 shrink-0 place-items-center rounded-lg border shadow-xs">
                    <MapPin aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-[11px] font-medium">
                      {t('meetings.fields.room')}
                    </p>
                    <p className="mt-0.5 truncate font-semibold">{roomName}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="bg-background rounded-xl border p-3 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-full font-bold">
                      {personInitials(meeting.organizer.userName)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-[11px] font-medium">
                        {t('meetings.create.organizerLabel')}
                      </p>
                      <p className="mt-0.5 truncate font-semibold">{meeting.organizer.userName}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-background rounded-xl border p-3 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-lg">
                      <UsersRound aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-muted-foreground text-[11px] font-medium">
                        {t('meetings.workspace.participants')}
                      </p>
                      <p className="mt-0.5 font-semibold">
                        {t('meetings.participantCount', { count: meeting.participantCount })}
                      </p>
                      {visiblePeople.length > 0 ? (
                        <div className="mt-2 flex items-center -space-x-1.5 rtl:space-x-reverse">
                          {visiblePeople.map((name, index) => (
                            <span
                              key={`${name}-${index}`}
                              title={name}
                              className="bg-muted text-foreground border-background grid size-6 place-items-center rounded-full border-2 text-[9px] font-bold"
                            >
                              {personInitials(name)}
                            </span>
                          ))}
                          {extraPeople > 0 ? (
                            <span className="bg-primary/10 text-primary border-background grid size-6 place-items-center rounded-full border-2 text-[9px] font-bold">
                              +{extraPeople}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <section className="bg-muted/15 rounded-xl border p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <FileText aria-hidden="true" className="text-primary size-4" />
                  <span>{t('meetings.fields.descriptionPurpose')}</span>
                </div>
                <p
                  className={cn(
                    'mt-2 line-clamp-3 text-sm leading-6 whitespace-pre-wrap',
                    !meeting.description && 'text-muted-foreground italic',
                  )}
                >
                  {meeting.description || t('meetings.workspace.noDescription')}
                </p>
              </section>

              <MeetingAgendaDisplay items={detailQuery.data?.agendaItems ?? []} variant="compact" />
            </div>
          )}

          {meeting ? (
            <footer className="border-border/70 bg-muted/15 border-t px-4 py-3 ps-5">
              <a
                href={`${import.meta.env.BASE_URL}meetings/${entry.meetingId}`}
                target="_blank"
                rel="noreferrer"
                className={buttonStyles({ size: 'sm', className: 'w-full justify-center' })}
                aria-label={t('meetings.create.openMeetingNewTab')}
              >
                {t('meetings.create.openMeeting')}
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            </footer>
          ) : null}
        </div>
        <PopoverArrow width={18} height={9} className="drop-shadow-sm" />
      </PopoverContent>
    </Popover>
  )
}

export function MeetingSchedulePicker({
  date,
  roomId,
  rooms,
  participantCount,
  startTime,
  endTime,
  timeSelected = true,
  disabled = false,
  allowBusySelection = false,
  showDurationPicker = true,
  directTimeRangeSelection = false,
  supplementalBusyRanges = [],
  excludeMeetingId = null,
  heading,
  description,
  focused = false,
  validationErrors = {},
  focusField = null,
  focusRequestId = 0,
  onFocusToggle,
  onFocusRequest,
  onValidationClear,
  onSelectionStateChange,
  onDateChange,
  onRoomChange,
  onDurationChange,
  onTimeChange,
}: MeetingSchedulePickerProps) {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const updatePreferences = useUpdatePreferences()
  const timeFormat = useTimeFormatPreference()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-SA'
  const rtl = i18n.dir() === 'rtl'
  const PreviousIcon = rtl ? ChevronRight : ChevronLeft
  const NextIcon = rtl ? ChevronLeft : ChevronRight
  const preferredSlotViewMinutes =
    currentUser.data?.preferences.meetingScheduleSlotInterval ?? DEFAULT_SLOT_VIEW_MINUTES

  const selectedDuration = durationBetween(startTime, endTime)
  const [roomPromptedByTime, setRoomPromptedByTime] = useState(false)
  const [slotViewMinutes, setSlotViewMinutes] =
    useState<MeetingScheduleSlotInterval>(preferredSlotViewMinutes)
  const [nowUtcMs, setNowUtcMs] = useState(() => Date.now())
  const selectedStartMinutes = timeToMinutes(startTime)
  const selectedEndMinutes = timeToMinutes(endTime)
  const totalDisplaySlots = DAY_MINUTES / slotViewMinutes
  const maxWindowStartSlot = Math.max(0, totalDisplaySlots - VISIBLE_OPTION_COUNT)
  const selectedDisplaySlotIndex = Math.floor(selectedStartMinutes / slotViewMinutes)
  const [windowStartSlot, setWindowStartSlot] = useState(() => {
    const now = Date.now()
    const today = formatRiyadhDateInput(now)
    const anchorDate = date || today
    const anchorIndex =
      anchorDate === today && hasStartTimePassed(anchorDate, selectedStartMinutes, now)
        ? firstFutureDisplaySlotIndex(anchorDate, preferredSlotViewMinutes, now)
        : Math.floor(selectedStartMinutes / preferredSlotViewMinutes)
    return Math.max(
      0,
      Math.min(
        Math.max(0, DAY_MINUTES / preferredSlotViewMinutes - VISIBLE_OPTION_COUNT),
        anchorIndex - 2,
      ),
    )
  })
  const effectiveWindowStartSlot = Math.min(windowStartSlot, maxWindowStartSlot)
  const dateFocusRef = useRef<HTMLButtonElement | null>(null)
  const roomFocusRef = useRef<HTMLButtonElement | null>(null)
  const durationFocusRef = useRef<HTMLButtonElement | null>(null)
  const timeFocusRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setSlotViewMinutes(preferredSlotViewMinutes)
  }, [preferredSlotViewMinutes])

  useEffect(() => {
    const timerId = window.setInterval(() => setNowUtcMs(Date.now()), 30_000)
    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    if (!focusField || focusRequestId <= 0) return
    const ref =
      focusField === 'date'
        ? dateFocusRef
        : focusField === 'room' || focusField === 'capacity'
          ? roomFocusRef
          : focusField === 'duration'
            ? durationFocusRef
            : timeFocusRef
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      ref.current?.focus()
    })
  }, [focusField, focusRequestId])

  useEffect(() => {
    if (!roomId) return
    setRoomPromptedByTime(false)
    toast.dismiss(ROOM_REQUIRED_TOAST_ID)
  }, [roomId])

  useEffect(() => {
    const now = Date.now()
    const today = formatRiyadhDateInput(now)
    const anchorDate = date || today
    const anchorIndex =
      anchorDate === today && hasStartTimePassed(anchorDate, selectedStartMinutes, now)
        ? firstFutureDisplaySlotIndex(anchorDate, slotViewMinutes, now)
        : selectedDisplaySlotIndex
    setWindowStartSlot(Math.max(0, Math.min(maxWindowStartSlot, anchorIndex - 2)))
  }, [
    date,
    maxWindowStartSlot,
    roomId,
    selectedDisplaySlotIndex,
    selectedStartMinutes,
    slotViewMinutes,
  ])

  const scheduleInput = useMemo(() => {
    if (!date || !roomId) return null
    return {
      fromAtUtc: riyadhLocalDateTimeToUtcIso(date, '00:00'),
      toAtUtc: riyadhLocalDateTimeToUtcIso(shiftDateOnly(date, 1), '00:00'),
      roomId,
    }
  }, [date, roomId])
  const scheduleQuery = useMeetingSchedule(scheduleInput)
  const today = formatRiyadhDateInput(nowUtcMs)
  const displayDate = date || today

  const scheduleRanges = useMemo(
    () =>
      (scheduleQuery.data ?? [])
        .filter(
          (entry) =>
            !(
              excludeMeetingId !== null &&
              entry.visibility === 'FULL' &&
              entry.meetingId === excludeMeetingId
            ),
        )
        .map((entry) => ({ entry, range: entryMinutes(entry, displayDate) }))
        .filter(
          (item): item is { entry: MeetingScheduleEntry; range: { start: number; end: number } } =>
            item.range !== null,
        ),
    [displayDate, excludeMeetingId, scheduleQuery.data],
  )

  const supplementalRanges = useMemo(
    () =>
      supplementalBusyRanges
        .map((item) => ({
          ...item,
          start: timeToMinutes(item.startTime),
          end: timeToMinutes(item.endTime),
        }))
        .filter((item) => item.end > item.start),
    [supplementalBusyRanges],
  )

  const selectedRoom = rooms.find((room) => room.id === roomId) ?? null
  const orderedRooms = useMemo(
    () =>
      [...rooms].sort((left, right) => {
        const leftFits = left.capacity >= participantCount
        const rightFits = right.capacity >= participantCount
        if (leftFits !== rightFits) return leftFits ? -1 : 1
        return left.capacity - right.capacity || left.id - right.id
      }),
    [participantCount, rooms],
  )

  const dateCards = useMemo(
    () => Array.from({ length: 7 }, (_, index) => shiftDateOnly(displayDate, index - 3)),
    [displayDate],
  )
  const activeDuration = selectedDuration

  const visibleOptions = Array.from({ length: VISIBLE_OPTION_COUNT }, (_, offset) => {
    const index = effectiveWindowStartSlot + offset
    const start = index * slotViewMinutes
    return {
      index,
      start,
      end: start + activeDuration,
    }
  })

  const customTimeOptions = Array.from(
    { length: DAY_MINUTES / SELECTION_STEP_MINUTES },
    (_, index) => index * SELECTION_STEP_MINUTES,
  )

  function chooseTime(optionStart: number, optionEnd: number, isBusy: boolean): boolean {
    if (!date || optionEnd > DAY_MINUTES || hasStartTimePassed(date, optionStart, Date.now())) return false

    if (!roomId) {
      setRoomPromptedByTime(true)
      toast.error(t('meetings.create.chooseRoomBeforeTimeToast'), {
        id: ROOM_REQUIRED_TOAST_ID,
      })

      window.requestAnimationFrame(() => {
        roomFocusRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        })
        roomFocusRef.current?.focus({ preventScroll: true })
      })
      return false
    }

    if (isBusy && !allowBusySelection) return false
    onValidationClear?.('time')
    onTimeChange(minutesToTime(optionStart), minutesToTime(optionEnd))
    return true
  }

  function busyEntryForRange(rangeStart: number, rangeEnd: number): MeetingScheduleEntry | null {
    return (
      scheduleRanges.find(({ range }) => overlaps(rangeStart, rangeEnd, range.start, range.end))
        ?.entry ?? null
    )
  }

  function hasSupplementalBusyRange(rangeStart: number, rangeEnd: number): boolean {
    return supplementalRanges.some((range) =>
      overlaps(rangeStart, rangeEnd, range.start, range.end),
    )
  }

  async function changeSlotViewMinutes(nextValue: MeetingScheduleSlotInterval) {
    if (nextValue === slotViewMinutes) return
    const previous = slotViewMinutes
    setSlotViewMinutes(nextValue)

    try {
      await updatePreferences.mutateAsync({ meetingScheduleSlotInterval: nextValue })
    } catch {
      setSlotViewMinutes(previous)
      toast.error(t('meetings.create.slotViewPreferenceError'))
    }
  }

  const selectedHasKnownConflict =
    timeSelected &&
    (scheduleRanges.some(({ range }) =>
      overlaps(selectedStartMinutes, selectedEndMinutes, range.start, range.end),
    ) ||
      hasSupplementalBusyRange(selectedStartMinutes, selectedEndMinutes))
  const selectedStartIsPast =
    timeSelected && Boolean(date) && hasStartTimePassed(date, selectedStartMinutes, nowUtcMs)
  const selectedUsesValidIncrement =
    isQuarterHourAligned(selectedStartMinutes) && isQuarterHourAligned(selectedEndMinutes)
  const selectedRoomHasCapacity = selectedRoom !== null && selectedRoom.capacity >= participantCount
  const selectionCanSchedule =
    timeSelected &&
    Boolean(date) &&
    selectedRoom !== null &&
    selectedRoomHasCapacity &&
    !selectedHasKnownConflict &&
    !selectedStartIsPast &&
    selectedUsesValidIncrement &&
    !scheduleQuery.isFetching &&
    !scheduleQuery.isError

  useEffect(() => {
    onSelectionStateChange?.({
      selectedRoom,
      hasCapacity: selectedRoomHasCapacity,
      hasKnownConflict: selectedHasKnownConflict,
      isPast: selectedStartIsPast,
      canSchedule: selectionCanSchedule,
      isChecking: scheduleQuery.isFetching,
      hasScheduleLoadError: scheduleQuery.isError,
    })
  }, [
    onSelectionStateChange,
    scheduleQuery.isError,
    scheduleQuery.isFetching,
    selectedHasKnownConflict,
    selectedRoom,
    selectedRoomHasCapacity,
    selectedStartIsPast,
    selectionCanSchedule,
  ])

  const firstVisibleTime = minutesToTime(effectiveWindowStartSlot * slotViewMinutes)
  const lastVisibleStart = minutesToTime(
    Math.min(DAY_MINUTES - 1, (effectiveWindowStartSlot + VISIBLE_OPTION_COUNT - 1) * slotViewMinutes),
  )

  return (
    <section
      className="bg-muted/20 flex min-h-full flex-col gap-6 p-5 sm:p-6 xl:p-7"
      onClick={onFocusRequest}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
            <CalendarDays aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">{heading ?? t('meetings.create.scheduleTitle')}</h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {description ?? t('meetings.create.scheduleDescription')}
            </p>
          </div>
        </div>
        {onFocusToggle ? (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={focused}
            disabled={disabled}
            onClick={(event) => {
              if (onFocusRequest) event.stopPropagation()
              onFocusToggle()
            }}
          >
            {focused ? (
              <Minimize2 aria-hidden="true" className="size-4" />
            ) : (
              <Maximize2 aria-hidden="true" className="size-4" />
            )}
            {t(focused ? 'meetings.create.showBothSections' : 'meetings.create.focusSection')}
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t('meetings.create.chooseDate')}</p>
            <p className="text-muted-foreground text-xs">
              {date
                ? formatDateLabel(date, locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : t('meetings.create.dateNotSelected')}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('meetings.create.previousWeek')}
              disabled={disabled || shiftDateOnly(displayDate, -7) < today}
              onClick={() => {
                onValidationClear?.('date')
                onValidationClear?.('time')
                onDateChange(shiftDateOnly(displayDate, -7))
              }}
            >
              <PreviousIcon aria-hidden="true" className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('meetings.create.nextWeek')}
              disabled={disabled}
              onClick={() => {
                onValidationClear?.('date')
                onValidationClear?.('time')
                onDateChange(shiftDateOnly(displayDate, 7))
              }}
            >
              <NextIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid [scrollbar-width:thin] auto-cols-[minmax(5.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2">
          {dateCards.map((itemDate) => {
            const selected = itemDate === date
            const isPast = itemDate < today
            return (
              <button
                key={itemDate}
                type="button"
                ref={selected ? dateFocusRef : undefined}
                aria-current={selected ? 'date' : undefined}
                disabled={disabled || isPast}
                onClick={() => {
                  onValidationClear?.('date')
                  onValidationClear?.('time')
                  onDateChange(itemDate)
                }}
                className={cn(
                  'focus-visible:ring-ring min-h-16 rounded-xl border px-2 py-2 text-center transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'bg-background hover:border-primary/40 hover:bg-accent',
                )}
              >
                <span className="block text-[11px] font-medium opacity-80">
                  {formatDateLabel(itemDate, locale, { weekday: 'short' })}
                </span>
                <span className="mt-1 block text-base font-semibold">
                  {formatDateLabel(itemDate, locale, { day: 'numeric' })}
                </span>
              </button>
            )
          })}
        </div>

        <div className="max-w-56">
          <DatePicker
            required
            value={date}
            minDate={today}
            label={t('meetings.create.jumpToDate')}
            disabled={disabled}
            onChange={(nextDate) => {
              onValidationClear?.('date')
              onValidationClear?.('time')
              onDateChange(nextDate)
            }}
          />
        </div>
        {validationErrors.date ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {validationErrors.date}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          'space-y-3 rounded-xl transition-[background-color,box-shadow] duration-300',
          roomPromptedByTime &&
            !roomId &&
            'bg-destructive/5 ring-destructive/20 ring-offset-muted/20 ring-2 ring-offset-4',
        )}
      >
        <div className="flex items-center gap-2">
          <DoorOpen
            aria-hidden="true"
            className={cn(
              'size-4 transition-colors',
              roomPromptedByTime && !roomId ? 'text-destructive' : 'text-muted-foreground',
            )}
          />
          <p className="text-sm font-semibold">{t('meetings.create.chooseRoom')}</p>
        </div>

        {orderedRooms.length === 0 ? (
          <div className="border-warning/30 bg-warning/5 rounded-xl border p-4 text-sm">
            {t('meetings.noActiveRooms')}
          </div>
        ) : (
          <div className="grid [scrollbar-width:thin] auto-cols-[minmax(11.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2">
            {orderedRooms.map((room) => {
              const selected = room.id === roomId
              const fits = room.capacity >= participantCount
              const roomName = i18n.language.startsWith('ar') ? room.nameAr : room.nameEn
              return (
                <button
                  key={room.id}
                  ref={selected || (!roomId && room === orderedRooms[0]) ? roomFocusRef : undefined}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-invalid={Boolean(
                    ((validationErrors.room || validationErrors.capacity) && selected) ||
                    (roomPromptedByTime && !roomId && room === orderedRooms[0]),
                  )}
                  aria-describedby={
                    roomPromptedByTime && !roomId && room === orderedRooms[0]
                      ? 'meeting-room-before-time-error'
                      : undefined
                  }
                  onClick={() => {
                    setRoomPromptedByTime(false)
                    toast.dismiss(ROOM_REQUIRED_TOAST_ID)
                    onValidationClear?.('room')
                    onValidationClear?.('capacity')
                    onValidationClear?.('time')
                    onRoomChange(room.id)
                  }}
                  className={cn(
                    'focus-visible:ring-ring min-h-28 rounded-xl border p-3 text-start transition outline-none focus-visible:ring-2',
                    selected
                      ? 'border-primary bg-primary/10 ring-primary/15 ring-1'
                      : 'bg-background hover:border-primary/40 hover:bg-accent/40',
                    !fits && !selected && 'border-warning/35 bg-warning/5',
                    roomPromptedByTime &&
                      !roomId &&
                      room === orderedRooms[0] &&
                      'border-destructive/60 bg-destructive/5 ring-destructive/20 ring-2',
                    (validationErrors.room || validationErrors.capacity) &&
                      selected &&
                      'border-destructive ring-destructive/20 ring-2',
                  )}
                >
                  <span className="block truncate text-sm font-semibold">{roomName}</span>
                  <span className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                    <UsersRound aria-hidden="true" className="size-3.5" />
                    {t('meetings.capacityValue', { count: room.capacity })}
                  </span>
                  <span
                    className={cn(
                      'mt-1 block text-xs font-medium',
                      fits ? 'text-success' : 'text-warning-foreground',
                    )}
                  >
                    {fits
                      ? t('meetings.create.roomFits', { count: participantCount })
                      : t('meetings.create.roomTooSmall', { count: participantCount })}
                  </span>
                  {room.locationText ? (
                    <span className="text-muted-foreground mt-1.5 flex items-start gap-1 text-xs">
                      <MapPin aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                      <span className="line-clamp-2">{room.locationText}</span>
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
        {roomPromptedByTime && !roomId ? (
          <p
            id="meeting-room-before-time-error"
            role="alert"
            className="text-destructive flex items-center gap-1.5 text-xs font-medium"
          >
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
            {t('meetings.create.chooseRoomBeforeTimeInline')}
          </p>
        ) : null}
        {validationErrors.room ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {validationErrors.room}
          </p>
        ) : null}
        {validationErrors.capacity ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {validationErrors.capacity}
          </p>
        ) : null}
      </div>

      {showDurationPicker ? (
        <MeetingDurationPicker
          valueMinutes={selectedDuration}
          maxMinutes={Math.max(MIN_MEETING_DURATION_MINUTES, DAY_MINUTES - selectedStartMinutes)}
          stepMinutes={SELECTION_STEP_MINUTES}
          disabled={disabled || (!timeSelected && !onDurationChange)}
          error={validationErrors.duration}
          focusRequestId={focusField === 'duration' ? focusRequestId : 0}
          onChange={(minutes) => {
            onValidationClear?.('duration')
            onValidationClear?.('time')
            if (!timeSelected && onDurationChange) {
              onDurationChange(minutes)
              return
            }
            onTimeChange(startTime, minutesToTime(selectedStartMinutes + minutes))
          }}
        />
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{t('meetings.create.roomDayOverview')}</p>
              {scheduleQuery.isFetching ? (
                <Loader2
                  aria-hidden="true"
                  className="text-muted-foreground size-3.5 animate-spin"
                />
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              {roomId
                ? t('meetings.create.roomDayOverviewHint')
                : t('meetings.create.chooseRoomToSeeAvailability')}
            </p>
          </div>
        </div>

        <div className="bg-background rounded-xl border p-3" dir={rtl ? 'rtl' : 'ltr'}>
          <div className="bg-muted/20 relative h-14 rounded-lg border">
            {roomId
              ? scheduleRanges.map(({ entry, range }, index) => {
                  const left = rtl ? ((DAY_MINUTES - range.end) / DAY_MINUTES) * 100 : (range.start / DAY_MINUTES) * 100
                  const width = Math.max(0.9, ((range.end - range.start) / DAY_MINUTES) * 100)
                  return (
                    <BusyMeetingBlock
                      key={`${entry.startAtUtc}-${entry.endAtUtc}-${index}`}
                      entry={entry}
                      left={left}
                      width={width}
                      durationMinutes={range.end - range.start}
                      locale={locale}
                    />
                  )
                })
              : null}
            {roomId
              ? supplementalRanges.map((range, index) => {
                  const left = rtl
                    ? ((DAY_MINUTES - range.end) / DAY_MINUTES) * 100
                    : (range.start / DAY_MINUTES) * 100
                  const width = Math.max(0.9, ((range.end - range.start) / DAY_MINUTES) * 100)
                  return (
                    <span
                      key={`${range.startTime}-${range.endTime}-${index}`}
                      title={range.label}
                      className="border-warning/70 bg-warning/20 absolute inset-y-1 z-10 rounded-md border"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundImage:
                          'repeating-linear-gradient(135deg, color-mix(in oklab, var(--warning) 22%, transparent) 0 4px, transparent 4px 8px)',
                      }}
                    />
                  )
                })
              : null}
            {roomId && timeSelected ? (
              <span
                title={`${formatClockTime(startTime, locale, timeFormat)} – ${formatClockTime(endTime, locale, timeFormat)}`}
                className={cn(
                  'absolute inset-y-1 z-20 rounded-md border-2',
                  selectedStartIsPast
                    ? 'border-muted-foreground/50 bg-muted-foreground/15'
                    : selectedHasKnownConflict
                      ? 'border-destructive bg-destructive/20 shadow-sm'
                      : 'border-primary bg-primary/20 shadow-sm',
                )}
                style={{
                  left: `${
                    rtl
                      ? ((DAY_MINUTES - selectedEndMinutes) / DAY_MINUTES) * 100
                      : (selectedStartMinutes / DAY_MINUTES) * 100
                  }%`,
                  width: `${Math.max(1, ((selectedEndMinutes - selectedStartMinutes) / DAY_MINUTES) * 100)}%`,
                }}
              />
            ) : null}
          </div>
          <div className="text-muted-foreground mt-1.5 flex justify-between text-[10px] tabular-nums">
            <span>{formatClockTime('00:00', locale, timeFormat)}</span>
            <span>{formatClockTime('06:00', locale, timeFormat)}</span>
            <span>{formatClockTime('12:00', locale, timeFormat)}</span>
            <span>{formatClockTime('18:00', locale, timeFormat)}</span>
            <span>{formatClockTime('00:00', locale, timeFormat)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span
                className="bg-warning/25 border-warning size-3 rounded-sm border"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, color-mix(in oklab, var(--warning) 40%, transparent) 0 3px, transparent 3px 6px)',
                }}
              />
              {t('meetings.create.slotBusy')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-primary/20 border-primary size-3 rounded-sm border-2" />
              {t('meetings.create.yourSelectedTime')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-destructive/20 border-destructive size-3 rounded-sm border-2" />
              {t('meetings.create.slotConflict')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-muted border-muted-foreground/35 size-3 rounded-sm border" />
              {t('meetings.create.slotPassed')}
            </span>
          </div>
        </div>

        {scheduleQuery.isError ? (
          <div className="border-warning/30 bg-warning/5 flex items-start gap-2 rounded-lg border p-3 text-xs">
            <AlertTriangle aria-hidden="true" className="text-warning mt-0.5 size-4 shrink-0" />
            <span>{t('meetings.create.timelineLoadError')}</span>
          </div>
        ) : null}
      </div>

      <div
        ref={timeFocusRef}
        tabIndex={-1}
        className={cn(
          'space-y-3 rounded-xl outline-none',
          validationErrors.time &&
            'ring-destructive/20 ring-offset-background ring-2 ring-offset-2',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t('meetings.create.chooseTime')}</p>
            <p className="text-muted-foreground text-xs">
              {roomId
                ? t('meetings.create.chooseTimeHint', {
                    duration: formatMeetingDuration(activeDuration, t),
                  })
                : t('meetings.create.chooseRoomToSeeAvailability')}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                {t('meetings.create.slotViewLabel')}
              </span>
              <div
                role="group"
                aria-label={t('meetings.create.slotViewLabel')}
                className="bg-background inline-flex rounded-lg border p-1 shadow-xs"
              >
                {SLOT_VIEW_OPTIONS.map((option) => {
                  const selected = slotViewMinutes === option
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled || updatePreferences.isPending}
                      onClick={() => void changeSlotViewMinutes(option)}
                      className={cn(
                        'min-w-12 rounded-md px-2.5 py-1.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                        selected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {t(`meetings.create.slotView${option}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={disabled || effectiveWindowStartSlot === 0}
                aria-label={t('meetings.create.earlierTimes')}
                onClick={() =>
                  setWindowStartSlot((current) => Math.max(0, current - WINDOW_STEP_OPTIONS))
                }
              >
                <PreviousIcon aria-hidden="true" className="size-4" />
              </Button>
              <span
                dir="ltr"
                className="text-muted-foreground min-w-28 text-center text-xs tabular-nums"
              >
                {formatClockTime(firstVisibleTime, locale, timeFormat)}–
                {formatClockTime(lastVisibleStart, locale, timeFormat)}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={disabled || effectiveWindowStartSlot >= maxWindowStartSlot}
                aria-label={t('meetings.create.laterTimes')}
                onClick={() =>
                  setWindowStartSlot((current) =>
                    Math.min(maxWindowStartSlot, current + WINDOW_STEP_OPTIONS),
                  )
                }
              >
                <NextIcon aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <div
          dir={rtl ? 'rtl' : 'ltr'}
          className="grid [scrollbar-width:thin] auto-cols-[minmax(9.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2"
        >
          {visibleOptions.map((option) => {
            const canFitDuration = option.end <= DAY_MINUTES
            const isPast = date ? hasStartTimePassed(date, option.start, nowUtcMs) : false
            const busyEntry =
              roomId && canFitDuration ? busyEntryForRange(option.start, option.end) : null
            const supplementalBusy =
              Boolean(roomId) && canFitDuration && hasSupplementalBusyRange(option.start, option.end)
            const isBusy = busyEntry !== null || supplementalBusy
            const selected = Boolean(
              timeSelected && roomId && option.start === selectedStartMinutes && option.end === selectedEndMinutes,
            )
            const conflict = selected && isBusy
            const optionStart = minutesToTime(option.start)
            const optionEnd = canFitDuration ? minutesToTime(option.end) : null
            const slotDisabled = Boolean(
              disabled ||
                !date ||
                isPast ||
                !canFitDuration ||
                (roomId && isBusy && !allowBusySelection),
            )
            const stateText = isPast
              ? t('meetings.create.slotPassed')
              : !canFitDuration
                ? t('meetings.create.timeDoesNotFit')
                : !roomId
                  ? t('meetings.create.slotNeedsRoom')
                  : conflict
                    ? t('meetings.create.slotConflict')
                    : selected
                      ? t('meetings.create.slotSelected')
                      : isBusy
                        ? t('meetings.create.slotBusy')
                        : t('meetings.create.slotAvailable')

            return (
              <button
                key={option.index}
                type="button"
                disabled={slotDisabled}
                aria-pressed={selected}
                aria-label={`${formatClockTime(optionStart, locale, timeFormat)}. ${stateText}`}
                onClick={() => chooseTime(option.start, option.end, isBusy)}
                className={cn(
                  'focus-visible:ring-ring min-h-24 rounded-xl border p-3 text-start transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed',
                  isPast
                    ? 'bg-muted/60 text-muted-foreground border-muted opacity-55'
                    : conflict
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : selected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : !roomId && canFitDuration
                          ? 'bg-muted/20 hover:border-primary/45 hover:bg-primary/5 border-dashed'
                          : isBusy
                            ? allowBusySelection
                              ? 'border-warning/40 bg-warning/5 hover:bg-warning/10'
                              : 'bg-muted text-muted-foreground opacity-65'
                            : canFitDuration
                              ? 'bg-background hover:border-primary/45 hover:bg-primary/5'
                              : 'bg-muted text-muted-foreground opacity-45',
                )}
              >
                <span className="block text-sm font-semibold tabular-nums">
                  {formatClockTime(optionStart, locale, timeFormat)}
                </span>
                <span
                  className={cn(
                    'mt-0.5 block text-[11px]',
                    selected && !conflict && !isPast
                      ? 'text-primary-foreground/80'
                      : 'text-muted-foreground',
                  )}
                >
                  {optionEnd ? `→ ${formatClockTime(optionEnd, locale, timeFormat)}` : '—'}
                </span>
                <span
                  dir={rtl ? 'rtl' : 'ltr'}
                  className={cn(
                    'mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    isPast
                      ? 'bg-muted text-muted-foreground'
                      : selected && !conflict
                        ? 'bg-primary-foreground/15 text-primary-foreground'
                        : !roomId
                          ? 'bg-muted text-muted-foreground'
                          : conflict || isBusy
                            ? 'bg-warning/15 text-warning-foreground'
                            : 'bg-success/10 text-success',
                  )}
                >
                  {stateText}
                </span>
              </button>
            )
          })}
        </div>

        <div className="bg-background rounded-xl border p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {directTimeRangeSelection
                ? t('meetings.series.redesign.timeRangeTitle')
                : t('meetings.create.customStartTime')}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {directTimeRangeSelection
                ? t('meetings.series.redesign.timeRangeHint')
                : t('meetings.create.customStartTimeHint')}
            </p>
          </div>

          <div
            className={cn(
              'mt-3 grid gap-3',
              directTimeRangeSelection ? 'sm:grid-cols-2' : 'sm:grid-cols-[minmax(0,1fr)_14rem]',
            )}
          >
            <div className={cn(!directTimeRangeSelection && 'sm:col-start-2')}>
              {directTimeRangeSelection ? (
                <label className="mb-1.5 block text-xs font-medium">
                  {t('meetings.fields.startTime')}
                </label>
              ) : null}
              <Select
                value={timeSelected ? startTime : ''}
                disabled={disabled || !date}
                onValueChange={(value) => {
                  const nextStart = timeToMinutes(value)
                  const nextEnd = directTimeRangeSelection
                    ? Math.max(nextStart + SELECTION_STEP_MINUTES, timeToMinutes(endTime))
                    : nextStart + activeDuration
                  const boundedEnd = Math.min(DAY_MINUTES - SELECTION_STEP_MINUTES, nextEnd)
                  const busy =
                    roomId && boundedEnd <= DAY_MINUTES
                      ? busyEntryForRange(nextStart, boundedEnd) !== null ||
                        hasSupplementalBusyRange(nextStart, boundedEnd)
                      : false
                  const accepted = chooseTime(nextStart, boundedEnd, busy)
                  if (accepted) {
                    void changeSlotViewMinutes(preferredSlotViewForStartMinutes(nextStart))
                  }
                }}
              >
                <SelectTrigger aria-label={t('meetings.fields.startTime')}>
                  <SelectValue placeholder={t('meetings.fields.startTime')} />
                </SelectTrigger>
                <SelectContent>
                  {customTimeOptions.map((optionStart) => {
                    const optionEnd = directTimeRangeSelection
                      ? Math.max(optionStart + SELECTION_STEP_MINUTES, timeToMinutes(endTime))
                      : optionStart + activeDuration
                    const canFitDuration = optionEnd <= DAY_MINUTES
                    const isPast = date ? hasStartTimePassed(date, optionStart, nowUtcMs) : false
                    const isBusy =
                      roomId && canFitDuration
                        ? busyEntryForRange(optionStart, optionEnd) !== null ||
                          hasSupplementalBusyRange(optionStart, optionEnd)
                        : false
                    const optionDisabled =
                      !date ||
                      isPast ||
                      !canFitDuration ||
                      Boolean(roomId && isBusy && !allowBusySelection)
                    const stateText = isPast
                      ? t('meetings.create.slotPassed')
                      : !canFitDuration
                        ? t('meetings.create.timeDoesNotFit')
                        : isBusy
                          ? t('meetings.create.slotBusy')
                          : null

                    return (
                      <SelectItem
                        key={optionStart}
                        value={minutesToTime(optionStart)}
                        disabled={optionDisabled}
                      >
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="font-medium tabular-nums">
                            {formatClockTime(minutesToTime(optionStart), locale, timeFormat)}
                          </span>
                          {stateText ? (
                            <span className="text-muted-foreground text-[11px]">
                              {stateText}
                            </span>
                          ) : null}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {directTimeRangeSelection ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  {t('meetings.fields.endTime')}
                </label>
                <Select
                  value={timeSelected ? endTime : ''}
                  disabled={disabled || !date}
                  onValueChange={(value) => {
                    const nextEnd = timeToMinutes(value)
                    if (nextEnd <= selectedStartMinutes) return
                    onValidationClear?.('time')
                    onTimeChange(startTime, value)
                  }}
                >
                  <SelectTrigger aria-label={t('meetings.fields.endTime')}>
                    <SelectValue placeholder={t('meetings.fields.endTime')} />
                  </SelectTrigger>
                  <SelectContent>
                    {customTimeOptions
                      .filter((optionEnd) => optionEnd > selectedStartMinutes)
                      .map((optionEnd) => (
                        <SelectItem key={optionEnd} value={minutesToTime(optionEnd)}>
                          <span className="font-medium tabular-nums">
                            {formatClockTime(minutesToTime(optionEnd), locale, timeFormat)}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>

        {validationErrors.time ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {validationErrors.time}
          </p>
        ) : null}

        {allowBusySelection && roomId ? (
          <p className="text-muted-foreground text-xs leading-5">
            {t('meetings.create.busyRequestHint')}
          </p>
        ) : null}

        {selectedRoom && timeSelected ? (
          <div
            className={cn(
              'rounded-xl border p-3 text-sm',
              selectedStartIsPast ||
                selectedHasKnownConflict ||
                selectedRoom.capacity < participantCount
                ? 'border-warning/40 bg-warning/5'
                : 'border-success/30 bg-success/5',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold tabular-nums">
                {formatClockTime(startTime, locale, timeFormat)} –{' '}
                {formatClockTime(endTime, locale, timeFormat)}
              </span>
              <span className="text-muted-foreground text-xs">
                {t('meetings.create.capacitySummary', {
                  participants: participantCount,
                  capacity: selectedRoom.capacity,
                })}
              </span>
            </div>
            {selectedStartIsPast ? (
              <p className="text-warning-foreground mt-1 text-xs">
                {t('meetings.create.selectedTimePassedHint')}
              </p>
            ) : selectedHasKnownConflict ? (
              <p className="text-warning-foreground mt-1 text-xs">
                {t('meetings.create.knownConflictHint')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}



