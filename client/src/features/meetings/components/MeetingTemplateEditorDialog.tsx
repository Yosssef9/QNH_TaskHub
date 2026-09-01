import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { InputField, TextareaField } from '@/components/shared/Input'
import { SearchableMultiSelect, type SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { toApiClientError } from '@/lib/api-error'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import { useCreateMeetingTemplate, useMeetingParticipants, useUpdateMeetingTemplate } from '../hooks/use-meetings'
import type { MeetingParticipant, MeetingTemplate } from '../types/meeting.types'

function participantOption(participant: MeetingParticipant): SearchableSelectOption {
  return { value: participant.userId, label: participant.userName, description: participant.userCode }
}

export function MeetingTemplateEditorDialog({
  template = null,
  initialMeeting = null,
  open,
  onOpenChange,
}: {
  template?: MeetingTemplate | null
  initialMeeting?: { title: string; description: string | null; roomId: number; attendeeUserIds: number[]; durationMinutes: number } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const rooms = useActiveMeetingRooms()
  const createMutation = useCreateMeetingTemplate()
  const updateMutation = useUpdateMeetingTemplate()
  const [name, setName] = useState(template?.name ?? initialMeeting?.title ?? '')
  const [title, setTitle] = useState(template?.title ?? initialMeeting?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? initialMeeting?.description ?? '')
  const [durationMinutes, setDurationMinutes] = useState(String(template?.durationMinutes ?? initialMeeting?.durationMinutes ?? 60))
  const [roomId, setRoomId] = useState<number | null>(template?.defaultRoom?.isActive ? template.defaultRoom.id : initialMeeting?.roomId ?? null)
  const [attendeeUserIds, setAttendeeUserIds] = useState<number[]>(
    template?.attendees.map((attendee) => attendee.userId) ?? initialMeeting?.attendeeUserIds ?? [],
  )
  const [search, setSearch] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<SearchableSelectOption[]>(
    template?.attendees.map(participantOption) ?? [],
  )
  const participants = useMeetingParticipants(search, open)

  const participantOptions = useMemo(
    () => (participants.data?.items ?? [])
      .filter((item) => item.userId !== currentUser.data?.user.userId)
      .map(participantOption),
    [currentUser.data?.user.userId, participants.data?.items],
  )

  useEffect(() => {
    setSelectedOptions((current) => {
      const map = new Map(current.map((item) => [String(item.value), item]))
      participantOptions.forEach((item) => map.set(String(item.value), item))
      return [...map.values()].filter((item) => attendeeUserIds.includes(Number(item.value)))
    })
  }, [attendeeUserIds, participantOptions])

  const roomOptions = useMemo<SearchableSelectOption[]>(
    () => (rooms.data ?? []).map((room) => ({
      value: room.id,
      label: i18n.language.startsWith('ar') ? room.nameAr : room.nameEn,
      description: room.locationText ?? t('meetings.noRoomLocation'),
    })),
    [i18n.language, rooms.data, t],
  )

  const pending = createMutation.isPending || updateMutation.isPending

  async function save() {
    const duration = Number(durationMinutes)
    if (!name.trim() || !title.trim() || !Number.isInteger(duration) || duration < 1 || duration > 1440) return
    const values = {
      name: name.trim(),
      title: title.trim(),
      description: description.trim() || null,
      durationMinutes: duration,
      defaultRoomId: roomId,
      attendeeUserIds,
    }
    try {
      if (template) {
        await updateMutation.mutateAsync({ templateId: template.id, rowVersion: template.rowVersion, ...values })
      } else {
        await createMutation.mutateAsync(values)
      }
      toast.success(t(template ? 'meetings.templates.updated' : 'meetings.templates.created'))
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(t(`meetings.errors.${apiError.code}`, { defaultValue: t('meetings.templates.saveError') }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" className="w-[min(46rem,calc(100vw-2rem))]">
        <div className="pe-10">
          <DialogTitle>{t(template ? 'meetings.templates.editTitle' : 'meetings.templates.createTitle')}</DialogTitle>
          <DialogDescription className="mt-1">{t('meetings.templates.description')}</DialogDescription>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <InputField required label={t('meetings.templates.name')} value={name} maxLength={150} onChange={(event) => setName(event.target.value)} />
          <InputField required type="number" min={1} max={1440} label={t('meetings.templates.duration')} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
          <InputField required containerClassName="sm:col-span-2" label={t('meetings.fields.title')} value={title} maxLength={250} onChange={(event) => setTitle(event.target.value)} />
          <TextareaField containerClassName="sm:col-span-2" label={t('meetings.fields.description')} value={description} maxLength={10000} onChange={(event) => setDescription(event.target.value)} />
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t('meetings.templates.defaultRoom')}</label>
            <SearchableMultiSelect value={roomId} options={roomOptions} placeholder={t('meetings.templates.noDefaultRoom')} searchPlaceholder={t('meetings.fields.roomSearch')} onChange={(value) => setRoomId(value === null ? null : Number(value))} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t('meetings.fields.attendees')}</label>
            <SearchableMultiSelect multiple values={attendeeUserIds} options={participantOptions} selectedOptions={selectedOptions} searchValue={search} loading={participants.isFetching} placeholder={t('meetings.fields.attendeesPlaceholder')} searchPlaceholder={t('meetings.fields.attendeesSearch')} onSearchChange={setSearch} onChange={(values) => setAttendeeUserIds(values.map(Number))} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={pending || !name.trim() || !title.trim()} onClick={() => void save()}>{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
