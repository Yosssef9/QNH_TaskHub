import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { InputField, TextareaField } from '@/components/shared/Input'
import { SearchableMultiSelect, type SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { toApiClientError } from '@/lib/api-error'
import { formatRiyadhDateInput, formatRiyadhTimeInput, riyadhLocalDateTimeToUtcIso } from '@/lib/date-time'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import { useUpdateMeetingReschedule } from '../hooks/use-meetings'
import type { MeetingRescheduleQueueItem } from '../types/meeting.types'

export function CoordinatorRescheduleDialog({ item, open, onOpenChange }: {
  item: MeetingRescheduleQueueItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const mutation = useUpdateMeetingReschedule()
  const rooms = useActiveMeetingRooms()
  const revision = item.requestedRevision
  const [date, setDate] = useState(() => formatRiyadhDateInput(revision.startAtUtc))
  const [startTime, setStartTime] = useState(() => formatRiyadhTimeInput(revision.startAtUtc))
  const [endTime, setEndTime] = useState(() => formatRiyadhTimeInput(revision.endAtUtc))
  const [roomId, setRoomId] = useState<number | null>(revision.room.id)
  const [notes, setNotes] = useState(revision.schedulingNotes ?? '')

  const options = useMemo<SearchableSelectOption[]>(
    () => (rooms.data ?? []).map((room) => ({
      value: room.id,
      label: i18n.language.startsWith('ar') ? room.nameAr : room.nameEn,
      description: room.locationText ?? t('meetings.noRoomLocation'),
    })),
    [i18n.language, rooms.data, t],
  )

  async function submit() {
    if (!roomId) return
    try {
      const startAtUtc = riyadhLocalDateTimeToUtcIso(date, startTime)
      const endAtUtc = riyadhLocalDateTimeToUtcIso(date, endTime)
      if (new Date(endAtUtc).getTime() <= new Date(startAtUtc).getTime()) return
      await mutation.mutateAsync({
        meetingId: item.meeting.id,
        revisionId: revision.id,
        revisionRowVersion: revision.rowVersion,
        roomId,
        startAtUtc,
        endAtUtc,
        schedulingNotes: notes.trim() || null,
      })
      toast.success(t('meetings.workspace.rescheduleUpdated'))
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(t(`meetings.errors.${apiError.code}`, { defaultValue: t('meetings.workspace.rescheduleUpdateError') }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" className="w-[min(42rem,calc(100vw-2rem))]">
        <div className="pe-10">
          <DialogTitle>{t('meetings.workspace.coordinatorRescheduleTitle')}</DialogTitle>
          <DialogDescription className="mt-1">{item.meeting.title}</DialogDescription>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <DatePicker required label={t('meetings.fields.date')} value={date} onChange={setDate} />
          <div className="grid grid-cols-2 gap-3">
            <InputField required type="time" step={1800} label={t('meetings.fields.startTime')} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            <InputField required type="time" step={1800} label={t('meetings.fields.endTime')} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">{t('meetings.fields.room')}</label>
            <SearchableMultiSelect value={roomId} options={options} placeholder={t('meetings.fields.roomPlaceholder')} searchPlaceholder={t('meetings.fields.roomSearch')} onChange={(value) => setRoomId(value === null ? null : Number(value))} />
          </div>
          <TextareaField containerClassName="sm:col-span-2" label={t('meetings.fields.schedulingNotes')} value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={mutation.isPending || !roomId} onClick={() => void submit()}>{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
