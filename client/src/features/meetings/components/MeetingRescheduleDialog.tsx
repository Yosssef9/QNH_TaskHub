import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { InputField } from '@/components/shared/Input'
import { SearchableMultiSelect, type SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { toApiClientError } from '@/lib/api-error'
import { formatRiyadhDateInput, formatRiyadhTimeInput, riyadhLocalDateTimeToUtcIso } from '@/lib/date-time'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import { useMeetingAvailability, useRequestMeetingReschedule } from '../hooks/use-meetings'
import type { MeetingDetail } from '../types/meeting.types'

export function MeetingRescheduleDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: MeetingDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const mutation = useRequestMeetingReschedule()
  const rooms = useActiveMeetingRooms()
  const meeting = detail.meeting
  const [date, setDate] = useState(() => formatRiyadhDateInput(meeting.startAtUtc))
  const [startTime, setStartTime] = useState(() => formatRiyadhTimeInput(meeting.startAtUtc))
  const [endTime, setEndTime] = useState(() => formatRiyadhTimeInput(meeting.endAtUtc))
  const [roomId, setRoomId] = useState<number | null>(meeting.room.id)

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

  let availabilityInput = null
  if (roomId) {
    try {
      const startAtUtc = riyadhLocalDateTimeToUtcIso(date, startTime)
      const endAtUtc = riyadhLocalDateTimeToUtcIso(date, endTime)
      if (new Date(endAtUtc).getTime() > new Date(startAtUtc).getTime()) {
        availabilityInput = {
          roomId,
          startAtUtc,
          endAtUtc,
          participantCount: meeting.participantCount,
        }
      }
    } catch {
      availabilityInput = null
    }
  }
  const availability = useMeetingAvailability(open ? availabilityInput : null)

  async function submit() {
    if (!availabilityInput) return
    try {
      await mutation.mutateAsync({
        meetingId: meeting.id,
        meetingRowVersion: meeting.meetingRowVersion,
        roomId: availabilityInput.roomId,
        startAtUtc: availabilityInput.startAtUtc,
        endAtUtc: availabilityInput.endAtUtc,
      })
      toast.success(t('meetings.workspace.rescheduleRequested'))
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(t(`meetings.errors.${apiError.code}`, { defaultValue: t('meetings.workspace.rescheduleError') }))
    }
  }

  const canSubmit = availabilityInput !== null && !mutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" className="w-[min(42rem,calc(100vw-2rem))]">
        <div className="pe-10">
          <DialogTitle>{t('meetings.workspace.rescheduleTitle')}</DialogTitle>
          <DialogDescription className="mt-1">
            {t('meetings.workspace.rescheduleDescription')}
          </DialogDescription>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <DatePicker required label={t('meetings.fields.date')} value={date} onChange={setDate} />
          <div className="grid grid-cols-2 gap-3">
            <InputField required type="time" step={1800} label={t('meetings.fields.startTime')} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            <InputField required type="time" step={1800} label={t('meetings.fields.endTime')} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">{t('meetings.fields.room')}</label>
            <SearchableMultiSelect
              value={roomId}
              options={roomOptions}
              placeholder={t('meetings.fields.roomPlaceholder')}
              searchPlaceholder={t('meetings.fields.roomSearch')}
              noResultsText={t('meetings.noActiveRooms')}
              onChange={(value) => setRoomId(value === null ? null : Number(value))}
            />
          </div>
        </div>

        {availability.data ? (
          <div className={`mt-4 flex gap-2 rounded-lg border p-3 text-sm ${availability.data.canSchedule ? 'bg-success/8' : 'bg-warning/8'}`}>
            {availability.data.canSchedule ? <CheckCircle2 className="text-success size-4 shrink-0" /> : <AlertTriangle className="text-warning size-4 shrink-0" />}
            <p>
              {availability.data.canSchedule
                ? t('meetings.availability.available')
                : t('meetings.availability.requestCanContinue')}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {t('meetings.workspace.requestReschedule')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
