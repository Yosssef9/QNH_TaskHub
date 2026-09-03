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
  Minus,
  Plus,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import type { CSSProperties } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonStyles } from '@/components/ui/button.styles'
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'
import { formatClockTime, formatRiyadhDateInput, formatTime, riyadhLocalDateTimeToUtcIso } from '@/lib/date-time'
import { getMeetingRoomAccent } from '@/features/meetings/meeting-room-colors'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'

import { MeetingAgendaDisplay } from './MeetingAgendaDisplay'
import { useMeetingDetail, useMeetingSchedule } from '../hooks/use-meetings'
import type { MeetingRoom, MeetingScheduleEntry } from '../types/meeting.types'

const SLOT_MINUTES = 30
const VISIBLE_OPTION_COUNT = 6
const WINDOW_STEP_SLOTS = 4
const DURATION_PRESETS = [30, 60, 90, 120] as const
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
  canSchedule: boolean
  isChecking: boolean
  hasScheduleLoadError: boolean
}

interface MeetingSchedulePickerProps {
  date: string
  roomId: number | null
  rooms: MeetingRoom[]
  participantCount: number
  startTime: string
  endTime: string
  disabled?: boolean
  allowBusySelection?: boolean
  excludeMeetingId?: number | null
  heading?: string
  description?: string
  focused?: boolean
  validationErrors?: MeetingScheduleValidationErrors
  focusField?: MeetingScheduleFocusField
  focusRequestId?: number
  onFocusToggle?: () => void
  onValidationClear?: (field: keyof MeetingScheduleValidationErrors) => void
  onSelectionStateChange?: (state: MeetingScheduleSelectionState) => void
  onDateChange: (date: string) => void
  onRoomChange: (roomId: number | null) => void
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
  return Math.max(SLOT_MINUTES, timeToMinutes(endTime) - timeToMinutes(startTime))
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB
}

function entryMinutes(entry: MeetingScheduleEntry, date: string): { start: number; end: number } | null {
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

function formatDateLabel(date: string, locale: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    ...options,
  }).format(dateOnlyToUtcDate(date))
}

function formatDuration(minutes: number, t: TFunction): string {
  if (minutes < 60) return t('meetings.create.durationMinutes', { count: minutes })
  if (minutes % 60 === 0) return t('meetings.create.durationHours', { count: minutes / 60 })
  return t('meetings.create.durationHoursMinutes', {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  })
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
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 overflow-hidden px-1 text-[10px] font-bold uppercase tracking-wide">
          <span>{t('meetings.create.slotBusy')}</span>
          {inspectable ? <Eye aria-hidden="true" className="size-3 shrink-0" /> : null}
        </span>
      ) : null}
      <span
        role="tooltip"
        className="bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-[calc(100%+0.55rem)] left-1/2 z-40 hidden w-max max-w-64 -translate-x-1/2 overflow-hidden rounded-xl border text-start text-[11px] normal-case tracking-normal shadow-xl group-hover:block group-focus-visible:block"
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
                <span className="truncate">{t('meetings.organizedBy', { name: entry.organizer.userName })}</span>
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
        className="w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-border/80 p-0 shadow-2xl"
        style={{ '--meeting-preview-accent': accent } as CSSProperties}
      >
        <div className="relative overflow-hidden">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 start-0 w-1.5"
            style={{ backgroundColor: accent }}
          />

          <header className="border-b border-border/70 bg-muted/20 px-5 pb-4 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.12em]">
                  {t('meetings.create.busyMeetingDetails')}
                </p>
                <h3 className="mt-1.5 line-clamp-2 text-lg font-bold leading-6 tracking-tight">
                  {entry.title}
                </h3>
              </div>
              {meeting ? (
                <Badge variant={statusVariant} className="shrink-0 gap-1.5 border border-border/60 px-2.5 py-1">
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
                className="rounded-xl border bg-muted/20 p-3"
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
                <div className="rounded-xl border bg-background p-3 shadow-xs">
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

                <div className="rounded-xl border bg-background p-3 shadow-xs">
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
                              className="bg-muted text-foreground grid size-6 place-items-center rounded-full border-2 border-background text-[9px] font-bold"
                            >
                              {personInitials(name)}
                            </span>
                          ))}
                          {extraPeople > 0 ? (
                            <span className="bg-primary/10 text-primary grid size-6 place-items-center rounded-full border-2 border-background text-[9px] font-bold">
                              +{extraPeople}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <section className="rounded-xl border bg-muted/15 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <FileText aria-hidden="true" className="text-primary size-4" />
                  <span>{t('meetings.fields.descriptionPurpose')}</span>
                </div>
                <p
                  className={cn(
                    'mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6',
                    !meeting.description && 'text-muted-foreground italic',
                  )}
                >
                  {meeting.description || t('meetings.workspace.noDescription')}
                </p>
              </section>

              <MeetingAgendaDisplay
                items={detailQuery.data?.agendaItems ?? []}
                variant="compact"
              />
            </div>
          )}

          {meeting ? (
            <footer className="border-t border-border/70 bg-muted/15 px-4 py-3 ps-5">
              <a
                href={`/meetings/${entry.meetingId}`}
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
  disabled = false,
  allowBusySelection = false,
  excludeMeetingId = null,
  heading,
  description,
  focused = false,
  validationErrors = {},
  focusField = null,
  focusRequestId = 0,
  onFocusToggle,
  onValidationClear,
  onSelectionStateChange,
  onDateChange,
  onRoomChange,
  onTimeChange,
}: MeetingSchedulePickerProps) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-SA'
  const rtl = i18n.dir() === 'rtl'
  const PreviousIcon = rtl ? ChevronRight : ChevronLeft
  const NextIcon = rtl ? ChevronLeft : ChevronRight

  const selectedDuration = durationBetween(startTime, endTime)
  const isPresetDuration = DURATION_PRESETS.includes(
    selectedDuration as (typeof DURATION_PRESETS)[number],
  )
  const [customDuration, setCustomDuration] = useState(
    isPresetDuration ? 60 : selectedDuration,
  )
  const [useCustomDuration, setUseCustomDuration] = useState(!isPresetDuration)
  const [roomPromptedByTime, setRoomPromptedByTime] = useState(false)
  const durationChangeSource = useRef<'PRESET' | 'CUSTOM' | null>(null)
  const selectedStartMinutes = timeToMinutes(startTime)
  const selectedEndMinutes = timeToMinutes(endTime)
  const selectedSlotIndex = Math.floor(selectedStartMinutes / SLOT_MINUTES)
  const [windowStartSlot, setWindowStartSlot] = useState(() =>
    Math.max(0, Math.min(48 - VISIBLE_OPTION_COUNT, selectedSlotIndex - 2)),
  )
  const dateFocusRef = useRef<HTMLButtonElement | null>(null)
  const roomFocusRef = useRef<HTMLButtonElement | null>(null)
  const durationFocusRef = useRef<HTMLButtonElement | null>(null)
  const timeFocusRef = useRef<HTMLDivElement | null>(null)

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
    const nextStart = Math.max(
      0,
      Math.min(48 - VISIBLE_OPTION_COUNT, selectedSlotIndex - 2),
    )
    setWindowStartSlot(nextStart)
  }, [date, roomId, selectedSlotIndex])

  useEffect(() => {
    const source = durationChangeSource.current
    durationChangeSource.current = null
    setCustomDuration(selectedDuration)
    if (source === 'CUSTOM') {
      setUseCustomDuration(true)
      return
    }
    if (source === 'PRESET') {
      setUseCustomDuration(false)
      return
    }
    setUseCustomDuration(
      !DURATION_PRESETS.includes(selectedDuration as (typeof DURATION_PRESETS)[number]),
    )
  }, [selectedDuration])

  const scheduleInput = useMemo(() => {
    if (!date || !roomId) return null
    return {
      fromAtUtc: riyadhLocalDateTimeToUtcIso(date, '00:00'),
      toAtUtc: riyadhLocalDateTimeToUtcIso(shiftDateOnly(date, 1), '00:00'),
      roomId,
    }
  }, [date, roomId])
  const scheduleQuery = useMeetingSchedule(scheduleInput)

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
        .map((entry) => ({ entry, range: entryMinutes(entry, date) }))
        .filter(
          (item): item is { entry: MeetingScheduleEntry; range: { start: number; end: number } } =>
            item.range !== null,
        ),
    [date, excludeMeetingId, scheduleQuery.data],
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
    () => Array.from({ length: 7 }, (_, index) => shiftDateOnly(date, index - 3)),
    [date],
  )
  const today = formatRiyadhDateInput(new Date())
  const activeDuration = useCustomDuration ? customDuration : selectedDuration

  const visibleOptions = Array.from({ length: VISIBLE_OPTION_COUNT }, (_, offset) => {
    const index = windowStartSlot + offset
    const start = index * SLOT_MINUTES
    return {
      index,
      start,
      end: start + activeDuration,
    }
  })

  function applyDuration(minutes: number) {
    const startMinutes = timeToMinutes(startTime)
    const maxDuration = Math.max(SLOT_MINUTES, 1440 - startMinutes)
    const nextDuration = Math.max(SLOT_MINUTES, Math.min(minutes, maxDuration))
    durationChangeSource.current = 'PRESET'
    setUseCustomDuration(false)
    onValidationClear?.('duration')
    onValidationClear?.('time')
    onTimeChange(startTime, minutesToTime(startMinutes + nextDuration))
  }

  function enableCustomDuration() {
    setCustomDuration(selectedDuration)
    setUseCustomDuration(true)
  }

  function adjustCustomDuration(delta: number) {
    const startMinutes = timeToMinutes(startTime)
    const maxDuration = Math.max(SLOT_MINUTES, 1440 - startMinutes)
    const next = Math.max(
      SLOT_MINUTES,
      Math.min(customDuration + delta, maxDuration),
    )
    durationChangeSource.current = 'CUSTOM'
    setCustomDuration(next)
    setUseCustomDuration(true)
    onValidationClear?.('duration')
    onValidationClear?.('time')
    onTimeChange(startTime, minutesToTime(startMinutes + next))
  }

  function chooseTime(optionStart: number, optionEnd: number, isBusy: boolean) {
    if (optionEnd > 1440) return

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
      return
    }

    if (isBusy && !allowBusySelection) return
    onValidationClear?.('time')
    onTimeChange(minutesToTime(optionStart), minutesToTime(optionEnd))
  }

  function busyEntryForRange(rangeStart: number, rangeEnd: number): MeetingScheduleEntry | null {
    return (
      scheduleRanges.find(({ range }) => overlaps(rangeStart, rangeEnd, range.start, range.end))
        ?.entry ?? null
    )
  }

  const selectedHasKnownConflict = scheduleRanges.some(({ range }) =>
    overlaps(selectedStartMinutes, selectedEndMinutes, range.start, range.end),
  )
  const selectedRoomHasCapacity =
    selectedRoom !== null && selectedRoom.capacity >= participantCount
  const selectionCanSchedule =
    selectedRoom !== null &&
    selectedRoomHasCapacity &&
    !selectedHasKnownConflict &&
    !scheduleQuery.isFetching &&
    !scheduleQuery.isError

  useEffect(() => {
    onSelectionStateChange?.({
      selectedRoom,
      hasCapacity: selectedRoomHasCapacity,
      hasKnownConflict: selectedHasKnownConflict,
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
    selectionCanSchedule,
  ])

  const firstVisibleTime = minutesToTime(windowStartSlot * SLOT_MINUTES)
  const lastVisibleStart = minutesToTime(
    Math.min(1439, (windowStartSlot + VISIBLE_OPTION_COUNT - 1) * SLOT_MINUTES),
  )

  return (
    <section className="bg-muted/20 flex min-h-full flex-col gap-6 p-5 sm:p-6 xl:p-7">
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
            onClick={onFocusToggle}
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
              {formatDateLabel(date, locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('meetings.create.previousWeek')}
              disabled={disabled || shiftDateOnly(date, -7) < today}
              onClick={() => {
                onValidationClear?.('date')
                onValidationClear?.('time')
                onDateChange(shiftDateOnly(date, -7))
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
                onDateChange(shiftDateOnly(date, 7))
              }}
            >
              <NextIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid auto-cols-[minmax(5.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
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
                  'focus-visible:ring-ring min-h-16 rounded-xl border px-2 py-2 text-center outline-none transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40',
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
          <p role="alert" className="text-destructive text-xs font-medium">{validationErrors.date}</p>
        ) : null}
      </div>

      <div
        className={cn(
          'space-y-3 rounded-xl transition-[background-color,box-shadow] duration-300',
          roomPromptedByTime && !roomId &&
            'bg-destructive/5 ring-2 ring-destructive/20 ring-offset-4 ring-offset-muted/20',
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
          <div className="grid auto-cols-[minmax(11.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
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
                    'focus-visible:ring-ring min-h-28 rounded-xl border p-3 text-start outline-none transition focus-visible:ring-2',
                    selected
                      ? 'border-primary bg-primary/10 ring-primary/15 ring-1'
                      : 'bg-background hover:border-primary/40 hover:bg-accent/40',
                    !fits && !selected && 'border-warning/35 bg-warning/5',
                    roomPromptedByTime && !roomId && room === orderedRooms[0] &&
                      'border-destructive/60 bg-destructive/5 ring-2 ring-destructive/20',
                    (validationErrors.room || validationErrors.capacity) && selected && 'border-destructive ring-destructive/20 ring-2',
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
          <p role="alert" className="text-destructive text-xs font-medium">{validationErrors.room}</p>
        ) : null}
        {validationErrors.capacity ? (
          <p role="alert" className="text-destructive text-xs font-medium">{validationErrors.capacity}</p>
        ) : null}
      </div>

      <div className={cn('space-y-3 rounded-xl border bg-background p-4', validationErrors.duration && 'border-destructive')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Clock3 aria-hidden="true" className="text-primary mt-0.5 size-4" />
            <div>
              <p className="text-sm font-semibold">{t('meetings.create.howLong')}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {t('meetings.create.howLongHint')}
              </p>
            </div>
          </div>
          <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-semibold">
            {formatDuration(selectedDuration, t)}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((minutes) => (
            <Button
              key={minutes}
              ref={!useCustomDuration && selectedDuration === minutes ? durationFocusRef : undefined}
              size="sm"
              variant={!useCustomDuration && selectedDuration === minutes ? 'default' : 'outline'}
              disabled={disabled}
              onClick={() => applyDuration(minutes)}
            >
              {formatDuration(minutes, t)}
            </Button>
          ))}
          <Button
            ref={useCustomDuration ? durationFocusRef : undefined}
            size="sm"
            variant={useCustomDuration ? 'default' : 'outline'}
            disabled={disabled}
            onClick={enableCustomDuration}
          >
            {t('meetings.create.customDuration')}
          </Button>
        </div>

        {useCustomDuration ? (
          <div className="bg-muted/30 flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('meetings.create.decreaseDuration')}
              disabled={disabled || customDuration <= SLOT_MINUTES}
              onClick={() => adjustCustomDuration(-SLOT_MINUTES)}
            >
              <Minus aria-hidden="true" className="size-4" />
            </Button>
            <div className="min-w-32 text-center">
              <p className="font-semibold">{formatDuration(customDuration, t)}</p>
              <p className="text-muted-foreground text-[11px]">
                {t('meetings.create.adjustDurationHint')}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('meetings.create.increaseDuration')}
              disabled={disabled || selectedStartMinutes + customDuration + SLOT_MINUTES > 1440}
              onClick={() => adjustCustomDuration(SLOT_MINUTES)}
            >
              <Plus aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ) : null}
        {validationErrors.duration ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {validationErrors.duration}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{t('meetings.create.roomDayOverview')}</p>
              {scheduleQuery.isFetching ? (
                <Loader2 aria-hidden="true" className="text-muted-foreground size-3.5 animate-spin" />
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              {roomId
                ? t('meetings.create.roomDayOverviewHint')
                : t('meetings.create.chooseRoomToSeeAvailability')}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-3" dir={rtl ? 'rtl' : 'ltr'}>
          <div className="relative h-14 rounded-lg border bg-muted/20">
            {roomId
              ? scheduleRanges.map(({ entry, range }, index) => {
                  const left = rtl
                    ? ((1440 - range.end) / 1440) * 100
                    : (range.start / 1440) * 100
                  const width = Math.max(0.9, ((range.end - range.start) / 1440) * 100)
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
            {roomId ? (
              <span
                title={`${formatClockTime(startTime, locale, timeFormat)} – ${formatClockTime(endTime, locale, timeFormat)}`}
                className={cn(
                  'absolute inset-y-1 z-20 rounded-md border-2',
                  selectedHasKnownConflict
                    ? 'border-destructive bg-destructive/20 shadow-sm'
                    : 'border-primary bg-primary/20 shadow-sm',
                )}
                style={{
                  left: `${
                    rtl
                      ? ((1440 - selectedEndMinutes) / 1440) * 100
                      : (selectedStartMinutes / 1440) * 100
                  }%`,
                  width: `${Math.max(1, ((selectedEndMinutes - selectedStartMinutes) / 1440) * 100)}%`,
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
                style={{ backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--warning) 40%, transparent) 0 3px, transparent 3px 6px)' }}
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
          validationErrors.time && 'ring-2 ring-destructive/20 ring-offset-2 ring-offset-background',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t('meetings.create.chooseTime')}</p>
            <p className="text-muted-foreground text-xs">
              {roomId
                ? t('meetings.create.chooseTimeHint', { duration: formatDuration(activeDuration, t) })
                : t('meetings.create.chooseRoomToSeeAvailability')}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={disabled || windowStartSlot === 0}
              aria-label={t('meetings.create.earlierTimes')}
              onClick={() =>
                setWindowStartSlot((current) => Math.max(0, current - WINDOW_STEP_SLOTS))
              }
            >
              <PreviousIcon aria-hidden="true" className="size-4" />
            </Button>
            <span
              dir="ltr"
              className="text-muted-foreground min-w-28 text-center text-xs tabular-nums"
            >
              {formatClockTime(firstVisibleTime, locale, timeFormat)}–{formatClockTime(lastVisibleStart, locale, timeFormat)}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={disabled || windowStartSlot >= 48 - VISIBLE_OPTION_COUNT}
              aria-label={t('meetings.create.laterTimes')}
              onClick={() =>
                setWindowStartSlot((current) =>
                  Math.min(48 - VISIBLE_OPTION_COUNT, current + WINDOW_STEP_SLOTS),
                )
              }
            >
              <NextIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>

        <div
          dir={rtl ? 'rtl' : 'ltr'}
          className="grid auto-cols-[minmax(9.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]"
        >
          {visibleOptions.map((option) => {
            const canFitDuration = option.end <= 1440
            const busyEntry = roomId && canFitDuration
              ? busyEntryForRange(option.start, option.end)
              : null
            const isBusy = busyEntry !== null
            const selected = Boolean(
              roomId && option.start === selectedStartMinutes && option.end === selectedEndMinutes,
            )
            const conflict = selected && isBusy
            const optionStart = minutesToTime(option.start)
            const optionEnd = canFitDuration ? minutesToTime(option.end) : null
            const slotDisabled = Boolean(
              disabled || !canFitDuration || (roomId && isBusy && !allowBusySelection),
            )
            const stateText = !canFitDuration
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
                  'focus-visible:ring-ring min-h-24 rounded-xl border p-3 text-start outline-none transition focus-visible:ring-2 disabled:cursor-not-allowed',
                  conflict
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : selected
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : !roomId && canFitDuration
                        ? 'border-dashed bg-muted/20 hover:border-primary/45 hover:bg-primary/5'
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
                    selected && !conflict ? 'text-primary-foreground/80' : 'text-muted-foreground',
                  )}
                >
                  {optionEnd ? `→ ${formatClockTime(optionEnd, locale, timeFormat)}` : '—'}
                </span>
                <span
                  dir={rtl ? 'rtl' : 'ltr'}
                  className={cn(
                    'mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    selected && !conflict
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

        {validationErrors.time ? (
          <p role="alert" className="text-destructive text-xs font-medium">{validationErrors.time}</p>
        ) : null}

        {allowBusySelection && roomId ? (
          <p className="text-muted-foreground text-xs leading-5">
            {t('meetings.create.busyRequestHint')}
          </p>
        ) : null}

        {selectedRoom ? (
          <div
            className={cn(
              'rounded-xl border p-3 text-sm',
              selectedHasKnownConflict || selectedRoom.capacity < participantCount
                ? 'border-warning/40 bg-warning/5'
                : 'border-success/30 bg-success/5',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold tabular-nums">
                {formatClockTime(startTime, locale, timeFormat)} – {formatClockTime(endTime, locale, timeFormat)}
              </span>
              <span className="text-muted-foreground text-xs">
                {t('meetings.create.capacitySummary', {
                  participants: participantCount,
                  capacity: selectedRoom.capacity,
                })}
              </span>
            </div>
            {selectedHasKnownConflict ? (
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



