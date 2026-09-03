import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus2,
  CheckCircle2,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { InputField, TextareaField } from '@/components/shared/Input'
import {
  SearchableMultiSelect,
  type SearchableSelectOption,
} from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { cn } from '@/lib/cn'
import { toApiClientError } from '@/lib/api-error'
import { formatClockTime, formatRiyadhDateInput, riyadhLocalDateTimeToUtcIso } from '@/lib/date-time'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import {
  useCreateDirectMeeting,
  useCreateMeetingRequest,
  useMeetingAvailability,
  useMeetingParticipants,
  useMeetingTemplates,
  useUploadMeetingAttachment,
  meetingsQueryKey,
} from '../hooks/use-meetings'
import {
  MEETING_ATTACHMENT_EXTENSIONS,
  MEETING_ATTACHMENT_MAX_COUNT,
  formatMeetingAttachmentBytes,
  validateMeetingAttachmentFile,
} from '../meeting-attachment-policy'
import type {
  MeetingAvailabilityInput,
  MeetingParticipant,
  MeetingTemplate,
} from '../types/meeting.types'
import {
  MeetingAgendaEditor,
  type MeetingAgendaDraftItem,
} from './MeetingAgendaEditor'
import { MeetingParticipantPicker } from './MeetingParticipantPicker'
import {
  MeetingSchedulePicker,
  type MeetingScheduleFocusField,
  type MeetingScheduleValidationErrors,
} from './MeetingSchedulePicker'

type MeetingEditorFocusMode = 'NONE' | 'DETAILS' | 'SCHEDULE'

interface MeetingEditorValidationErrors extends MeetingScheduleValidationErrors {
  title?: string
}

export interface MeetingEditorInitialSchedule {
  date: string
  startTime: string
  endTime: string
  roomId?: number | null
}

interface MeetingEditorDialogProps {
  open: boolean
  mode: 'REQUEST' | 'DIRECT'
  template?: MeetingTemplate | null
  initialSchedule?: MeetingEditorInitialSchedule | null
  onOpenChange: (open: boolean) => void
}

function todayInRiyadh(): string {
  return formatRiyadhDateInput(new Date())
}

function addMinutes(time: string, minutes: number): string {
  const [hoursText, minutesText] = time.split(':')
  const hours = Number(hoursText ?? 0)
  const currentMinutes = Number(minutesText ?? 0)
  const total = Math.min(23 * 60 + 59, hours * 60 + currentMinutes + minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function durationBetweenTimes(startTime: string, endTime: string): number {
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)
  return Math.max(
    1,
    (endHours || 0) * 60 + (endMinutes || 0) - ((startHours || 0) * 60 + (startMinutes || 0)),
  )
}

function participantOption(participant: MeetingParticipant): SearchableSelectOption {
  return {
    value: participant.userId,
    label: participant.userName,
    description: participant.userCode,
  }
}

function buildAvailabilityInput(input: {
  roomId: number | null
  date: string
  startTime: string
  endTime: string
  participantCount: number
}): MeetingAvailabilityInput | null {
  if (!input.roomId || !input.date || !input.startTime || !input.endTime) return null

  try {
    const startAtUtc = riyadhLocalDateTimeToUtcIso(input.date, input.startTime)
    const endAtUtc = riyadhLocalDateTimeToUtcIso(input.date, input.endTime)
    if (new Date(endAtUtc).getTime() <= new Date(startAtUtc).getTime()) return null

    return {
      roomId: input.roomId,
      startAtUtc,
      endAtUtc,
      participantCount: input.participantCount,
    }
  } catch {
    return null
  }
}

function formatSelectedDate(date: string, locale: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12))
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value)
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function MeetingEditorDialog({
  open,
  mode,
  template = null,
  initialSchedule = null,
  onOpenChange,
}: MeetingEditorDialogProps) {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const rooms = useActiveMeetingRooms()
  const templates = useMeetingTemplates(open)
  const createRequest = useCreateMeetingRequest()
  const createDirect = useCreateDirectMeeting()
  const uploadAttachment = useUploadMeetingAttachment()
  const queryClient = useQueryClient()
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(template?.id ?? null)
  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaDraftItem[]>([])
  const [agendaErrors, setAgendaErrors] = useState<Record<string, string>>({})
  const [agendaFocusItemId, setAgendaFocusItemId] = useState<string | null>(null)
  const [agendaFocusRequestId, setAgendaFocusRequestId] = useState(0)
  const [date, setDate] = useState(() => initialSchedule?.date ?? todayInRiyadh())
  const [startTime, setStartTime] = useState(() => initialSchedule?.startTime ?? '09:00')
  const [endTime, setEndTime] = useState(() =>
    initialSchedule?.endTime ?? addMinutes('09:00', template?.durationMinutes ?? 60),
  )
  const [roomId, setRoomId] = useState<number | null>(() =>
    initialSchedule?.roomId ?? (template?.defaultRoom?.isActive ? template.defaultRoom.id : null),
  )
  const [attendeeUserIds, setAttendeeUserIds] = useState<number[]>(() =>
    template?.attendees.map((attendee) => attendee.userId) ?? [],
  )
  const [participantSearch, setParticipantSearch] = useState('')
  const [selectedParticipantOptions, setSelectedParticipantOptions] = useState<
    SearchableSelectOption[]
  >(() => template?.attendees.map(participantOption) ?? [])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [focusMode, setFocusMode] = useState<MeetingEditorFocusMode>('NONE')
  const [validationErrors, setValidationErrors] = useState<MeetingEditorValidationErrors>({})
  const [scheduleFocusField, setScheduleFocusField] = useState<MeetingScheduleFocusField>(null)
  const [scheduleFocusRequestId, setScheduleFocusRequestId] = useState(0)

  const participantQuery = useMeetingParticipants(participantSearch, open)
  const currentUserId = currentUser.data?.user.userId
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
    () =>
      selectedParticipantOptions.filter((option) => attendeeUserIds.includes(Number(option.value))),
    [attendeeUserIds, selectedParticipantOptions],
  )

  const agendaParticipants = useMemo<MeetingParticipant[]>(() => {
    const values: MeetingParticipant[] = []
    const user = currentUser.data?.user
    if (user) {
      values.push({
        userId: user.userId,
        userCode: user.userCode,
        userName: user.userName,
      })
    }

    for (const option of selectedAttendeeOptions) {
      values.push({
        userId: Number(option.value),
        userCode: option.description ?? '',
        userName: option.label,
      })
    }

    return values
  }, [currentUser.data?.user, selectedAttendeeOptions])

  const templateOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (templates.data ?? []).map((item) => ({
        value: item.id,
        label: item.name,
        description: `${item.title} · ${t('meetings.templates.durationValue', { count: item.durationMinutes })}`,
      })),
    [t, templates.data],
  )

  const participantCount = 1 + attendeeUserIds.length
  const meetingDurationMinutes = durationBetweenTimes(startTime, endTime)
  const selectedRoom = (rooms.data ?? []).find((room) => room.id === roomId) ?? null
  const roomName = selectedRoom
    ? i18n.language.startsWith('ar')
      ? selectedRoom.nameAr
      : selectedRoom.nameEn
    : null
  const locale = i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-SA'
  const timeFormat = currentUser.data?.preferences.timeFormat ?? '12H'
  const selectedTimeSummary = `${formatClockTime(startTime, locale, timeFormat)} – ${formatClockTime(endTime, locale, timeFormat)}`
  const editorGridClass =
    focusMode === 'DETAILS'
      ? 'xl:grid-cols-[minmax(0,1fr)_12rem]'
      : focusMode === 'SCHEDULE'
        ? 'xl:grid-cols-[12rem_minmax(0,1fr)]'
        : 'xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.3fr)]'

  const availabilityInput = buildAvailabilityInput({
    roomId,
    date,
    startTime,
    endTime,
    participantCount,
  })
  const availability = useMeetingAvailability(open ? availabilityInput : null)
  const saveMutation = mode === 'DIRECT' ? createDirect : createRequest
  const isSaving = saveMutation.isPending || uploadAttachment.isPending

  function applyTemplate(selected: MeetingTemplate) {
    setValidationErrors({})
    setSelectedTemplateId(selected.id)
    setTitle(selected.title)
    setDescription(selected.description ?? '')
    setAgendaItems([])
    setAgendaErrors({})
    setRoomId(selected.defaultRoom?.isActive ? selected.defaultRoom.id : null)
    setAttendeeUserIds(selected.attendees.map((attendee) => attendee.userId))
    setSelectedParticipantOptions(selected.attendees.map(participantOption))
    setEndTime(addMinutes(startTime, selected.durationMinutes))
  }

  function updateAttendees(values: Array<string | number>) {
    setValidationErrors((current) => ({ ...current, capacity: undefined }))
    const ids = values.map(Number)
    setAttendeeUserIds(ids)
    setSelectedParticipantOptions((current) => {
      const byValue = new Map(current.map((option) => [String(option.value), option]))
      participantOptions.forEach((option) => byValue.set(String(option.value), option))
      return ids
        .map((id) => byValue.get(String(id)))
        .filter((option): option is SearchableSelectOption => Boolean(option))
    })
  }

  function addPendingFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    const existingKeys = new Set(pendingFiles.map(fileKey))
    const nextFiles = [...pendingFiles]

    for (const file of Array.from(files)) {
      if (nextFiles.length >= MEETING_ATTACHMENT_MAX_COUNT) {
        toast.error(t('meetings.create.attachmentLimit', { count: MEETING_ATTACHMENT_MAX_COUNT }))
        break
      }
      if (existingKeys.has(fileKey(file))) continue

      const validationError = validateMeetingAttachmentFile(file)
      if (validationError === 'TYPE') {
        toast.error(t('meetings.files.errors.type'))
        continue
      }
      if (validationError === 'SIZE') {
        toast.error(t('meetings.files.errors.tooLarge'))
        continue
      }

      existingKeys.add(fileKey(file))
      nextFiles.push(file)
    }

    setPendingFiles(nextFiles)
    if (attachmentInputRef.current) attachmentInputRef.current.value = ''
  }

  function clearValidationError(field: keyof MeetingEditorValidationErrors) {
    setValidationErrors((current) => {
      if (!current[field]) return current
      return { ...current, [field]: undefined }
    })
  }

  function clearAgendaError(clientId: string) {
    setAgendaErrors((current) => {
      if (!current[clientId]) return current
      const next = { ...current }
      delete next[clientId]
      return next
    })
  }

  function focusAgendaError(clientId: string) {
    setFocusMode('DETAILS')
    setAgendaFocusItemId(clientId)
    setAgendaFocusRequestId((current) => current + 1)
  }

  function focusValidationError(field: 'title' | Exclude<MeetingScheduleFocusField, null>) {
    if (field === 'title') {
      setFocusMode('DETAILS')
      window.requestAnimationFrame(() => {
        titleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        titleInputRef.current?.focus()
      })
      return
    }

    setFocusMode('SCHEDULE')
    setScheduleFocusField(field)
    setScheduleFocusRequestId((current) => current + 1)
  }

  function validateBeforeSubmit(): boolean {
    const nextErrors: MeetingEditorValidationErrors = {}

    if (!title.trim()) nextErrors.title = t('meetings.create.validation.titleRequired')

    const nextAgendaErrors = Object.fromEntries(
      agendaItems
        .filter((item) => !item.topic.trim())
        .map((item) => [
          item.clientId,
          t('meetings.create.agenda.topicRequired'),
        ]),
    )
    setAgendaErrors(nextAgendaErrors)

    if (!date) nextErrors.date = t('meetings.create.validation.dateRequired')
    if (!roomId) nextErrors.room = t('meetings.create.validation.roomRequired')

    const startMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5))
    const endMinutes = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5))
    if (!startTime || !endTime || endMinutes <= startMinutes) {
      nextErrors.duration = t('meetings.create.validation.durationRequired')
    } else if (roomId && !availabilityInput) {
      nextErrors.time = t('meetings.create.validation.timeRequired')
    }

    if (mode === 'DIRECT' && selectedRoom && selectedRoom.capacity < participantCount) {
      nextErrors.capacity = t('meetings.create.validation.capacity', {
        participants: participantCount,
        capacity: selectedRoom.capacity,
      })
    }

    if (mode === 'DIRECT' && availabilityInput && !nextErrors.capacity) {
      if (availability.isFetching || availability.isPending) {
        nextErrors.time = t('meetings.create.validation.availabilityChecking')
      } else if (availability.isError || !availability.data) {
        nextErrors.time = t('meetings.create.validation.availabilityCheckFailed')
      } else if (!availability.data.isRoomActive) {
        nextErrors.room = t('meetings.availability.inactive')
      } else if (!availability.data.hasCapacity) {
        nextErrors.capacity = t('meetings.create.validation.capacity', {
          participants: availability.data.participantCount,
          capacity: availability.data.roomCapacity,
        })
      } else if (!availability.data.isAvailable) {
        nextErrors.time = t('meetings.create.validation.timeBusy')
      }
    }

    setValidationErrors(nextErrors)
    const order: Array<'title' | Exclude<MeetingScheduleFocusField, null>> = [
      'title',
      'date',
      'room',
      'capacity',
      'duration',
      'time',
    ]
    const firstFieldError = order.find((field) => field && nextErrors[field])
    const firstAgendaError = agendaItems.find((item) => nextAgendaErrors[item.clientId])

    if (!firstFieldError && !firstAgendaError) return true

    const errorCount =
      Object.values(nextErrors).filter(Boolean).length + Object.keys(nextAgendaErrors).length
    toast.error(
      t(
        errorCount === 1
          ? 'meetings.create.validation.fixOne'
          : 'meetings.create.validation.fixMany',
        { count: errorCount },
      ),
    )

    if (firstFieldError === 'title') {
      focusValidationError('title')
    } else if (firstAgendaError) {
      focusAgendaError(firstAgendaError.clientId)
    } else if (firstFieldError) {
      focusValidationError(firstFieldError)
    }
    return false
  }

  async function submit() {
    if (isSaving || !validateBeforeSubmit() || !availabilityInput) return

    try {
      const meeting = await saveMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        roomId: availabilityInput.roomId,
        startAtUtc: availabilityInput.startAtUtc,
        endAtUtc: availabilityInput.endAtUtc,
        attendeeUserIds,
        agendaItems: agendaItems.map((item) => ({
          topic: item.topic.trim(),
          presenterUserId: item.presenterUserId,
          plannedDurationMinutes: item.plannedDurationMinutes,
        })),
      })

      let failedUploads = 0
      for (const file of pendingFiles) {
        try {
          await uploadAttachment.mutateAsync({ meetingId: meeting.id, file })
        } catch {
          failedUploads += 1
        }
      }

      toast.success(
        t(mode === 'DIRECT' ? 'meetings.directScheduled' : 'meetings.requestSubmitted'),
      )
      if (failedUploads > 0) {
        toast.error(
          t('meetings.create.attachmentsUploadFailed', {
            count: failedUploads,
          }),
        )
      }
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      const message = t(`meetings.errors.${apiError.code}`, {
        defaultValue: t('meetings.errors.save'),
      })

      if (apiError.code === 'MEETING_ROOM_TIME_CONFLICT' || apiError.code === 'MEETING_ROOM_SCHEDULE_BUSY') {
        setValidationErrors((current) => ({ ...current, time: message }))
        focusValidationError('time')
        void queryClient.invalidateQueries({ queryKey: meetingsQueryKey })
      } else if (apiError.code === 'MEETING_ROOM_CAPACITY_EXCEEDED') {
        setValidationErrors((current) => ({ ...current, capacity: message }))
        focusValidationError('capacity')
      } else if (apiError.code === 'ACTIVE_MEETING_ROOM_REQUIRED') {
        setValidationErrors((current) => ({ ...current, room: message }))
        focusValidationError('room')
      }

      toast.error(message)
    }
  }

  const availabilityMessage = availability.data
    ? availability.data.canSchedule
      ? t('meetings.availability.available')
      : !availability.data.isRoomActive
        ? t('meetings.availability.inactive')
        : !availability.data.hasCapacity
          ? t('meetings.availability.capacity', {
              capacity: availability.data.roomCapacity,
              participants: availability.data.participantCount,
            })
          : t('meetings.availability.busy')
    : null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isSaving) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="max-h-[96vh] w-[min(88rem,calc(100vw-1rem))] overflow-hidden p-0"
      >
        <div className="min-h-0">
          <header className="border-b px-5 py-5 pe-14 sm:px-6 sm:py-6 sm:pe-16">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
                  <CalendarPlus2 aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-xl font-semibold sm:text-2xl">
                      {t(
                        mode === 'DIRECT'
                          ? 'meetings.createDirectTitle'
                          : 'meetings.createRequestTitle',
                      )}
                    </DialogTitle>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                        mode === 'DIRECT'
                          ? 'bg-success/10 text-success'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      {t(
                        mode === 'DIRECT'
                          ? 'meetings.create.directBadge'
                          : 'meetings.create.requestBadge',
                      )}
                    </span>
                  </div>
                  <DialogDescription className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
                    {t(
                      mode === 'DIRECT'
                        ? 'meetings.createDirectDescription'
                        : 'meetings.createRequestDescription',
                    )}
                  </DialogDescription>
                </div>
              </div>
            </div>
          </header>

          <div
            className={cn(
              'grid min-h-0 transition-[grid-template-columns] duration-300 ease-out',
              editorGridClass,
            )}
          >
            {focusMode !== 'SCHEDULE' ? (
              <section className="space-y-6 border-b p-5 sm:p-6 xl:border-e xl:border-b-0 xl:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl">
                    <UsersRound aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold">{t('meetings.create.detailsTitle')}</h2>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">
                      {t('meetings.create.detailsDescription')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-pressed={focusMode === 'DETAILS'}
                  disabled={isSaving}
                  onClick={() => setFocusMode((current) => (current === 'DETAILS' ? 'NONE' : 'DETAILS'))}
                >
                  {focusMode === 'DETAILS' ? (
                    <Minimize2 aria-hidden="true" className="size-4" />
                  ) : (
                    <Maximize2 aria-hidden="true" className="size-4" />
                  )}
                  {t(
                    focusMode === 'DETAILS'
                      ? 'meetings.create.showBothSections'
                      : 'meetings.create.focusSection',
                  )}
                </Button>
              </div>

              {templateOptions.length > 0 || templates.isFetching ? (
                <div className="bg-muted/30 rounded-xl border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles aria-hidden="true" className="text-primary size-4" />
                    <div>
                      <p className="text-sm font-semibold">{t('meetings.create.startFromTemplate')}</p>
                      <p className="text-muted-foreground text-xs">
                        {t('meetings.create.templateHint')}
                      </p>
                    </div>
                  </div>
                  <SearchableMultiSelect
                    value={selectedTemplateId}
                    options={templateOptions}
                    placeholder={t('meetings.create.templatePlaceholder')}
                    searchPlaceholder={t('meetings.create.templateSearch')}
                    noResultsText={t('meetings.create.noTemplates')}
                    loading={templates.isFetching}
                    onChange={(value) => {
                      if (value === null) {
                        setSelectedTemplateId(null)
                        return
                      }
                      const selected = templates.data?.find((item) => item.id === Number(value))
                      if (selected) applyTemplate(selected)
                    }}
                  />
                </div>
              ) : null}

              <div className="space-y-4">
                <InputField
                  ref={titleInputRef}
                  required
                  label={t('meetings.fields.title')}
                  value={title}
                  maxLength={250}
                  error={validationErrors.title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    if (event.target.value.trim()) clearValidationError('title')
                  }}
                />
                <TextareaField
                  label={t('meetings.fields.descriptionPurpose')}
                  value={description}
                  maxLength={10000}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t('meetings.fields.attendees')}
                </label>
                <MeetingParticipantPicker
                  values={attendeeUserIds}
                  options={participantOptions}
                  selectedOptions={selectedParticipantOptions}
                  searchValue={participantSearch}
                  participantCount={participantCount}
                  roomCapacity={selectedRoom?.capacity ?? null}
                  loading={participantQuery.isPending}
                  loadingMore={participantQuery.isFetchingNextPage}
                  hasMore={participantQuery.hasNextPage}
                  disabled={isSaving}
                  onSearchChange={setParticipantSearch}
                  onLoadMore={() => {
                    void participantQuery.fetchNextPage()
                  }}
                  onChange={updateAttendees}
                />
                <p className="text-muted-foreground mt-2 text-xs leading-5">
                  {t('meetings.create.organizerCounts')}
                </p>
              </div>

              <MeetingAgendaEditor
                items={agendaItems}
                participants={agendaParticipants}
                organizerUserId={currentUserId ?? null}
                meetingDurationMinutes={meetingDurationMinutes}
                disabled={isSaving}
                errors={agendaErrors}
                focusItemId={agendaFocusItemId}
                focusRequestId={agendaFocusRequestId}
                onChange={setAgendaItems}
                onErrorClear={clearAgendaError}
              />

              <div className="border-t pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Paperclip aria-hidden="true" className="text-muted-foreground mt-0.5 size-4" />
                    <div>
                      <p className="text-sm font-semibold">{t('meetings.create.attachments')}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                        {t('meetings.create.attachmentsHint')}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSaving || pendingFiles.length >= MEETING_ATTACHMENT_MAX_COUNT}
                    onClick={() => attachmentInputRef.current?.click()}
                  >
                    <Paperclip aria-hidden="true" className="size-4" />
                    {t('meetings.create.addFiles')}
                  </Button>
                </div>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept={MEETING_ATTACHMENT_EXTENSIONS.join(',')}
                  onChange={(event) => addPendingFiles(event.target.files)}
                />

                {pendingFiles.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {pendingFiles.map((file) => (
                      <div
                        key={fileKey(file)}
                        className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                      >
                        <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-lg">
                          <FileText aria-hidden="true" className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{file.name}</p>
                          <p className="text-muted-foreground mt-0.5 text-[11px]">
                            {formatMeetingAttachmentBytes(file.size)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('meetings.create.removeFile', { name: file.name })}
                          disabled={isSaving}
                          onClick={() =>
                            setPendingFiles((current) =>
                              current.filter((item) => fileKey(item) !== fileKey(file)),
                            )
                          }
                        >
                          <X aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
            ) : (
              <aside className="bg-background flex min-h-44 flex-col justify-between gap-5 border-b p-4 xl:min-h-full xl:border-e xl:border-b-0">
                <div>
                  <span className="bg-muted text-muted-foreground grid size-9 place-items-center rounded-lg">
                    <UsersRound aria-hidden="true" className="size-4" />
                  </span>
                  <p className="text-muted-foreground mt-4 text-[11px] font-semibold tracking-wide uppercase">
                    {t('meetings.create.detailsTitle')}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm font-semibold">
                    {title.trim() || t('meetings.create.detailsSummaryEmpty')}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs leading-5">
                    {t('meetings.create.attendeeSummary', {
                      attendees: attendeeUserIds.length,
                      participants: participantCount,
                    })}
                  </p>
                  {agendaItems.length > 0 ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('meetings.create.agenda.topicCount', { count: agendaItems.length })}
                    </p>
                  ) : null}
                  {pendingFiles.length > 0 ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('meetings.create.pendingFilesSummary', { count: pendingFiles.length })}
                    </p>
                  ) : null}
                </div>
                <Button variant="outline" size="sm" onClick={() => setFocusMode('DETAILS')}>
                  <Maximize2 aria-hidden="true" className="size-4" />
                  {t('meetings.create.expandSection')}
                </Button>
              </aside>
            )}

            {focusMode !== 'DETAILS' ? (
              <MeetingSchedulePicker
                date={date}
                roomId={roomId}
                rooms={rooms.data ?? []}
                participantCount={participantCount}
                startTime={startTime}
                endTime={endTime}
                disabled={isSaving}
                allowBusySelection={mode === 'REQUEST'}
                focused={focusMode === 'SCHEDULE'}
                validationErrors={validationErrors}
                focusField={scheduleFocusField}
                focusRequestId={scheduleFocusRequestId}
                onValidationClear={clearValidationError}
                onFocusToggle={() =>
                  setFocusMode((current) => (current === 'SCHEDULE' ? 'NONE' : 'SCHEDULE'))
                }
                onDateChange={(nextDate) => {
                  setDate(nextDate)
                  if (nextDate) clearValidationError('date')
                }}
                onRoomChange={(nextRoomId) => {
                  setRoomId(nextRoomId)
                  if (nextRoomId) clearValidationError('room')
                  clearValidationError('capacity')
                  clearValidationError('time')
                }}
                onTimeChange={(nextStart, nextEnd) => {
                  setStartTime(nextStart)
                  setEndTime(nextEnd)
                  clearValidationError('duration')
                  clearValidationError('time')
                }}
              />
            ) : (
              <aside className="bg-muted/20 flex min-h-44 flex-col justify-between gap-5 border-b p-4 xl:min-h-full xl:border-b-0">
                <div>
                  <span className="bg-primary/10 text-primary grid size-9 place-items-center rounded-lg">
                    <CalendarDays aria-hidden="true" className="size-4" />
                  </span>
                  <p className="text-muted-foreground mt-4 text-[11px] font-semibold tracking-wide uppercase">
                    {t('meetings.create.scheduleTitle')}
                  </p>
                  <p className="mt-2 text-sm font-semibold">{formatSelectedDate(date, locale)}</p>
                  <p className="mt-1 text-xs font-medium tabular-nums">{selectedTimeSummary}</p>
                  <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-5">
                    {roomName ?? t('meetings.create.scheduleSummaryEmpty')}
                  </p>
                  {selectedRoom ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('meetings.create.capacitySummary', {
                        participants: participantCount,
                        capacity: selectedRoom.capacity,
                      })}
                    </p>
                  ) : null}
                </div>
                <Button variant="outline" size="sm" onClick={() => setFocusMode('SCHEDULE')}>
                  <Maximize2 aria-hidden="true" className="size-4" />
                  {t('meetings.create.expandSection')}
                </Button>
              </aside>
            )}
          </div>

          <footer className="bg-background/95 sticky bottom-0 z-10 border-t px-5 py-4 backdrop-blur sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold">{t('meetings.create.summaryTitle')}</span>
                  {availabilityInput && roomName ? (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span>{formatSelectedDate(date, locale)}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="font-medium tabular-nums">
                        {selectedTimeSummary}
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span>{roomName}</span>
                      <span className="text-muted-foreground">•</span>
                      <span>{t('meetings.participantCount', { count: participantCount })}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('meetings.create.summaryIncomplete')}
                    </span>
                  )}
                </div>

                {availabilityInput ? (
                  <div className="mt-2 flex items-start gap-2 text-xs">
                    {availability.isFetching ? (
                      <Loader2
                        aria-hidden="true"
                        className="text-muted-foreground mt-0.5 size-3.5 shrink-0 animate-spin"
                      />
                    ) : availability.data?.canSchedule ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="text-success mt-0.5 size-3.5 shrink-0"
                      />
                    ) : (
                      <AlertTriangle
                        aria-hidden="true"
                        className="text-warning mt-0.5 size-3.5 shrink-0"
                      />
                    )}
                    <div>
                      <span
                        className={cn(
                          'font-medium',
                          availability.data?.canSchedule ? 'text-success' : 'text-foreground',
                        )}
                      >
                        {availability.isFetching
                          ? t('meetings.availability.checking')
                          : availabilityMessage ?? t('meetings.availability.unavailable')}
                      </span>
                      {mode === 'REQUEST' && availability.data && !availability.data.canSchedule ? (
                        <span className="text-muted-foreground ms-1">
                          {t('meetings.availability.requestCanContinue')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => onOpenChange(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button disabled={isSaving} onClick={() => void submit()}>
                  {isSaving ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : null}
                  {t(mode === 'DIRECT' ? 'meetings.scheduleNow' : 'meetings.submitRequest')}
                </Button>
              </div>
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}


