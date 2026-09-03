import { Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { toApiClientError } from '@/lib/api-error'

import { useUpdateMeetingAgenda } from '../hooks/use-meetings'
import type { MeetingAgendaItem, MeetingDetail, MeetingParticipant } from '../types/meeting.types'
import {
  MeetingAgendaEditor,
  type MeetingAgendaDraftItem,
} from './MeetingAgendaEditor'

function toDraft(item: MeetingAgendaItem): MeetingAgendaDraftItem {
  return {
    clientId: `agenda-${item.id}`,
    topic: item.topic,
    presenterUserId: item.presenter?.userId ?? null,
    plannedDurationMinutes: item.plannedDurationMinutes,
  }
}

function signature(items: readonly MeetingAgendaDraftItem[]): string {
  return JSON.stringify(
    items.map((item) => ({
      topic: item.topic.trim(),
      presenterUserId: item.presenterUserId,
      plannedDurationMinutes: item.plannedDurationMinutes,
    })),
  )
}

export function MeetingAgendaWorkspace({
  detail,
  meetingDurationMinutes,
}: {
  detail: MeetingDetail
  meetingDurationMinutes: number
}) {
  const { t } = useTranslation()
  const updateAgenda = useUpdateMeetingAgenda()
  const meeting = detail.meeting
  const participants = useMemo<MeetingParticipant[]>(
    () => [meeting.organizer, ...meeting.attendees],
    [meeting.attendees, meeting.organizer],
  )
  const serverDrafts = useMemo(() => detail.agendaItems.map(toDraft), [detail.agendaItems])
  const [items, setItems] = useState<MeetingAgendaDraftItem[]>(serverDrafts)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setItems(serverDrafts)
    setErrors({})
  }, [meeting.meetingRowVersion, serverDrafts])

  const changed = signature(items) !== signature(serverDrafts)

  async function save() {
    const nextErrors = Object.fromEntries(
      items
        .filter((item) => !item.topic.trim())
        .map((item) => [item.clientId, t('meetings.create.agenda.topicRequired')]),
    )
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    try {
      await updateAgenda.mutateAsync({
        meetingId: meeting.id,
        meetingRowVersion: meeting.meetingRowVersion,
        agendaItems: items.map((item) => ({
          topic: item.topic.trim(),
          presenterUserId: item.presenterUserId,
          plannedDurationMinutes: item.plannedDurationMinutes,
        })),
      })
      toast.success(t('meetings.workspace.agendaSaved'))
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.workspace.agendaSaveError'),
        }),
      )
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">{t('meetings.create.agenda.title')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('meetings.workspace.agendaManageDescription')}
          </p>
        </div>
        <Button size="sm" disabled={!changed || updateAgenda.isPending} onClick={() => void save()}>
          <Save aria-hidden="true" className="size-4" />
          {t('meetings.workspace.saveAgenda')}
        </Button>
      </div>

      <MeetingAgendaEditor
        items={items}
        participants={participants}
        organizerUserId={meeting.organizer.userId}
        meetingDurationMinutes={meetingDurationMinutes}
        disabled={updateAgenda.isPending}
        errors={errors}
        onChange={setItems}
        onErrorClear={(clientId) => {
          setErrors((current) => {
            if (!current[clientId]) return current
            const next = { ...current }
            delete next[clientId]
            return next
          })
        }}
      />
    </div>
  )
}
