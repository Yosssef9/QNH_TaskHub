import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { toApiClientError } from '@/lib/api-error'
import {
  formatRiyadhDateInput,
  formatRiyadhTimeInput,
  riyadhLocalDateTimeToUtcIso,
} from '@/lib/date-time'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import {
  useMeetingAvailability,
  useUpdatePendingMeetingSchedule,
} from '../hooks/use-meetings'
import type { MeetingAvailabilityInput, MeetingSummary } from '../types/meeting.types'

interface CoordinatorMeetingScheduleDialogProps {
  meeting: MeetingSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}

function availabilityInput(input: {
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

export function CoordinatorMeetingScheduleDialog({
  meeting,
  open,
  onOpenChange,
}: CoordinatorMeetingScheduleDialogProps) {
  const { i18n, t } = useTranslation()
  const rooms = useActiveMeetingRooms()
  const updateSchedule = useUpdatePendingMeetingSchedule()

  const [roomId, setRoomId] = useState<number | null>(meeting.room.id)
  const [date, setDate] = useState(() => formatRiyadhDateInput(meeting.startAtUtc))
  const [startTime, setStartTime] = useState(() => formatRiyadhTimeInput(meeting.startAtUtc))
  const [endTime, setEndTime] = useState(() => formatRiyadhTimeInput(meeting.endAtUtc))
  const [schedulingNotes, setSchedulingNotes] = useState(meeting.schedulingNotes ?? '')

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

  const checkInput = availabilityInput({
    roomId,
    date,
    startTime,
    endTime,
    participantCount: meeting.participantCount,
  })
  const availability = useMeetingAvailability(open ? checkInput : null)
  const canSave = checkInput !== null && !updateSchedule.isPending

  async function save() {
    if (!checkInput || !canSave) return
    try {
      await updateSchedule.mutateAsync({
        meetingId: meeting.id,
        revisionId: meeting.revisionId,
        revisionRowVersion: meeting.revisionRowVersion,
        roomId: checkInput.roomId,
        startAtUtc: checkInput.startAtUtc,
        endAtUtc: checkInput.endAtUtc,
        schedulingNotes: schedulingNotes.trim() || null,
      })
      toast.success(t('meetings.scheduleUpdated'))
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.errors.scheduleUpdate'),
        }),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="w-[min(42rem,calc(100vw-2rem))]"
      >
        <div className="space-y-5 pe-1">
          <div className="pe-10">
            <DialogTitle className="text-xl font-semibold">
              {t('meetings.coordinatorEditTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-sm leading-6">
              {t('meetings.coordinatorEditDescription', { title: meeting.title })}
            </DialogDescription>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">
                {t('meetings.fields.room')}
              </label>
              <SearchableMultiSelect
                value={roomId}
                options={roomOptions}
                placeholder={t('meetings.fields.roomPlaceholder')}
                searchPlaceholder={t('meetings.fields.roomSearch')}
                noResultsText={t('meetings.noActiveRooms')}
                onChange={(value) => setRoomId(value === null ? null : Number(value))}
              />
            </div>
            <DatePicker
              required
              label={t('meetings.fields.date')}
              value={date}
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
            <TextareaField
              label={t('meetings.fields.schedulingNotes')}
              value={schedulingNotes}
              maxLength={1000}
              onChange={(event) => setSchedulingNotes(event.target.value)}
              containerClassName="sm:col-span-2"
            />
          </div>

          {checkInput ? (
            <div
              className={
                availability.data?.canSchedule
                  ? 'border-success/30 bg-success/5 text-success flex gap-2 rounded-lg border p-3 text-sm'
                  : 'border-warning/40 bg-warning/10 text-warning-foreground flex gap-2 rounded-lg border p-3 text-sm'
              }
            >
              {availability.isFetching ? (
                <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin" />
              ) : availability.data?.canSchedule ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <p className="font-medium">
                  {availability.isFetching
                    ? t('meetings.availability.checking')
                    : availability.data?.canSchedule
                      ? t('meetings.availability.available')
                      : !availability.data?.hasCapacity
                        ? t('meetings.availability.capacity', {
                            capacity: availability.data?.roomCapacity,
                            participants: meeting.participantCount,
                          })
                        : t('meetings.availability.busy')}
                </p>
                {availability.data && !availability.data.canSchedule ? (
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {t('meetings.availability.coordinatorCanSavePending')}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              variant="outline"
              disabled={updateSchedule.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button disabled={!canSave} onClick={() => void save()}>
              {updateSchedule.isPending ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
