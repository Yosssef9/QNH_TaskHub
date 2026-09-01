import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { InputField, TextareaField } from '@/components/shared/Input'
import {
  SearchableMultiSelect,
  type SearchableSelectOption,
} from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { toApiClientError } from '@/lib/api-error'
import {
  formatRiyadhDateInput,
  riyadhLocalDateTimeToUtcIso,
} from '@/lib/date-time'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import {
  useCreateDirectMeeting,
  useCreateMeetingRequest,
  useMeetingAvailability,
  useMeetingParticipants,
} from '../hooks/use-meetings'
import type { MeetingAvailabilityInput, MeetingParticipant, MeetingTemplate } from '../types/meeting.types'

interface MeetingEditorDialogProps {
  open: boolean
  mode: 'REQUEST' | 'DIRECT'
  template?: MeetingTemplate | null
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

export function MeetingEditorDialog({ open, mode, template = null, onOpenChange }: MeetingEditorDialogProps) {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const rooms = useActiveMeetingRooms()
  const createRequest = useCreateMeetingRequest()
  const createDirect = useCreateDirectMeeting()

  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [date, setDate] = useState(todayInRiyadh)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState(() => addMinutes('09:00', template?.durationMinutes ?? 60))
  const [roomId, setRoomId] = useState<number | null>(template?.defaultRoom?.isActive ? template.defaultRoom.id : null)
  const [attendeeUserIds, setAttendeeUserIds] = useState<number[]>(() =>
    template?.attendees.map((attendee) => attendee.userId) ?? [],
  )
  const [participantSearch, setParticipantSearch] = useState('')
  const [selectedParticipantOptions, setSelectedParticipantOptions] = useState<
    SearchableSelectOption[]
  >(() => template?.attendees.map(participantOption) ?? [])

  const participantQuery = useMeetingParticipants(participantSearch, open)
  const currentUserId = currentUser.data?.user.userId
  const participantOptions = useMemo(
    () =>
      (participantQuery.data?.items ?? [])
        .filter((participant) => participant.userId !== currentUserId)
        .map(participantOption),
    [currentUserId, participantQuery.data?.items],
  )

  useEffect(() => {
    setSelectedParticipantOptions((current) => {
      const byValue = new Map(current.map((option) => [String(option.value), option]))
      participantOptions.forEach((option) => byValue.set(String(option.value), option))
      return [...byValue.values()].filter((option) => attendeeUserIds.includes(Number(option.value)))
    })
  }, [attendeeUserIds, participantOptions])

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

  const participantCount = 1 + attendeeUserIds.length
  const availabilityInput = buildAvailabilityInput({
    roomId,
    date,
    startTime,
    endTime,
    participantCount,
  })
  const availability = useMeetingAvailability(open ? availabilityInput : null)
  const saveMutation = mode === 'DIRECT' ? createDirect : createRequest
  const baseValid = title.trim().length > 0 && availabilityInput !== null
  const directValid =
    mode !== 'DIRECT' ||
    (availability.isSuccess && availability.data.canSchedule && !availability.isFetching)
  const canSubmit = baseValid && directValid && !saveMutation.isPending

  async function submit() {
    if (!availabilityInput || !canSubmit) return

    try {
      await saveMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        roomId: availabilityInput.roomId,
        startAtUtc: availabilityInput.startAtUtc,
        endAtUtc: availabilityInput.endAtUtc,
        attendeeUserIds,
      })
      toast.success(
        t(mode === 'DIRECT' ? 'meetings.directScheduled' : 'meetings.requestSubmitted'),
      )
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.errors.save'),
        }),
      )
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="w-[min(46rem,calc(100vw-2rem))]"
      >
        <div className="space-y-5 pe-1">
          <div className="pe-10">
            <DialogTitle className="text-xl font-semibold">
              {t(mode === 'DIRECT' ? 'meetings.createDirectTitle' : 'meetings.createRequestTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-sm leading-6">
              {t(
                mode === 'DIRECT'
                  ? 'meetings.createDirectDescription'
                  : 'meetings.createRequestDescription',
              )}
            </DialogDescription>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              required
              label={t('meetings.fields.title')}
              value={title}
              maxLength={250}
              onChange={(event) => setTitle(event.target.value)}
              containerClassName="sm:col-span-2"
            />
            <TextareaField
              label={t('meetings.fields.description')}
              value={description}
              maxLength={10000}
              onChange={(event) => setDescription(event.target.value)}
              containerClassName="sm:col-span-2"
            />
            <DatePicker
              required
              label={t('meetings.fields.date')}
              value={date}
              minDate={todayInRiyadh()}
              onChange={setDate}
            />
            <div className="grid grid-cols-2 gap-3">
              <InputField
                required
                type="time"
                step={1800}
                label={t('meetings.fields.startTime')}
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
              <InputField
                required
                type="time"
                step={1800}
                label={t('meetings.fields.endTime')}
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t('meetings.fields.room')}
                <span aria-hidden="true" className="text-destructive ms-1">
                  *
                </span>
              </label>
              <SearchableMultiSelect
                value={roomId}
                options={roomOptions}
                placeholder={t('meetings.fields.roomPlaceholder')}
                searchPlaceholder={t('meetings.fields.roomSearch')}
                noResultsText={t('meetings.noActiveRooms')}
                disabled={rooms.isPending || roomOptions.length === 0}
                onChange={(value) => setRoomId(value === null ? null : Number(value))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t('meetings.fields.attendees')}
              </label>
              <SearchableMultiSelect
                multiple
                values={attendeeUserIds}
                options={participantOptions}
                selectedOptions={selectedParticipantOptions}
                placeholder={t('meetings.fields.attendeesPlaceholder')}
                searchPlaceholder={t('meetings.fields.attendeesSearch')}
                noResultsText={t('meetings.fields.noAttendees')}
                searchValue={participantSearch}
                loading={participantQuery.isFetching}
                onSearchChange={setParticipantSearch}
                onChange={(values) => setAttendeeUserIds(values.map(Number))}
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                {t('meetings.participantCount', { count: participantCount })}
              </p>
            </div>
          </div>

          {availabilityInput ? (
            <div
              className={
                availability.data?.canSchedule
                  ? 'border-success/30 bg-success/5 text-success flex gap-2 rounded-lg border p-3 text-sm'
                  : 'border-warning/40 bg-warning/5 text-foreground flex gap-2 rounded-lg border p-3 text-sm'
              }
            >
              {availability.isFetching ? (
                <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin" />
              ) : availability.data?.canSchedule ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertTriangle aria-hidden="true" className="text-warning mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <p className="font-medium">
                  {availability.isFetching
                    ? t('meetings.availability.checking')
                    : availabilityMessage ?? t('meetings.availability.unavailable')}
                </p>
                {mode === 'REQUEST' && availability.data && !availability.data.canSchedule ? (
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {t('meetings.availability.requestCanContinue')}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              variant="outline"
              disabled={saveMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button disabled={!canSubmit} onClick={() => void submit()}>
              {saveMutation.isPending ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              {t(mode === 'DIRECT' ? 'meetings.scheduleNow' : 'meetings.submitRequest')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

