import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarPlus2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  DoorOpen,
  Grid3X3,
  List,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useBeforeUnload, useBlocker, useNavigate, useSearchParams } from 'react-router'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { DatePicker } from '@/components/shared/DatePicker'
import { InputField, TextareaField } from '@/components/shared/Input'
import {
  SearchableMultiSelect,
  type SearchableSelectOption,
} from '@/components/shared/SearchableMultiSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import type { TimeFormatPreference } from '@/features/auth/types/auth.types'
import { cn } from '@/lib/cn'
import { toApiClientError } from '@/lib/api-error'
import { formatClockTime, formatRiyadhDateInput } from '@/lib/date-time'

import { MeetingAgendaEditor, type MeetingAgendaDraftItem } from '../components/MeetingAgendaEditor'
import { MeetingParticipantPicker } from '../components/MeetingParticipantPicker'
import { MeetingTimeRangePicker } from '../components/MeetingTimeRangePicker'
import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import { useMeetingParticipants, useMeetingTemplates } from '../hooks/use-meetings'
import type { MeetingParticipant, MeetingTemplate } from '../types/meeting.types'
import { MeetingSeriesCustomDateCalendar } from './MeetingSeriesCustomDateCalendar'
import { MeetingSeriesOccurrenceCalendar } from './MeetingSeriesOccurrenceCalendar'
import { MeetingSeriesFilePicker, type MeetingSeriesDraftFile } from './MeetingSeriesFilePicker'
import {
  MeetingSeriesAddOccurrenceDialog,
  MeetingSeriesOccurrenceEditor,
  type MeetingSeriesOccurrenceDetailValues,
  type MeetingSeriesOccurrenceScheduleValues,
} from './MeetingSeriesOccurrenceEditor'
import {
  MeetingSeriesBulkScheduleWorkspace,
  type MeetingSeriesBulkScheduleValues,
} from './MeetingSeriesBulkScheduleWorkspace'
import {
  MEETING_SERIES_MAX_OCCURRENCES,
  MEETING_SERIES_TIME_ZONE,
  MEETING_SERIES_WEEKDAYS,
  type MeetingSeriesDefaultsInput,
  type MeetingSeriesException,
  type MeetingSeriesPattern,
  type MeetingSeriesPreviewInput,
  type MeetingSeriesPreview,
  type MeetingSeriesPreviewOccurrence,
  type MeetingSeriesRemoveException,
  type MeetingSeriesScheduleInput,
  type MeetingSeriesWeekday,
} from './meeting-series.types'
import { useCreateMeetingSeries, useMeetingSeriesDetail, useMeetingSeriesPreview, useUploadMeetingSeriesAttachment } from './use-meeting-series'

const STEP_COUNT = 3
const QUARTER_HOUR_MINUTES = 15

type ComposerStep = 1 | 2 | 3
type PatternType = MeetingSeriesPattern['type']
type OccurrenceView = 'LIST' | 'CALENDAR'

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
}

function participantOption(participant: MeetingParticipant): SearchableSelectOption {
  return {
    value: participant.userId,
    label: participant.userName,
    description: participant.userCode,
  }
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysBetween(start: string, end: string): number {
  const startDate = new Date(`${start}T12:00:00Z`).getTime()
  const endDate = new Date(`${end}T12:00:00Z`).getTime()
  return Math.round((endDate - startDate) / 86_400_000)
}

function addMinutes(time: string, minutes: number): string {
  const [hours, currentMinutes] = time.split(':').map(Number)
  const total = (hours || 0) * 60 + (currentMinutes || 0) + minutes
  const bounded = Math.max(0, Math.min(23 * 60 + 45, total))
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`
}

function timeDurationMinutes(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  const start = (startHour || 0) * 60 + (startMinute || 0)
  const end = (endHour || 0) * 60 + (endMinute || 0)
  return Math.max(QUARTER_HOUR_MINUTES, end - start)
}

function validQuarterHourTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return false
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour >= 0 && hour <= 23 && minute >= 0 && minute < 60 && minute % QUARTER_HOUR_MINUTES === 0
}

function defaultWeekday(date: string): MeetingSeriesWeekday {
  const [year, month, day] = date.split('-').map(Number)
  const index = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12)).getUTCDay()
  return MEETING_SERIES_WEEKDAYS[index] ?? 'MONDAY'
}

function formatLocalDate(value: string, locale: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12)))
}

function addedClientIdFromKey(key: string): string | null {
  return key.startsWith('A:') ? key.slice(2) : null
}

function scheduleOverrideFields(
  occurrence: MeetingSeriesPreviewOccurrence,
  values: MeetingSeriesOccurrenceScheduleValues,
  defaultRoomId: number,
): Omit<Extract<MeetingSeriesException, { action: 'OVERRIDE' }>, 'action' | 'occurrenceKey'> {
  const result: Omit<Extract<MeetingSeriesException, { action: 'OVERRIDE' }>, 'action' | 'occurrenceKey'> = {}
  if (values.date !== occurrence.originalDate) result.date = values.date
  if (values.startTime !== occurrence.originalStartTime) result.startTime = values.startTime
  if (values.endTime !== occurrence.originalEndTime) result.endTime = values.endTime
  if (values.roomId !== defaultRoomId) result.roomId = values.roomId
  return result
}


function equalNumberArrays(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false
  const rightValues = new Set(right)
  return left.every((value) => rightValues.has(value))
}

function equalAgendaItems(
  left: readonly MeetingSeriesDefaultsInput['agendaItems'][number][],
  right: readonly MeetingSeriesDefaultsInput['agendaItems'][number][],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function detailOverrideFields(
  values: MeetingSeriesOccurrenceDetailValues,
  defaults: MeetingSeriesDefaultsInput,
): Pick<
  Extract<MeetingSeriesException, { action: 'OVERRIDE' }>,
  'title' | 'description' | 'organizerAttending' | 'attendeeUserIds' | 'agendaItems'
> {
  const result: Pick<
    Extract<MeetingSeriesException, { action: 'OVERRIDE' }>,
    'title' | 'description' | 'organizerAttending' | 'attendeeUserIds' | 'agendaItems'
  > = {}
  if (values.title !== defaults.title) result.title = values.title
  if (values.description !== defaults.description) result.description = values.description
  if (values.organizerAttending !== defaults.organizerAttending) {
    result.organizerAttending = values.organizerAttending
  }
  if (!equalNumberArrays(values.attendeeUserIds, defaults.attendeeUserIds)) {
    result.attendeeUserIds = values.attendeeUserIds
  }
  if (!equalAgendaItems(values.agendaItems, defaults.agendaItems)) result.agendaItems = values.agendaItems
  return result
}

function stripScheduleOverrideFields(
  item: Extract<MeetingSeriesException, { action: 'OVERRIDE' }>,
): Extract<MeetingSeriesException, { action: 'OVERRIDE' }> {
  const {
    date: _date,
    startTime: _startTime,
    endTime: _endTime,
    roomId: _roomId,
    ...rest
  } = item
  return rest
}

function stripDetailOverrideFields(
  item: Extract<MeetingSeriesException, { action: 'OVERRIDE' }>,
): Extract<MeetingSeriesException, { action: 'OVERRIDE' }>
function stripDetailOverrideFields(
  item: Extract<MeetingSeriesException, { action: 'ADD' }>,
): Extract<MeetingSeriesException, { action: 'ADD' }>
function stripDetailOverrideFields(
  item: Extract<MeetingSeriesException, { action: 'OVERRIDE' | 'ADD' }>,
): Extract<MeetingSeriesException, { action: 'OVERRIDE' | 'ADD' }> {
  const {
    title: _title,
    description: _description,
    organizerAttending: _organizerAttending,
    attendeeUserIds: _attendeeUserIds,
    agendaItems: _agendaItems,
    ...rest
  } = item
  return rest
}

function hasOverrideFields(item: Extract<MeetingSeriesException, { action: 'OVERRIDE' }>): boolean {
  return Object.keys(item).some((key) => key !== 'action' && key !== 'occurrenceKey')
}

function occurrenceStateVariant(occurrence: MeetingSeriesPreviewOccurrence) {
  if (!occurrence.validation.isValid) return 'destructive' as const
  if (occurrence.isCustomized) return 'default' as const
  return 'success' as const
}

interface MeetingDetailsStageProps {
  selectedTemplateId: number | null
  templateOptions: SearchableSelectOption[]
  templatesLoading: boolean
  title: string
  description: string
  organizerAttending: boolean
  attendeeUserIds: number[]
  participantCount: number
  participantOptions: SearchableSelectOption[]
  selectedParticipantOptions: SearchableSelectOption[]
  participantSearch: string
  participantLoading: boolean
  participantLoadingMore: boolean
  participantHasMore: boolean
  agendaItems: MeetingAgendaDraftItem[]
  commonFiles: MeetingSeriesDraftFile[]
  agendaParticipants: MeetingParticipant[]
  meetingDurationMinutes: number
  organizerUserId: number | null
  roomOptions: SearchableSelectOption[]
  roomsLoading: boolean
  roomId: number | null
  startTime: string
  endTime: string
  onTemplateChange: (value: number | null) => void
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onOrganizerAttendingChange: (value: boolean) => void
  onParticipantSearchChange: (value: string) => void
  onAttendeesChange: (values: number[]) => void
  onLoadMoreParticipants: () => void
  onAgendaChange: (items: MeetingAgendaDraftItem[]) => void
  onCommonFilesChange: (files: MeetingSeriesDraftFile[]) => void
  onRoomChange: (value: number | null) => void
  onTimeChange: (startTime: string, endTime: string) => void
}

interface RepeatStageProps {
  scheduleMode: 'PATTERN' | 'CUSTOM'
  patternType: PatternType
  interval: number
  weekdays: MeetingSeriesWeekday[]
  monthlyDay: number
  monthlyOrdinal: 1 | 2 | 3 | 4 | -1
  monthlyWeekday: MeetingSeriesWeekday
  rangeType: 'END_DATE' | 'COUNT'
  startDate: string
  endDate: string
  occurrenceCount: number
  customDates: string[]
  preview: MeetingSeriesPreview | null
  previewPending: boolean
  previewError: boolean
  previewErrorMessage: string | null
  humanSummary: string
  onScheduleModeChange: (value: 'PATTERN' | 'CUSTOM') => void
  onPatternTypeChange: (value: PatternType) => void
  onIntervalChange: (value: number) => void
  onToggleWeekday: (value: MeetingSeriesWeekday) => void
  onMonthlyDayChange: (value: number) => void
  onMonthlyOrdinalChange: (value: 1 | 2 | 3 | 4 | -1) => void
  onMonthlyWeekdayChange: (value: MeetingSeriesWeekday) => void
  onRangeTypeChange: (value: 'END_DATE' | 'COUNT') => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onOccurrenceCountChange: (value: number) => void
  onCustomDatesChange: (values: string[]) => void
}

interface PreviewStageProps {
  occurrences: MeetingSeriesPreviewOccurrence[]
  previewPending: boolean
  occurrenceView: OccurrenceView
  bulkSelectedKeys: string[]
  occurrenceFiles: Record<string, MeetingSeriesDraftFile[]>
  roomName: (id: number) => string
  locale: string
  timeFormat: TimeFormatPreference
  removedPatternExceptions: MeetingSeriesRemoveException[]
  canCreate: boolean
  onViewChange: (value: OccurrenceView) => void
  onSelectOccurrence: (value: string) => void
  onToggleBulkOccurrence: (value: string) => void
  onClearBulkSelection: () => void
  onOpenBulkSchedule: () => void
  onBulkResetSchedule: () => void
  onBulkRemove: () => void
  onRestoreRemoved: (occurrenceKey: string) => void
  onAddOccurrence: () => void
  onBack: () => void
  onSchedule: () => void
}

export function MeetingSeriesComposer() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const duplicateValue = Number(searchParams.get('duplicate'))
  const duplicateSeriesId = Number.isInteger(duplicateValue) && duplicateValue > 0 ? duplicateValue : null
  const duplicateSeries = useMeetingSeriesDetail(duplicateSeriesId)
  const currentUser = useCurrentUser()
  const rooms = useActiveMeetingRooms()
  const templates = useMeetingTemplates(true)
  const createSeries = useCreateMeetingSeries()
  const uploadSeriesAttachment = useUploadMeetingSeriesAttachment()

  const today = formatRiyadhDateInput(new Date())
  const initialStartDate = addDays(today, 1)
  const [step, setStep] = useState<ComposerStep>(1)
  const [creationRequestId] = useState(createUuid)

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [organizerAttending, setOrganizerAttending] = useState(true)
  const [attendeeUserIds, setAttendeeUserIds] = useState<number[]>([])
  const [selectedParticipantOptions, setSelectedParticipantOptions] = useState<SearchableSelectOption[]>([])
  const [participantSearch, setParticipantSearch] = useState('')
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaDraftItem[]>([])
  const [commonFiles, setCommonFiles] = useState<MeetingSeriesDraftFile[]>([])
  const [occurrenceFiles, setOccurrenceFiles] = useState<Record<string, MeetingSeriesDraftFile[]>>({})
  const [finalizing, setFinalizing] = useState(false)

  const [roomId, setRoomId] = useState<number | null>(null)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [scheduleMode, setScheduleMode] = useState<'PATTERN' | 'CUSTOM'>('PATTERN')
  const [patternType, setPatternType] = useState<PatternType>('WEEKLY')
  const [interval, setInterval] = useState(1)
  const [weekdays, setWeekdays] = useState<MeetingSeriesWeekday[]>([defaultWeekday(initialStartDate)])
  const [monthlyDay, setMonthlyDay] = useState(Number(initialStartDate.slice(-2)))
  const [monthlyOrdinal, setMonthlyOrdinal] = useState<1 | 2 | 3 | 4 | -1>(1)
  const [monthlyWeekday, setMonthlyWeekday] = useState<MeetingSeriesWeekday>(defaultWeekday(initialStartDate))
  const [rangeType, setRangeType] = useState<'END_DATE' | 'COUNT'>('END_DATE')
  const [startDate, setStartDate] = useState(initialStartDate)
  const [endDate, setEndDate] = useState(addDays(initialStartDate, 28))
  const [occurrenceCount, setOccurrenceCount] = useState(5)
  const [customDates, setCustomDates] = useState<string[]>([initialStartDate])
  const [exceptions, setExceptions] = useState<MeetingSeriesException[]>([])

  const [occurrenceView, setOccurrenceView] = useState<OccurrenceView>('LIST')
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<string | null>(null)
  const [addOccurrenceOpen, setAddOccurrenceOpen] = useState(false)
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<string[]>([])
  const [bulkScheduleOpen, setBulkScheduleOpen] = useState(false)
  const [scheduleConfirmOpen, setScheduleConfirmOpen] = useState(false)
  const [duplicateApplied, setDuplicateApplied] = useState(false)
  const bypassNavigationRef = useRef(false)

  const hasUnsavedChanges =
    duplicateApplied ||
    selectedTemplateId !== null ||
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    organizerAttending !== true ||
    attendeeUserIds.length > 0 ||
    agendaItems.length > 0 ||
    commonFiles.length > 0 ||
    Object.values(occurrenceFiles).some((files) => files.length > 0) ||
    exceptions.length > 0 ||
    step > 1

  const blocker = useBlocker(
    useCallback(() => hasUnsavedChanges && !bypassNavigationRef.current, [hasUnsavedChanges]),
  )

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!hasUnsavedChanges || bypassNavigationRef.current) return
        event.preventDefault()
        event.returnValue = ''
      },
      [hasUnsavedChanges],
    ),
  )

  useEffect(() => {
    if (duplicateApplied || !duplicateSeries.data) return
    const source = duplicateSeries.data
    setSelectedTemplateId(null)
    setTitle(source.defaults.title)
    setDescription(source.defaults.description ?? '')
    setOrganizerAttending(source.defaults.organizerAttending)
    setAttendeeUserIds([...source.defaults.attendeeUserIds])
    setSelectedParticipantOptions(source.defaultAttendees.map(participantOption))
    setAgendaItems(
      source.defaults.agendaItems.map((item) => ({
        clientId: createUuid(),
        id: null,
        topic: item.topic,
        presenterUserId: item.presenterUserId ?? null,
        plannedDurationMinutes: item.plannedDurationMinutes ?? null,
      })),
    )
    setRoomId(source.defaults.roomId)
    setStartTime(source.defaults.startTime)
    setEndTime(source.defaults.endTime)
    setExceptions([])
    setCommonFiles([])
    setOccurrenceFiles({})
    setSelectedOccurrenceKey(null)
    setBulkSelectedKeys([])

    if (source.schedule.mode === 'CUSTOM') {
      setScheduleMode('CUSTOM')
      const firstDate = source.schedule.dates[0] ?? initialStartDate
      const shiftDays = daysBetween(firstDate, initialStartDate)
      const shiftedDates = source.schedule.dates.map((date) => addDays(date, shiftDays))
      setCustomDates(shiftedDates)
    } else {
      setScheduleMode('PATTERN')
      const pattern = source.schedule.pattern
      setPatternType(pattern.type)
      setInterval(pattern.interval)
      if (pattern.type === 'WEEKLY') setWeekdays([...pattern.daysOfWeek])
      if (pattern.type === 'MONTHLY_DATE') setMonthlyDay(pattern.dayOfMonth)
      if (pattern.type === 'MONTHLY_RELATIVE') {
        setMonthlyOrdinal(pattern.ordinal)
        setMonthlyWeekday(pattern.dayOfWeek)
      }
      const range = source.schedule.range
      setStartDate(initialStartDate)
      setRangeType(range.type)
      if (range.type === 'END_DATE') {
        setEndDate(addDays(initialStartDate, Math.max(0, daysBetween(range.startDate, range.endDate))))
      } else {
        setOccurrenceCount(range.count)
      }
    }
    setStep(1)
    setDuplicateApplied(true)
  }, [duplicateApplied, duplicateSeries.data, initialStartDate])

  const participantQuery = useMeetingParticipants(participantSearch, true)
  const currentUserId = currentUser.data?.user.userId ?? null
  const participantOptions = useMemo(() => {
    const byUserId = new Map<number, MeetingParticipant>()
    for (const page of participantQuery.data?.pages ?? []) {
      for (const participant of page.items) {
        if (participant.userId !== currentUserId) byUserId.set(participant.userId, participant)
      }
    }
    return [...byUserId.values()].map(participantOption)
  }, [currentUserId, participantQuery.data?.pages])

  const selectedAttendeeOptions = useMemo(
    () => selectedParticipantOptions.filter((option) => attendeeUserIds.includes(Number(option.value))),
    [attendeeUserIds, selectedParticipantOptions],
  )

  const agendaParticipants = useMemo<MeetingParticipant[]>(() => {
    const participants: MeetingParticipant[] = []
    const user = currentUser.data?.user
    if (organizerAttending && user) {
      participants.push({ userId: user.userId, userCode: user.userCode, userName: user.userName })
    }
    for (const option of selectedAttendeeOptions) {
      participants.push({
        userId: Number(option.value),
        userCode: option.description ?? '',
        userName: option.label,
      })
    }
    return participants
  }, [currentUser.data?.user, organizerAttending, selectedAttendeeOptions])

  const participantCount = attendeeUserIds.length + (organizerAttending ? 1 : 0)
  const agendaValid = agendaItems.every((item) => item.topic.trim().length > 0)
  const detailsValid = title.trim().length > 0 && participantCount > 0 && agendaValid
  const timeValid = validQuarterHourTime(startTime) && validQuarterHourTime(endTime) && endTime > startTime

  const organizerParticipant = useMemo<MeetingParticipant | null>(() => {
    const user = currentUser.data?.user
    return user ? { userId: user.userId, userCode: user.userCode, userName: user.userName } : null
  }, [currentUser.data?.user])

  const seriesDefaults = useMemo<MeetingSeriesDefaultsInput | null>(() => {
    if (!roomId) return null
    return {
      title: title.trim(),
      description: description.trim() || null,
      organizerAttending,
      attendeeUserIds,
      agendaItems: agendaItems.map((item) => ({
        topic: item.topic.trim(),
        presenterUserId: item.presenterUserId,
        plannedDurationMinutes: item.plannedDurationMinutes,
      })),
      roomId,
      startTime,
      endTime,
    }
  }, [agendaItems, attendeeUserIds, description, endTime, organizerAttending, roomId, startTime, title])

  const templateOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (templates.data ?? []).map((template) => ({
        value: template.id,
        label: template.name,
        description: template.title,
      })),
    [templates.data],
  )

  const roomOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (rooms.data ?? []).map((room) => ({
        value: room.id,
        label: i18n.language.startsWith('ar') ? room.nameAr : room.nameEn,
        description: [room.locationText, t('meetings.capacityValue', { count: room.capacity })]
          .filter(Boolean)
          .join(' · '),
      })),
    [i18n.language, rooms.data, t],
  )

  const scheduleDefinition = useMemo<MeetingSeriesScheduleInput | null>(() => {
    if (scheduleMode === 'CUSTOM') {
      if (customDates.length === 0) return null
      return { mode: 'CUSTOM', dates: [...customDates].sort() }
    }

    if (!startDate || (rangeType === 'END_DATE' && !endDate)) return null
    if (patternType === 'WEEKLY' && weekdays.length === 0) return null

    let pattern: MeetingSeriesPattern
    if (patternType === 'DAILY') pattern = { type: 'DAILY', interval }
    else if (patternType === 'WEEKLY') pattern = { type: 'WEEKLY', interval, daysOfWeek: weekdays }
    else if (patternType === 'MONTHLY_DATE') {
      pattern = { type: 'MONTHLY_DATE', interval, dayOfMonth: monthlyDay }
    } else {
      pattern = {
        type: 'MONTHLY_RELATIVE',
        interval,
        ordinal: monthlyOrdinal,
        dayOfWeek: monthlyWeekday,
      }
    }

    return {
      mode: 'PATTERN',
      pattern,
      range:
        rangeType === 'END_DATE'
          ? { type: 'END_DATE', startDate, endDate }
          : { type: 'COUNT', startDate, count: occurrenceCount },
    }
  }, [
    customDates,
    endDate,
    interval,
    monthlyDay,
    monthlyOrdinal,
    monthlyWeekday,
    occurrenceCount,
    patternType,
    rangeType,
    scheduleMode,
    startDate,
    weekdays,
  ])

  const previewInput = useMemo<MeetingSeriesPreviewInput | null>(() => {
    if (step < 2 || !detailsValid || !timeValid || !seriesDefaults || !scheduleDefinition) return null
    return {
      timeZone: MEETING_SERIES_TIME_ZONE,
      defaults: seriesDefaults,
      schedule: scheduleDefinition,
      exceptions,
    }
  }, [detailsValid, exceptions, scheduleDefinition, seriesDefaults, step, timeValid])

  const preview = useMeetingSeriesPreview(previewInput)
  const previewData = preview.data ?? null
  const previewApiError = preview.error ? toApiClientError(preview.error) : null
  const previewErrorMessage =
    previewApiError?.code === 'MEETING_SERIES_TOO_MANY_OCCURRENCES'
      ? t('meetings.series.redesign.maxMeetingsError', {
          max: MEETING_SERIES_MAX_OCCURRENCES,
        })
      : previewApiError?.code === 'MEETING_SERIES_RANGE_TOO_LONG'
        ? t('meetings.series.redesign.maxRangeError')
        : previewApiError?.message ?? null
  const attachmentsValid = (previewData?.occurrences ?? []).every(
    (occurrence) => commonFiles.length + (occurrenceFiles[occurrence.occurrenceKey]?.length ?? 0) <= 10,
  )
  const selectedOccurrence =
    previewData?.occurrences.find((item) => item.occurrenceKey === selectedOccurrenceKey) ?? null

  const locale = i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-SA'
  const timeFormat = currentUser.data?.preferences.timeFormat ?? '12H'
  const selectedRoom = (rooms.data ?? []).find((room) => room.id === roomId) ?? null
  const selectedRoomName = selectedRoom
    ? i18n.language.startsWith('ar')
      ? selectedRoom.nameAr
      : selectedRoom.nameEn
    : t('meetings.series.summary.noRoom')

  const roomName = (id: number) => {
    const room = (rooms.data ?? []).find((item) => item.id === id)
    return room
      ? i18n.language.startsWith('ar')
        ? room.nameAr
        : room.nameEn
      : `#${id}`
  }
  const timeSummary = `${formatClockTime(startTime, locale, timeFormat)} – ${formatClockTime(endTime, locale, timeFormat)}`
  const repeatHumanSummary = (() => {
    if (scheduleMode === 'CUSTOM') {
      return t('meetings.series.redesign.human.custom', {
        count: customDates.length,
        time: timeSummary,
      })
    }
    if (patternType === 'DAILY') {
      return t(
        interval === 1
          ? 'meetings.series.redesign.human.dailyEvery'
          : 'meetings.series.redesign.human.dailyEveryN',
        { interval, time: timeSummary },
      )
    }
    if (patternType === 'WEEKLY') {
      const days = MEETING_SERIES_WEEKDAYS.filter((day) => weekdays.includes(day))
        .map((day) => t(`meetings.series.weekdays.${day}`))
        .join(i18n.language.startsWith('ar') ? '، ' : ', ')
      return t(
        interval === 1
          ? 'meetings.series.redesign.human.weeklyEvery'
          : 'meetings.series.redesign.human.weeklyEveryN',
        {
          interval,
          days,
          time: timeSummary,
        },
      )
    }
    if (patternType === 'MONTHLY_DATE') {
      return t(
        interval === 1
          ? 'meetings.series.redesign.human.monthlyDateEvery'
          : 'meetings.series.redesign.human.monthlyDateEveryN',
        {
          interval,
          day: monthlyDay,
          time: timeSummary,
        },
      )
    }
    return t(
      interval === 1
        ? 'meetings.series.redesign.human.monthlyRelativeEvery'
        : 'meetings.series.redesign.human.monthlyRelativeEveryN',
      {
        interval,
        ordinal: t(`meetings.series.ordinals.${monthlyOrdinal === -1 ? 'LAST' : monthlyOrdinal}`),
        weekday: t(`meetings.series.weekdays.${monthlyWeekday}`),
        time: timeSummary,
      },
    )
  })()

  function clearOccurrenceCustomizations() {
    setExceptions([])
    setOccurrenceFiles({})
    setSelectedOccurrenceKey(null)
    setBulkSelectedKeys([])
  }

  function changeScheduleStructure(change: () => void) {
    if (exceptions.length > 0) {
      clearOccurrenceCustomizations()
      toast(t('meetings.series.customize.clearedAfterPatternChange'))
    }
    change()
  }

  function applyTemplate(template: MeetingTemplate) {
    setSelectedTemplateId(template.id)
    setTitle(template.title)
    setDescription(template.description ?? '')
    setOrganizerAttending(template.organizerAttending)
    setAttendeeUserIds(template.attendees.map((attendee) => attendee.userId))
    setSelectedParticipantOptions(template.attendees.map(participantOption))
    if (template.defaultRoom?.isActive) setRoomId(template.defaultRoom.id)
    setEndTime(addMinutes(startTime, template.durationMinutes))
    setAgendaItems([])
  }

  function updateAttendees(values: number[]) {
    setAttendeeUserIds(values)
    setSelectedParticipantOptions((current) => {
      const byValue = new Map(current.map((option) => [Number(option.value), option]))
      participantOptions.forEach((option) => byValue.set(Number(option.value), option))
      return values
        .map((id) => byValue.get(id))
        .filter((option): option is SearchableSelectOption => Boolean(option))
    })
  }

  function toggleWeekday(day: MeetingSeriesWeekday) {
    changeScheduleStructure(() => {
      setWeekdays((current) =>
        current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
      )
    })
  }

  function updateCustomDates(values: string[]) {
    changeScheduleStructure(() => {
      setCustomDates([...values].sort())
    })
  }

  function rememberParticipantOptions(values: readonly number[]) {
    setSelectedParticipantOptions((current) => {
      const byId = new Map<number, SearchableSelectOption>()
      for (const option of [...current, ...participantOptions]) {
        byId.set(Number(option.value), option)
      }
      return [...byId.values()].filter((option) => values.includes(Number(option.value)) || current.some((existing) => Number(existing.value) === Number(option.value)))
    })
  }

  function saveOccurrenceSchedule(
    occurrence: MeetingSeriesPreviewOccurrence,
    values: MeetingSeriesOccurrenceScheduleValues,
  ) {
    if (!roomId) return
    const addedId = addedClientIdFromKey(occurrence.occurrenceKey)
    if (addedId) {
      setExceptions((current) =>
        current.map((item) =>
          item.action === 'ADD' && item.clientOccurrenceId.toLowerCase() === addedId.toLowerCase()
            ? {
                ...item,
                date: values.date,
                startTime: values.startTime,
                endTime: values.endTime,
                roomId: values.roomId,
              }
            : item,
        ),
      )
      return
    }

    const scheduleFields = scheduleOverrideFields(occurrence, values, roomId)
    setExceptions((current) => {
      const existing = current.find(
        (item): item is Extract<MeetingSeriesException, { action: 'OVERRIDE' }> =>
          item.action === 'OVERRIDE' && item.occurrenceKey === occurrence.occurrenceKey,
      )
      const next: Extract<MeetingSeriesException, { action: 'OVERRIDE' }> = {
        ...(existing ? stripScheduleOverrideFields(existing) : { action: 'OVERRIDE', occurrenceKey: occurrence.occurrenceKey }),
        ...scheduleFields,
      }
      const others = current.filter(
        (item) => !(item.action === 'OVERRIDE' && item.occurrenceKey === occurrence.occurrenceKey),
      )
      return hasOverrideFields(next) ? [...others, next] : others
    })
  }

  function saveOccurrenceDetails(
    occurrence: MeetingSeriesPreviewOccurrence,
    values: MeetingSeriesOccurrenceDetailValues,
  ) {
    if (!seriesDefaults) return
    rememberParticipantOptions(values.attendeeUserIds)
    const detailsFields = detailOverrideFields(values, seriesDefaults)
    const addedId = addedClientIdFromKey(occurrence.occurrenceKey)

    if (addedId) {
      setExceptions((current) =>
        current.map((item) =>
          item.action === 'ADD' && item.clientOccurrenceId.toLowerCase() === addedId.toLowerCase()
            ? { ...stripDetailOverrideFields(item), ...detailsFields }
            : item,
        ),
      )
      return
    }

    setExceptions((current) => {
      const existing = current.find(
        (item): item is Extract<MeetingSeriesException, { action: 'OVERRIDE' }> =>
          item.action === 'OVERRIDE' && item.occurrenceKey === occurrence.occurrenceKey,
      )
      const next: Extract<MeetingSeriesException, { action: 'OVERRIDE' }> = {
        ...(existing ? stripDetailOverrideFields(existing) : { action: 'OVERRIDE', occurrenceKey: occurrence.occurrenceKey }),
        ...detailsFields,
      }
      const others = current.filter(
        (item) => !(item.action === 'OVERRIDE' && item.occurrenceKey === occurrence.occurrenceKey),
      )
      return hasOverrideFields(next) ? [...others, next] : others
    })
  }

  function resetOccurrenceSchedule(occurrence: MeetingSeriesPreviewOccurrence) {
    const addedId = addedClientIdFromKey(occurrence.occurrenceKey)
    if (addedId) {
      setExceptions((current) =>
        current.map((item) =>
          item.action === 'ADD' && item.clientOccurrenceId.toLowerCase() === addedId.toLowerCase()
            ? (() => {
                const { startTime: _startTime, endTime: _endTime, roomId: _roomId, ...rest } = item
                return rest
              })()
            : item,
        ),
      )
      return
    }

    setExceptions((current) => {
      const existing = current.find(
        (item): item is Extract<MeetingSeriesException, { action: 'OVERRIDE' }> =>
          item.action === 'OVERRIDE' && item.occurrenceKey === occurrence.occurrenceKey,
      )
      if (!existing) return current
      const next = stripScheduleOverrideFields(existing)
      const others = current.filter(
        (item) => !(item.action === 'OVERRIDE' && item.occurrenceKey === occurrence.occurrenceKey),
      )
      return hasOverrideFields(next) ? [...others, next] : others
    })
  }

  function resetOccurrenceDetails(occurrence: MeetingSeriesPreviewOccurrence) {
    setOccurrenceFiles((current) => {
      const next = { ...current }
      delete next[occurrence.occurrenceKey]
      return next
    })
    const addedId = addedClientIdFromKey(occurrence.occurrenceKey)
    if (addedId) {
      setExceptions((current) =>
        current.map((item) =>
          item.action === 'ADD' && item.clientOccurrenceId.toLowerCase() === addedId.toLowerCase()
            ? stripDetailOverrideFields(item)
            : item,
        ),
      )
      return
    }

    setExceptions((current) => {
      const existing = current.find(
        (item): item is Extract<MeetingSeriesException, { action: 'OVERRIDE' }> =>
          item.action === 'OVERRIDE' && item.occurrenceKey === occurrence.occurrenceKey,
      )
      if (!existing) return current
      const next = stripDetailOverrideFields(existing)
      const others = current.filter(
        (item) => !(item.action === 'OVERRIDE' && item.occurrenceKey === occurrence.occurrenceKey),
      )
      return hasOverrideFields(next) ? [...others, next] : others
    })
  }

  function resetOccurrenceAll(occurrence: MeetingSeriesPreviewOccurrence) {
    setOccurrenceFiles((current) => {
      const next = { ...current }
      delete next[occurrence.occurrenceKey]
      return next
    })
    const addedId = addedClientIdFromKey(occurrence.occurrenceKey)
    if (addedId) {
      setExceptions((current) =>
        current.map((item) =>
          item.action === 'ADD' && item.clientOccurrenceId.toLowerCase() === addedId.toLowerCase()
            ? { action: 'ADD', clientOccurrenceId: item.clientOccurrenceId, date: item.date }
            : item,
        ),
      )
      return
    }
    setExceptions((current) =>
      current.filter(
        (item) => !(item.action === 'OVERRIDE' && item.occurrenceKey === occurrence.occurrenceKey),
      ),
    )
  }

  function removeOccurrence(occurrence: MeetingSeriesPreviewOccurrence) {
    setOccurrenceFiles((current) => {
      const next = { ...current }
      delete next[occurrence.occurrenceKey]
      return next
    })
    const addedId = addedClientIdFromKey(occurrence.occurrenceKey)
    if (addedId) {
      setExceptions((current) =>
        current.filter(
          (item) => !(item.action === 'ADD' && item.clientOccurrenceId.toLowerCase() === addedId.toLowerCase()),
        ),
      )
    } else if (scheduleMode === 'CUSTOM' && occurrence.originalDate) {
      setCustomDates((current) => current.filter((date) => date !== occurrence.originalDate))
      setExceptions((current) =>
        current.filter(
          (item) => !('occurrenceKey' in item) || item.occurrenceKey !== occurrence.occurrenceKey,
        ),
      )
    } else {
      setExceptions((current) => [
        ...current.filter(
          (item) => !('occurrenceKey' in item) || item.occurrenceKey !== occurrence.occurrenceKey,
        ),
        { action: 'REMOVE', occurrenceKey: occurrence.occurrenceKey },
      ])
    }
    setBulkSelectedKeys((current) => current.filter((key) => key !== occurrence.occurrenceKey))
    if (selectedOccurrenceKey === occurrence.occurrenceKey) setSelectedOccurrenceKey(null)
  }

  function duplicateOccurrence(occurrence: MeetingSeriesPreviewOccurrence) {
    const clientOccurrenceId = createUuid()
    const key = `A:${clientOccurrenceId.toLowerCase()}`
    setExceptions((current) => [
      ...current,
      {
        action: 'ADD',
        clientOccurrenceId,
        date: occurrence.date,
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
        roomId: occurrence.roomId,
        title: occurrence.title,
        description: occurrence.description,
        organizerAttending: occurrence.organizerAttending,
        attendeeUserIds: [...occurrence.attendeeUserIds],
        agendaItems: occurrence.agendaItems.map((item) => ({ ...item })),
      },
    ])
    rememberParticipantOptions(occurrence.attendeeUserIds)
    setSelectedOccurrenceKey(key)
  }

  function addOccurrence(values: MeetingSeriesOccurrenceScheduleValues) {
    const clientOccurrenceId = createUuid()
    setExceptions((current) => [
      ...current,
      {
        action: 'ADD',
        clientOccurrenceId,
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
        roomId: values.roomId,
      },
    ])
    setSelectedOccurrenceKey(`A:${clientOccurrenceId.toLowerCase()}`)
  }

  function restoreRemoved(occurrenceKey: string) {
    setExceptions((current) =>
      current.filter(
        (item) => !(item.action === 'REMOVE' && item.occurrenceKey === occurrenceKey),
      ),
    )
  }

  function toggleBulkOccurrence(occurrenceKey: string) {
    setBulkSelectedKeys((current) =>
      current.includes(occurrenceKey)
        ? current.filter((key) => key !== occurrenceKey)
        : [...current, occurrenceKey],
    )
  }

  function bulkOccurrences(): MeetingSeriesPreviewOccurrence[] {
    const selected = new Set(bulkSelectedKeys)
    return (previewData?.occurrences ?? []).filter((occurrence) => selected.has(occurrence.occurrenceKey))
  }

  function applyBulkSchedule(values: MeetingSeriesBulkScheduleValues) {
    for (const occurrence of bulkOccurrences()) {
      saveOccurrenceSchedule(occurrence, {
        date: occurrence.date,
        startTime: values.startTime ?? occurrence.startTime,
        endTime: values.endTime ?? occurrence.endTime,
        roomId: values.roomId ?? occurrence.roomId,
      })
    }
  }

  function bulkResetSchedule() {
    for (const occurrence of bulkOccurrences()) resetOccurrenceSchedule(occurrence)
    setBulkSelectedKeys([])
  }

  function bulkRemove() {
    for (const occurrence of bulkOccurrences()) removeOccurrence(occurrence)
    setBulkSelectedKeys([])
  }

  function nextStep() {
    if (step === 1 && (!detailsValid || !roomId || !timeValid)) {
      toast.error(t('meetings.series.redesign.completeBasics'))
      return
    }
    if (step === 2) {
      const explicitLimitExceeded =
        (scheduleMode === 'PATTERN' &&
          rangeType === 'COUNT' &&
          occurrenceCount > MEETING_SERIES_MAX_OCCURRENCES) ||
        (scheduleMode === 'CUSTOM' &&
          customDates.length > MEETING_SERIES_MAX_OCCURRENCES)

      if (explicitLimitExceeded) {
        toast.error(
          t('meetings.series.redesign.maxMeetingsError', {
            max: MEETING_SERIES_MAX_OCCURRENCES,
          }),
        )
        return
      }

      if (!roomId || !timeValid || !scheduleDefinition) {
        toast.error(t('meetings.series.validation.completeSchedule'))
        return
      }
      if (preview.isPending || preview.isFetching) {
        toast(t('meetings.series.validation.waitingPreview'))
        return
      }
      if (preview.isError || !previewData) {
        toast.error(previewErrorMessage ?? t('meetings.series.validation.previewRequired'))
        return
      }
    }
    setStep((current) => Math.min(STEP_COUNT, current + 1) as ComposerStep)
  }

  async function submitSeries() {
    if (!previewInput || !previewData?.canCreate || !attachmentsValid || finalizing) return
    setFinalizing(true)
    try {
      const result = await createSeries.mutateAsync({ ...previewInput, creationRequestId })
      let attachmentFailures = 0
      for (const item of commonFiles) {
        try {
          const attachment = await uploadSeriesAttachment.mutateAsync({
            seriesId: result.seriesId,
            attachmentRequestId: item.id,
            scope: 'COMMON',
            file: item.file,
          })
          if (attachment.associatedMeetingCount !== result.meetingIds.length) {
            attachmentFailures += 1
          }
        } catch {
          attachmentFailures += 1
        }
      }
      for (const [occurrenceKey, files] of Object.entries(occurrenceFiles)) {
        for (const item of files) {
          try {
            const attachment = await uploadSeriesAttachment.mutateAsync({
              seriesId: result.seriesId,
              attachmentRequestId: item.id,
              scope: 'OCCURRENCE',
              occurrenceKey,
              file: item.file,
            })
            if (attachment.associatedMeetingCount !== 1) {
              attachmentFailures += 1
            }
          } catch {
            attachmentFailures += 1
          }
        }
      }
      toast.success(t('meetings.series.created', { count: result.meetingIds.length }))
      if (attachmentFailures > 0) {
        toast.error(t('meetings.series.attachments.partialFailure', { count: attachmentFailures }))
      }
      bypassNavigationRef.current = true
      navigate(`/meetings/series/${result.seriesId}`)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.series.createError'),
        }),
      )
    } finally {
      setFinalizing(false)
    }
  }

  const removedPatternExceptions = exceptions.filter(
    (item): item is Extract<MeetingSeriesException, { action: 'REMOVE' }> => item.action === 'REMOVE',
  )
  const lastOccurrence = previewData?.occurrences.at(-1) ?? null
  const addInitialValues: MeetingSeriesOccurrenceScheduleValues = {
    date: lastOccurrence ? addDays(lastOccurrence.date, 7) : addDays(startDate, 7),
    startTime,
    endTime,
    roomId: roomId ?? (rooms.data?.[0]?.id ?? 0),
  }

  return (
    <div className="space-y-5">
      <ComposerStepper step={step} onStepChange={setStep} />

      {step === 1 ? (
        <MeetingDetailsStage
          selectedTemplateId={selectedTemplateId}
          templateOptions={templateOptions}
          templatesLoading={templates.isPending}
          title={title}
          description={description}
          organizerAttending={organizerAttending}
          attendeeUserIds={attendeeUserIds}
          participantCount={participantCount}
          participantOptions={participantOptions}
          selectedParticipantOptions={selectedAttendeeOptions}
          participantSearch={participantSearch}
          participantLoading={participantQuery.isPending}
          participantLoadingMore={participantQuery.isFetchingNextPage}
          participantHasMore={Boolean(participantQuery.hasNextPage)}
          agendaItems={agendaItems}
          commonFiles={commonFiles}
          agendaParticipants={agendaParticipants}
          meetingDurationMinutes={timeDurationMinutes(startTime, endTime)}
          organizerUserId={currentUserId}
          roomOptions={roomOptions}
          roomsLoading={rooms.isPending}
          roomId={roomId}
          startTime={startTime}
          endTime={endTime}
          onTemplateChange={(value) => {
            setSelectedTemplateId(value)
            const template = (templates.data ?? []).find((item) => item.id === value)
            if (template) applyTemplate(template)
          }}
          onTitleChange={setTitle}
          onDescriptionChange={setDescription}
          onOrganizerAttendingChange={setOrganizerAttending}
          onParticipantSearchChange={setParticipantSearch}
          onAttendeesChange={updateAttendees}
          onLoadMoreParticipants={() => void participantQuery.fetchNextPage()}
          onAgendaChange={setAgendaItems}
          onCommonFilesChange={setCommonFiles}
          onRoomChange={(value) =>
            changeScheduleStructure(() => {
              setRoomId(value)
            })
          }
          onTimeChange={(nextStartTime, nextEndTime) =>
            changeScheduleStructure(() => {
              setStartTime(nextStartTime)
              setEndTime(nextEndTime)
            })
          }
        />
      ) : null}

      {step === 2 ? (
        <RepeatStage
          scheduleMode={scheduleMode}
          patternType={patternType}
          interval={interval}
          weekdays={weekdays}
          monthlyDay={monthlyDay}
          monthlyOrdinal={monthlyOrdinal}
          monthlyWeekday={monthlyWeekday}
          rangeType={rangeType}
          startDate={startDate}
          endDate={endDate}
          occurrenceCount={occurrenceCount}
          customDates={customDates}
          preview={previewData}
          previewPending={preview.isPending || preview.isFetching}
          previewError={preview.isError}
          previewErrorMessage={previewErrorMessage}
          humanSummary={repeatHumanSummary}
          onScheduleModeChange={(value) => changeScheduleStructure(() => setScheduleMode(value))}
          onPatternTypeChange={(value) => changeScheduleStructure(() => setPatternType(value))}
          onIntervalChange={(value) => changeScheduleStructure(() => setInterval(value))}
          onToggleWeekday={toggleWeekday}
          onMonthlyDayChange={(value) => changeScheduleStructure(() => setMonthlyDay(value))}
          onMonthlyOrdinalChange={(value) => changeScheduleStructure(() => setMonthlyOrdinal(value))}
          onMonthlyWeekdayChange={(value) => changeScheduleStructure(() => setMonthlyWeekday(value))}
          onRangeTypeChange={(value) => changeScheduleStructure(() => setRangeType(value))}
          onStartDateChange={(value) => changeScheduleStructure(() => setStartDate(value))}
          onEndDateChange={(value) => changeScheduleStructure(() => setEndDate(value))}
          onOccurrenceCountChange={(value) => changeScheduleStructure(() => setOccurrenceCount(value))}
          onCustomDatesChange={updateCustomDates}
        />
      ) : null}

      {step === 3 && seriesDefaults ? (
        <PreviewStage
          occurrences={previewData?.occurrences ?? []}
          previewPending={preview.isPending || preview.isFetching}
          occurrenceView={occurrenceView}
          bulkSelectedKeys={bulkSelectedKeys}
          occurrenceFiles={occurrenceFiles}
          roomName={roomName}
          locale={locale}
          timeFormat={timeFormat}
          removedPatternExceptions={removedPatternExceptions}
          canCreate={previewData?.canCreate === true && attachmentsValid}
          onViewChange={setOccurrenceView}
          onSelectOccurrence={setSelectedOccurrenceKey}
          onToggleBulkOccurrence={toggleBulkOccurrence}
          onClearBulkSelection={() => setBulkSelectedKeys([])}
          onOpenBulkSchedule={() => setBulkScheduleOpen(true)}
          onBulkResetSchedule={bulkResetSchedule}
          onBulkRemove={bulkRemove}
          onRestoreRemoved={restoreRemoved}
          onAddOccurrence={() => setAddOccurrenceOpen(true)}
          onBack={() => setStep(2)}
          onSchedule={() => setScheduleConfirmOpen(true)}
        />
      ) : null}

      {step < 3 ? (
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 border-t pt-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => (step === 1 ? navigate('/meetings') : setStep((step - 1) as ComposerStep))}
          >
            <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
            {step === 1 ? t('common.cancel') : t('meetings.series.actions.back')}
          </Button>

          <Button type="button" onClick={nextStep}>
            {step === 2
              ? t('meetings.series.redesign.previewCount', {
                  count: previewData?.occurrenceCount ?? occurrenceCount,
                })
              : t('meetings.series.actions.continue')}
            <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      ) : null}

      <MeetingSeriesAddOccurrenceDialog
        open={addOccurrenceOpen}
        rooms={rooms.data ?? []}
        existingOccurrences={previewData?.occurrences ?? []}
        participantCount={participantCount}
        initialValues={addInitialValues}
        onOpenChange={setAddOccurrenceOpen}
        onAdd={addOccurrence}
      />

      <MeetingSeriesBulkScheduleWorkspace
        open={bulkScheduleOpen}
        rooms={rooms.data ?? []}
        selectedOccurrences={bulkOccurrences()}
        allOccurrences={previewData?.occurrences ?? []}
        previewInput={previewInput}
        locale={locale}
        timeFormat={timeFormat}
        onOpenChange={setBulkScheduleOpen}
        onApply={applyBulkSchedule}
      />

      <Dialog
        open={selectedOccurrence !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedOccurrenceKey(null)
        }}
      >
        <DialogContent
          variant="modal"
          closeLabel={t('common.close')}
          className="flex h-[calc(100dvh-2rem)] max-h-[58rem] w-[min(92rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0"
        >
          <DialogTitle className="sr-only">
            {t('meetings.series.customize.editorTitle')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('meetings.series.redesign.editMeetingDescription')}
          </DialogDescription>
          {selectedOccurrence && seriesDefaults ? (
            <MeetingSeriesOccurrenceEditor
              occurrence={selectedOccurrence}
              defaults={seriesDefaults}
              rooms={rooms.data ?? []}
              seriesOccurrences={previewData?.occurrences ?? []}
              organizer={organizerParticipant}
              participantOptions={participantOptions}
              knownParticipantOptions={selectedParticipantOptions}
              participantSearch={participantSearch}
              participantLoading={participantQuery.isPending}
              participantLoadingMore={participantQuery.isFetchingNextPage}
              participantHasMore={Boolean(participantQuery.hasNextPage)}
              commonAttachmentFiles={commonFiles}
              attachmentFiles={occurrenceFiles[selectedOccurrence.occurrenceKey] ?? []}
              attachmentMaxCount={Math.max(0, 10 - commonFiles.length)}
              onAttachmentFilesChange={(files) =>
                setOccurrenceFiles((current) => ({
                  ...current,
                  [selectedOccurrence.occurrenceKey]: files,
                }))
              }
              onParticipantSearchChange={setParticipantSearch}
              onLoadMoreParticipants={() => void participantQuery.fetchNextPage()}
              onRememberParticipantOptions={rememberParticipantOptions}
              onSaveSchedule={(values) => saveOccurrenceSchedule(selectedOccurrence, values)}
              onSaveDetails={(values) => saveOccurrenceDetails(selectedOccurrence, values)}
              onResetSchedule={() => resetOccurrenceSchedule(selectedOccurrence)}
              onResetDetails={() => resetOccurrenceDetails(selectedOccurrence)}
              onResetAll={() => resetOccurrenceAll(selectedOccurrence)}
              onRemove={() => removeOccurrence(selectedOccurrence)}
              onDuplicate={() => duplicateOccurrence(selectedOccurrence)}
              onClose={() => setSelectedOccurrenceKey(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={scheduleConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (!finalizing) setScheduleConfirmOpen(nextOpen)
        }}
      >
        <DialogContent
          variant="modal"
          closeLabel={t('common.close')}
          className="w-[min(34rem,calc(100vw-2rem))] max-w-none p-0"
        >
          <div className="border-b px-5 py-5 pe-14 sm:px-6 sm:pe-16">
            <div className="flex items-start gap-3">
              <span className="bg-success/10 text-success grid size-11 shrink-0 place-items-center rounded-xl">
                <CheckCircle2 aria-hidden="true" className="size-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  {t('meetings.series.redesign.confirmTitle')}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1 text-sm">
                  {t('meetings.series.redesign.confirmDescription', {
                    count: previewData?.occurrenceCount ?? 0,
                  })}
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-5 sm:p-6">
            <div className="bg-muted/20 space-y-3 rounded-xl border p-4 text-sm">
              <SummaryLine
                icon={CalendarDays}
                label={t('meetings.series.redesign.repeatSummary')}
                value={repeatHumanSummary}
              />
              <SummaryLine
                icon={DoorOpen}
                label={t('meetings.series.fields.room')}
                value={selectedRoomName}
              />
              <SummaryLine
                icon={Clock3}
                label={t('meetings.series.redesign.timeTitle')}
                value={timeSummary}
              />
              <SummaryLine
                icon={UsersRound}
                label={t('meetings.series.redesign.participants')}
                value={String(participantCount)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                disabled={finalizing}
                onClick={() => setScheduleConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={
                  !previewData?.canCreate ||
                  !attachmentsValid ||
                  createSeries.isPending ||
                  finalizing
                }
                onClick={() => void submitSeries()}
              >
                {createSeries.isPending || finalizing ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Check aria-hidden="true" className="size-4" />
                )}
                {t('meetings.series.actions.scheduleCount', {
                  count: previewData?.occurrenceCount ?? 0,
                })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={blocker.state === 'blocked'}
        title={t('meetings.series.unsaved.title')}
        message={t('meetings.series.unsaved.description')}
        confirmText={t('meetings.series.unsaved.leave')}
        cancelText={t('meetings.series.unsaved.keepEditing')}
        danger
        onConfirm={() => {
          if (blocker.state !== 'blocked') return
          bypassNavigationRef.current = true
          blocker.proceed()
        }}
        onCancel={() => {
          if (blocker.state === 'blocked') blocker.reset()
        }}
      />
    </div>
  )
}

function ComposerStepper({
  step,
  onStepChange,
}: {
  step: ComposerStep
  onStepChange: (step: ComposerStep) => void
}) {
  const { t } = useTranslation()
  const steps: Array<{ value: ComposerStep; label: string }> = [
    { value: 1, label: t('meetings.series.redesign.steps.details') },
    { value: 2, label: t('meetings.series.redesign.steps.repeat') },
    { value: 3, label: t('meetings.series.redesign.steps.preview') },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl px-1">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-primary">
          {t('meetings.series.redesign.stepOf', { current: step, total: STEP_COUNT })}
        </span>
        <span className="text-muted-foreground">{steps[step - 1]?.label}</span>
      </div>
      <ol className="grid grid-cols-3 items-start">
        {steps.map((item, index) => {
          const active = item.value === step
          const complete = item.value < step
          const enabled = item.value <= step
          return (
            <li key={item.value} className="relative">
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute end-1/2 top-4 h-px w-full',
                    item.value <= step ? 'bg-primary/45' : 'bg-border',
                  )}
                />
              ) : null}
              <button
                type="button"
                disabled={!enabled}
                className="relative z-10 flex w-full flex-col items-center gap-2 text-center outline-none disabled:cursor-default"
                onClick={() => enabled && onStepChange(item.value)}
              >
                <span
                  className={cn(
                    'grid size-8 place-items-center rounded-full border text-xs font-bold transition',
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : complete
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {complete ? <Check aria-hidden="true" className="size-3.5" /> : item.value}
                </span>
                <span
                  className={cn(
                    'hidden text-xs font-semibold sm:block',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function MeetingDetailsStage(props: MeetingDetailsStageProps) {
  const { t } = useTranslation()
  const [agendaFilesOpen, setAgendaFilesOpen] = useState(false)

  return (
    <Card className="mx-auto w-full max-w-5xl overflow-hidden p-0">
      <div className="border-b px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold">{t('meetings.series.redesign.basicsTitle')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('meetings.series.redesign.basicsDescription')}
        </p>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            {t('meetings.create.startFromTemplate')}
          </label>
          <SearchableMultiSelect
            value={props.selectedTemplateId}
            options={props.templateOptions}
            loading={props.templatesLoading}
            placeholder={t('meetings.create.templatePlaceholder')}
            searchPlaceholder={t('meetings.create.templateSearch')}
            noResultsText={t('meetings.create.noTemplates')}
            onChange={(value) =>
              props.onTemplateChange(value === null ? null : Number(value))
            }
          />
        </div>

        <InputField
          value={props.title}
          label={t('meetings.fields.title')}
          required
          maxLength={250}
          onChange={(event) => props.onTitleChange(event.target.value)}
        />

        <TextareaField
          value={props.description}
          label={t('meetings.fields.description')}
          rows={4}
          maxLength={10000}
          onChange={(event) => props.onDescriptionChange(event.target.value)}
        />

        <div className="bg-muted/15 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">
                {t('meetings.create.organizerAttendance.willAttend')}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('meetings.create.organizerAttendance.remainsOrganizer')}
              </p>
            </div>
            <Switch
              checked={props.organizerAttending}
              onCheckedChange={props.onOrganizerAttendingChange}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{t('meetings.create.participantsTitle')}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {t('meetings.series.redesign.participantsHint')}
              </p>
            </div>
            <Badge variant={props.participantCount > 0 ? 'success' : 'warning'}>
              {t('meetings.participantCount', { count: props.participantCount })}
            </Badge>
          </div>
          <MeetingParticipantPicker
            values={props.attendeeUserIds}
            options={props.participantOptions}
            selectedOptions={props.selectedParticipantOptions}
            searchValue={props.participantSearch}
            participantCount={props.participantCount}
            loading={props.participantLoading}
            loadingMore={props.participantLoadingMore}
            hasMore={props.participantHasMore}
            onSearchChange={props.onParticipantSearchChange}
            onLoadMore={props.onLoadMoreParticipants}
            onChange={props.onAttendeesChange}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t('meetings.series.fields.room')}
            </label>
            <SearchableMultiSelect
              value={props.roomId}
              options={props.roomOptions}
              loading={props.roomsLoading}
              placeholder={t('meetings.create.chooseRoom')}
              searchPlaceholder={t('meetings.fields.roomSearch')}
              noResultsText={t('meetings.noActiveRooms')}
              onChange={(value) => props.onRoomChange(value === null ? null : Number(value))}
            />
          </div>

          <MeetingTimeRangePicker
            startTime={props.startTime}
            endTime={props.endTime}
            onChange={props.onTimeChange}
          />
        </div>

        <div className="overflow-hidden rounded-xl border">
          <button
            type="button"
            aria-expanded={agendaFilesOpen}
            className="hover:bg-muted/35 flex w-full items-center justify-between gap-4 px-4 py-3.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setAgendaFilesOpen((current) => !current)}
          >
            <span className="flex min-w-0 items-start gap-3">
              <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
                <SlidersHorizontal aria-hidden="true" className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold">
                  {t('meetings.series.redesign.agendaFiles')}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {t('meetings.series.redesign.agendaFilesHint')}
                </span>
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'text-muted-foreground size-4 shrink-0',
                agendaFilesOpen && 'rotate-180',
              )}
            />
          </button>

          {agendaFilesOpen ? (
            <div className="space-y-5 border-t p-4 sm:p-5">
              <MeetingAgendaEditor
                items={props.agendaItems}
                participants={props.agendaParticipants}
                organizerUserId={props.organizerUserId}
                meetingDurationMinutes={props.meetingDurationMinutes}
                onChange={props.onAgendaChange}
              />

              <MeetingSeriesFilePicker
                files={props.commonFiles}
                title={t('meetings.series.attachments.commonTitle')}
                description={t('meetings.series.redesign.commonFilesHint')}
                onChange={props.onCommonFilesChange}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function RepeatStage(props: RepeatStageProps) {
  const { i18n, t } = useTranslation()
  const weekdayLabels = MEETING_SERIES_WEEKDAYS.map((day) => ({
    day,
    label: t(`meetings.series.weekdays.${day}`),
  }))
  const monthlySelected =
    props.scheduleMode === 'PATTERN' &&
    (props.patternType === 'MONTHLY_DATE' || props.patternType === 'MONTHLY_RELATIVE')
  const previewCount = props.preview?.occurrenceCount ?? 0
  const attentionCount =
    props.preview?.occurrences.filter((occurrence) => !occurrence.validation.isValid).length ?? 0
  const explicitLimitExceeded =
    (props.scheduleMode === 'PATTERN' &&
      props.rangeType === 'COUNT' &&
      props.occurrenceCount > MEETING_SERIES_MAX_OCCURRENCES) ||
    (props.scheduleMode === 'CUSTOM' &&
      props.customDates.length > MEETING_SERIES_MAX_OCCURRENCES)
  const blockingMessage = explicitLimitExceeded
    ? t('meetings.series.redesign.maxMeetingsError', {
        max: MEETING_SERIES_MAX_OCCURRENCES,
      })
    : props.previewError
      ? props.previewErrorMessage ?? t('meetings.series.validation.previewError')
      : null

  return (
    <Card className="mx-auto w-full max-w-5xl overflow-hidden p-0">
      <div className="border-b px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold">{t('meetings.series.redesign.repeatTitle')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('meetings.series.redesign.repeatDescription')}
        </p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <section className="space-y-3">
          <div>
            <p className="text-sm font-semibold">{t('meetings.series.redesign.howOften')}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('meetings.series.redesign.howOftenHint')}
            </p>
          </div>

          <div className="bg-muted/20 grid gap-1.5 rounded-2xl border p-1.5 sm:grid-cols-2 lg:grid-cols-4">
            <ModeButton
              active={props.scheduleMode === 'PATTERN' && props.patternType === 'DAILY'}
              icon={CalendarDays}
              label={t('meetings.series.redesign.repeatChoices.daily')}
              description={t('meetings.series.redesign.repeatChoices.dailyHint')}
              onClick={() => {
                props.onScheduleModeChange('PATTERN')
                props.onPatternTypeChange('DAILY')
              }}
            />
            <ModeButton
              active={props.scheduleMode === 'PATTERN' && props.patternType === 'WEEKLY'}
              icon={CalendarDays}
              label={t('meetings.series.redesign.repeatChoices.weekly')}
              description={t('meetings.series.redesign.repeatChoices.weeklyHint')}
              onClick={() => {
                props.onScheduleModeChange('PATTERN')
                props.onPatternTypeChange('WEEKLY')
              }}
            />
            <ModeButton
              active={monthlySelected}
              icon={CalendarPlus2}
              label={t('meetings.series.redesign.repeatChoices.monthly')}
              description={t('meetings.series.redesign.repeatChoices.monthlyHint')}
              onClick={() => {
                props.onScheduleModeChange('PATTERN')
                if (!monthlySelected) props.onPatternTypeChange('MONTHLY_DATE')
              }}
            />
            <ModeButton
              active={props.scheduleMode === 'CUSTOM'}
              icon={Grid3X3}
              label={t('meetings.series.redesign.repeatChoices.custom')}
              description={t('meetings.series.redesign.repeatChoices.customHint')}
              onClick={() => props.onScheduleModeChange('CUSTOM')}
            />
          </div>
        </section>

        {props.scheduleMode === 'PATTERN' ? (
          <section className="space-y-5 rounded-2xl border p-4 sm:p-5">
            {props.patternType === 'WEEKLY' ? (
              <div>
                <p className="text-sm font-semibold">{t('meetings.series.redesign.whichDays')}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t('meetings.series.redesign.whichDaysHint')}
                </p>
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {weekdayLabels.map(({ day, label }) => {
                    const selected = props.weekdays.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          'min-h-11 rounded-xl border px-2 py-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-background hover:border-primary/40 hover:bg-primary/[0.03]',
                        )}
                        onClick={() => props.onToggleWeekday(day)}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {monthlySelected ? (
              <div>
                <p className="text-sm font-semibold">{t('meetings.series.redesign.whenEachMonth')}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t('meetings.series.redesign.whenEachMonthHint')}
                </p>
                <div className="bg-muted/20 mt-3 grid grid-cols-2 gap-1.5 rounded-xl border p-1.5">
                  <ModeButton
                    active={props.patternType === 'MONTHLY_DATE'}
                    label={t('meetings.series.redesign.monthlyByDate')}
                    description={t('meetings.series.redesign.monthlyByDateHint')}
                    compact
                    onClick={() => props.onPatternTypeChange('MONTHLY_DATE')}
                  />
                  <ModeButton
                    active={props.patternType === 'MONTHLY_RELATIVE'}
                    label={t('meetings.series.redesign.monthlyByWeekday')}
                    description={t('meetings.series.redesign.monthlyByWeekdayHint')}
                    compact
                    onClick={() => props.onPatternTypeChange('MONTHLY_RELATIVE')}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <p className="text-sm font-semibold">{t('meetings.series.redesign.frequency')}</p>

                <div className="max-w-xs">
                  <InputField
                    type="number"
                    min={1}
                    value={props.interval}
                    label={
                      props.patternType === 'DAILY'
                        ? t('meetings.series.redesign.everyDays')
                        : props.patternType === 'WEEKLY'
                          ? t('meetings.series.redesign.everyWeeks')
                          : t('meetings.series.redesign.everyMonths')
                    }
                    onChange={(event) =>
                      props.onIntervalChange(Math.max(1, Number(event.target.value) || 1))
                    }
                  />
                </div>

                {props.patternType === 'MONTHLY_DATE' ? (
                  <div className="max-w-xs">
                    <InputField
                      type="number"
                      min={1}
                      max={31}
                      value={props.monthlyDay}
                      label={t('meetings.series.redesign.dayOfMonthFriendly')}
                      onChange={(event) =>
                        props.onMonthlyDayChange(
                          Math.max(1, Math.min(31, Number(event.target.value) || 1)),
                        )
                      }
                    />
                  </div>
                ) : null}

                {props.patternType === 'MONTHLY_RELATIVE' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">
                        {t('meetings.series.redesign.weekOfMonthFriendly')}
                      </label>
                      <Select
                        value={String(props.monthlyOrdinal)}
                        onValueChange={(value) =>
                          props.onMonthlyOrdinalChange(Number(value) as 1 | 2 | 3 | 4 | -1)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, -1].map((ordinal) => (
                            <SelectItem key={ordinal} value={String(ordinal)}>
                              {t(
                                `meetings.series.ordinals.${ordinal === -1 ? 'LAST' : ordinal}`,
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium">
                        {t('meetings.series.redesign.weekdayFriendly')}
                      </label>
                      <Select
                        value={props.monthlyWeekday}
                        onValueChange={(value) =>
                          props.onMonthlyWeekdayChange(value as MeetingSeriesWeekday)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {weekdayLabels.map(({ day, label }) => (
                            <SelectItem key={day} value={day}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold">{t('meetings.series.redesign.dateRange')}</p>

                <DatePicker
                  value={props.startDate}
                  onChange={props.onStartDateChange}
                  label={t('meetings.series.schedule.starts')}
                  minDate={formatRiyadhDateInput(new Date())}
                  required
                />

                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    {t('meetings.series.schedule.ends')}
                  </label>
                  <Select
                    value={props.rangeType}
                    onValueChange={(value) =>
                      props.onRangeTypeChange(value as 'END_DATE' | 'COUNT')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="END_DATE">
                        {t('meetings.series.redesign.endOnDate')}
                      </SelectItem>
                      <SelectItem value="COUNT">
                        {t('meetings.series.redesign.endAfterMeetings')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {props.rangeType === 'END_DATE' ? (
                  <DatePicker
                    value={props.endDate}
                    onChange={props.onEndDateChange}
                    minDate={props.startDate}
                    required
                  />
                ) : (
                  <div>
                    <InputField
                      type="number"
                      min={1}
                      value={props.occurrenceCount}
                      label={t('meetings.series.redesign.numberOfMeetings')}
                      onChange={(event) =>
                        props.onOccurrenceCountChange(
                          Math.max(1, Number(event.target.value) || 1),
                        )
                      }
                    />
                    <p
                      className={cn(
                        'mt-1.5 text-xs',
                        props.occurrenceCount > MEETING_SERIES_MAX_OCCURRENCES
                          ? 'text-destructive font-medium'
                          : 'text-muted-foreground',
                      )}
                    >
                      {props.occurrenceCount > MEETING_SERIES_MAX_OCCURRENCES
                        ? t('meetings.series.redesign.maxMeetingsError', {
                            max: MEETING_SERIES_MAX_OCCURRENCES,
                          })
                        : t('meetings.series.redesign.maxMeetingsHint', {
                            max: MEETING_SERIES_MAX_OCCURRENCES,
                          })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="space-y-4 rounded-2xl border p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{t('meetings.series.redesign.chooseExactDates')}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t('meetings.series.redesign.customCalendar.description')}
                </p>
              </div>
              <Badge variant="default">
                {t('meetings.series.redesign.selectedDatesCount', {
                  count: props.customDates.length,
                })}
              </Badge>
            </div>

            <MeetingSeriesCustomDateCalendar
              dates={props.customDates}
              locale={
                i18n.language.startsWith('ar')
                  ? 'ar-SA-u-ca-gregory'
                  : 'en-SA'
              }
              minDate={formatRiyadhDateInput(new Date())}
              maxCount={MEETING_SERIES_MAX_OCCURRENCES}
              onChange={props.onCustomDatesChange}
            />
          </section>
        )}

        <div
          className={cn(
            'rounded-2xl border p-4 sm:p-5',
            blockingMessage
              ? 'border-destructive/30 bg-destructive/5'
              : attentionCount > 0
                ? 'border-warning/35 bg-warning/5'
                : 'border-primary/20 bg-primary/[0.04]',
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-xl',
                blockingMessage
                  ? 'bg-destructive/10 text-destructive'
                  : attentionCount > 0
                    ? 'bg-warning/15 text-warning-foreground'
                    : 'bg-primary/10 text-primary',
              )}
            >
              {props.previewPending ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : blockingMessage || attentionCount > 0 ? (
                <AlertTriangle aria-hidden="true" className="size-4" />
              ) : (
                <CalendarDays aria-hidden="true" className="size-4" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-semibold">{props.humanSummary}</p>
              <p
                className={cn(
                  'mt-1 text-sm',
                  blockingMessage ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {props.previewPending
                  ? t('meetings.series.validation.waitingPreview')
                  : blockingMessage
                    ? blockingMessage
                    : attentionCount > 0
                      ? t('meetings.series.redesign.conflictsCanContinue', {
                          total: previewCount,
                          count: attentionCount,
                        })
                      : t('meetings.series.redesign.meetingsWillBeCreated', {
                          count: previewCount,
                        })}
              </p>
              {!blockingMessage && attentionCount > 0 ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('meetings.series.redesign.resolveInPreview')}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function PreviewStage(props: PreviewStageProps) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'ATTENTION' | 'CHANGED'>('ALL')
  const bulkSelected = new Set(props.bulkSelectedKeys)
  const invalidOccurrences = props.occurrences.filter((item) => !item.validation.isValid)
  const invalidCount = invalidOccurrences.length
  const readyCount = props.occurrences.length - invalidCount
  const isCustomized = (item: MeetingSeriesPreviewOccurrence) =>
    item.isCustomized || (props.occurrenceFiles[item.occurrenceKey]?.length ?? 0) > 0
  const customizedCount = props.occurrences.filter(isCustomized).length
  const filteredOccurrences =
    filter === 'ATTENTION'
      ? props.occurrences.filter((item) => !item.validation.isValid)
      : filter === 'CHANGED'
        ? props.occurrences.filter(isCustomized)
        : props.occurrences
  const visibleOccurrences = showAll
    ? filteredOccurrences
    : filteredOccurrences.slice(0, 12)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('meetings.series.redesign.previewTitle')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('meetings.series.redesign.previewDescription')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{t('meetings.series.redesign.totalCount', { count: props.occurrences.length })}</Badge>
              <Badge variant="success">
                {t('meetings.series.redesign.readyCount', { count: readyCount })}
              </Badge>
              {invalidCount > 0 ? (
                <Badge variant="destructive">
                  {t('meetings.series.redesign.attentionCount', { count: invalidCount })}
                </Badge>
              ) : null}
              {customizedCount > 0 ? (
                <Badge variant="secondary">
                  {t('meetings.series.redesign.changedCount', { count: customizedCount })}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={filter === 'ALL' ? 'default' : 'outline'}
                onClick={() => {
                  setFilter('ALL')
                  setShowAll(false)
                }}
              >
                {t('meetings.series.redesign.filterAll', { count: props.occurrences.length })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filter === 'ATTENTION' ? 'default' : 'outline'}
                onClick={() => {
                  setFilter('ATTENTION')
                  setShowAll(false)
                }}
              >
                {t('meetings.series.redesign.filterAttention', { count: invalidCount })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filter === 'CHANGED' ? 'default' : 'outline'}
                onClick={() => {
                  setFilter('CHANGED')
                  setShowAll(false)
                }}
              >
                {t('meetings.series.redesign.filterChanged', { count: customizedCount })}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={props.occurrenceView === 'LIST' ? 'default' : 'outline'}
              size="sm"
              onClick={() => props.onViewChange('LIST')}
            >
              <List aria-hidden="true" className="size-4" />
              {t('meetings.series.customize.list')}
            </Button>
            <Button
              type="button"
              variant={props.occurrenceView === 'CALENDAR' ? 'default' : 'outline'}
              size="sm"
              onClick={() => props.onViewChange('CALENDAR')}
            >
              <Grid3X3 aria-hidden="true" className="size-4" />
              {t('meetings.series.customize.calendar')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={props.onAddOccurrence}>
              <Plus aria-hidden="true" className="size-4" />
              {t('meetings.series.customize.addMeeting')}
            </Button>
          </div>
        </div>
      </Card>

      {invalidCount > 0 ? (
        <Card className="border-destructive/25 bg-destructive/[0.03] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="bg-destructive/10 text-destructive grid size-9 shrink-0 place-items-center rounded-lg">
                <AlertTriangle aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {t('meetings.series.redesign.needsAttentionTitle', { count: invalidCount })}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {invalidOccurrences[0]?.validation.issues[0]?.message ??
                    t('meetings.series.review.blocked')}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive hover:text-destructive"
              onClick={() => {
                const first = invalidOccurrences[0]
                if (first) props.onSelectOccurrence(first.occurrenceKey)
              }}
            >
              {t('meetings.series.redesign.fixFirstIssue')}
            </Button>
          </div>
        </Card>
      ) : props.occurrences.length > 0 ? (
        <Card className="border-success/25 bg-success/[0.03] p-4">
          <div className="flex items-center gap-3">
            <span className="bg-success/10 text-success grid size-9 shrink-0 place-items-center rounded-lg">
              <CheckCircle2 aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {t('meetings.series.redesign.allReadyTitle', {
                  count: props.occurrences.length,
                })}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {t('meetings.series.redesign.allReadyDescription')}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {props.bulkSelectedKeys.length > 0 ? (
        <Card className="border-primary/25 bg-primary/5 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-primary">
              {t('meetings.series.customize.selectedCount', {
                count: props.bulkSelectedKeys.length,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={props.onOpenBulkSchedule}>
                <Clock3 aria-hidden="true" className="size-3.5" />
                {t('meetings.series.customize.bulkEdit')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={props.onBulkResetSchedule}>
                <RotateCcw aria-hidden="true" className="size-3.5" />
                {t('meetings.series.customize.bulkReset')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={props.onBulkRemove}
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
                {t('meetings.series.customize.bulkRemove')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={props.onClearBulkSelection}>
                {t('meetings.series.customize.clearSelection')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {props.removedPatternExceptions.length > 0 ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              {t('meetings.series.customize.removedMeetings')}
            </span>
            {props.removedPatternExceptions.map((item) => (
              <Button
                key={item.occurrenceKey}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => props.onRestoreRemoved(item.occurrenceKey)}
              >
                <RotateCcw aria-hidden="true" className="size-3.5" />
                {t('meetings.series.customize.restoreDate', {
                  date: item.occurrenceKey.split(':')[1] ?? '',
                })}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}

      {props.previewPending ? (
        <Card className="grid min-h-56 place-items-center">
          <Loader2 aria-hidden="true" className="text-primary size-6 animate-spin" />
        </Card>
      ) : props.occurrenceView === 'CALENDAR' ? (
        <MeetingSeriesOccurrenceCalendar
          occurrences={filteredOccurrences}
          selectedOccurrenceKey={null}
          locale={props.locale}
          timeFormat={props.timeFormat}
          onSelect={props.onSelectOccurrence}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y">
            {visibleOccurrences.length === 0 ? (
              <div className="text-muted-foreground px-5 py-10 text-center text-sm">
                {t('meetings.series.redesign.noMeetingsInFilter')}
              </div>
            ) : null}
            {visibleOccurrences.map((occurrence) => {
              const customized =
                occurrence.isCustomized ||
                (props.occurrenceFiles[occurrence.occurrenceKey]?.length ?? 0) > 0
              return (
                <div
                  key={occurrence.occurrenceKey}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition sm:px-5',
                    !occurrence.validation.isValid
                      ? 'bg-destructive/[0.035]'
                      : 'hover:bg-muted/25',
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary"
                    aria-label={t('meetings.series.customize.selectOccurrence', {
                      date: formatLocalDate(occurrence.date, props.locale),
                    })}
                    checked={bulkSelected.has(occurrence.occurrenceKey)}
                    onChange={() => props.onToggleBulkOccurrence(occurrence.occurrenceKey)}
                  />

                  <button
                    type="button"
                    className="grid min-w-0 flex-1 gap-2 text-start sm:grid-cols-[minmax(9rem,0.8fr)_minmax(9rem,0.8fr)_minmax(10rem,1fr)_auto] sm:items-center"
                    onClick={() => props.onSelectOccurrence(occurrence.occurrenceKey)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {formatLocalDate(occurrence.date, props.locale)}
                      </p>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {occurrence.title}
                      </p>
                    </div>

                    <span className="text-sm font-medium tabular-nums">
                      {formatClockTime(occurrence.startTime, props.locale, props.timeFormat)} –{' '}
                      {formatClockTime(occurrence.endTime, props.locale, props.timeFormat)}
                    </span>

                    <span className="text-muted-foreground truncate text-sm">
                      {props.roomName(occurrence.roomId)}
                    </span>

                    <span className="flex items-center gap-2 sm:justify-end">
                      <Badge variant={occurrenceStateVariant(occurrence)}>
                        {!occurrence.validation.isValid
                          ? t('meetings.series.redesign.statusAttention')
                          : customized
                            ? t('meetings.series.redesign.statusChanged')
                            : t('meetings.series.redesign.statusReady')}
                      </Badge>
                    </span>
                  </button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('meetings.series.redesign.editMeeting')}
                    onClick={() => props.onSelectOccurrence(occurrence.occurrenceKey)}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              )
            })}
          </div>

          {filteredOccurrences.length > 12 ? (
            <div className="border-t p-3 text-center">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)}>
                {showAll
                  ? t('meetings.series.redesign.showLess')
                  : t('meetings.series.redesign.showAll', {
                      count: filteredOccurrences.length,
                    })}
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      <Card className="bg-background/95 sticky bottom-4 z-20 p-3 shadow-lg backdrop-blur sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={props.onBack}>
            <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
            {t('meetings.series.actions.back')}
          </Button>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="text-muted-foreground text-xs sm:text-end">
              <p>
                {t('meetings.series.redesign.actionSummary', {
                  total: props.occurrences.length,
                  ready: readyCount,
                })}
              </p>
              {invalidCount > 0 ? (
                <p className="text-destructive font-medium">
                  {t('meetings.series.redesign.attentionCount', { count: invalidCount })}
                </p>
              ) : null}
            </div>

            {invalidCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/30 text-destructive hover:text-destructive"
                onClick={() => {
                  const first = invalidOccurrences[0]
                  if (first) props.onSelectOccurrence(first.occurrenceKey)
                }}
              >
                {t('meetings.series.redesign.fixFirstIssue')}
              </Button>
            ) : null}

            <Button type="button" disabled={!props.canCreate} onClick={props.onSchedule}>
              <Check aria-hidden="true" className="size-4" />
              {t('meetings.series.actions.scheduleCount', {
                count: props.occurrences.length,
              })}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function ModeButton({
  active,
  icon: Icon,
  label,
  description,
  compact = false,
  onClick,
}: {
  active: boolean
  icon?: LucideIcon
  label: string
  description?: string
  compact?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'flex items-center rounded-xl border font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact
          ? 'min-h-14 justify-start gap-2 px-3 py-2.5 text-start text-xs'
          : 'min-h-[4.5rem] gap-3 p-3 text-start',
        active
          ? 'border-primary/45 bg-background text-foreground shadow-sm ring-1 ring-primary/10'
          : 'border-transparent bg-transparent text-foreground hover:bg-background/70',
      )}
      onClick={onClick}
    >
      {Icon ? (
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description ? (
          <span className="text-muted-foreground mt-0.5 block text-[11px] font-normal leading-4">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  )
}

function SummaryLine({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-0.5 text-sm font-semibold">{value}</p>
      </div>
    </div>
  )
}

