import { CalendarClock, DoorOpen, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDateTime } from '@/lib/date-time'

import type { MeetingRescheduleQueueItem } from '../types/meeting.types'

export function MeetingRescheduleQueueCard({ item, onOpen, onEdit, onApprove, onReject }: {
  item: MeetingRescheduleQueueItem
  onOpen: () => void
  onEdit: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-SA'
  const revision = item.requestedRevision
  const roomName = i18n.language.startsWith('ar') ? revision.room.nameAr : revision.room.nameEn
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{item.meeting.title}</h3>
          <p className="text-muted-foreground mt-1 text-xs">{t('meetings.organizedBy', { name: item.meeting.organizer.userName })}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpen}>{t('meetings.workspace.openDetails')}</Button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="bg-warning/5 flex gap-2 rounded-lg border p-3 text-sm"><CalendarClock className="text-warning mt-0.5 size-4 shrink-0" /><div><p className="font-medium">{formatDateTime(revision.startAtUtc, locale)}</p><p className="text-muted-foreground mt-1 text-xs">{t('meetings.endsAt', { value: formatDateTime(revision.endAtUtc, locale) })}</p></div></div>
        <div className="bg-warning/5 flex gap-2 rounded-lg border p-3 text-sm"><DoorOpen className="text-warning mt-0.5 size-4 shrink-0" /><div><p className="font-medium">{roomName}</p><p className="text-muted-foreground mt-1 text-xs">{revision.room.locationText ?? t('meetings.noRoomLocation')}</p></div></div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="size-4" />{t('meetings.editSchedule')}</Button>
        <Button variant="outline" size="sm" onClick={onReject}>{t('meetings.reject')}</Button>
        <Button size="sm" onClick={onApprove}>{t('meetings.approve')}</Button>
      </div>
    </Card>
  )
}
