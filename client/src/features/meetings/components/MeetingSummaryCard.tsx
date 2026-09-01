import { CalendarClock, DoorOpen, Pencil, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDateTime } from '@/lib/date-time'

import type { MeetingStatus, MeetingSummary } from '../types/meeting.types'

interface MeetingSummaryCardProps {
  meeting: MeetingSummary
  coordinatorActions?: boolean
  approving?: boolean
  rejecting?: boolean
  onEditSchedule?: () => void
  onApprove?: () => void
  onReject?: () => void
}

function statusVariant(status: MeetingStatus): 'warning' | 'success' | 'destructive' | 'secondary' {
  if (status === 'PENDING_APPROVAL') return 'warning'
  if (status === 'SCHEDULED') return 'success'
  if (status === 'REJECTED') return 'destructive'
  return 'secondary'
}

export function MeetingSummaryCard({
  meeting,
  coordinatorActions = false,
  approving = false,
  rejecting = false,
  onEditSchedule,
  onApprove,
  onReject,
}: MeetingSummaryCardProps) {
  const { i18n, t } = useTranslation()
  const roomName = i18n.language.startsWith('ar') ? meeting.room.nameAr : meeting.room.nameEn
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-SA'
  const attendeeNames = meeting.attendees.map((attendee) => attendee.userName).join(', ')

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-6">{meeting.title}</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('meetings.organizedBy', { name: meeting.organizer.userName })}
          </p>
        </div>
        <Badge variant={statusVariant(meeting.status)}>
          {t(`meetings.status.${meeting.status}`)}
        </Badge>
      </div>

      {meeting.description ? (
        <p className="text-muted-foreground line-clamp-3 text-sm leading-6">
          {meeting.description}
        </p>
      ) : null}

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="bg-muted/45 flex items-start gap-2 rounded-lg border p-3">
          <CalendarClock aria-hidden="true" className="text-muted-foreground mt-0.5 size-4" />
          <div>
            <p className="font-medium">{formatDateTime(meeting.startAtUtc, locale)}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('meetings.endsAt', { value: formatDateTime(meeting.endAtUtc, locale) })}
            </p>
          </div>
        </div>
        <div className="bg-muted/45 flex items-start gap-2 rounded-lg border p-3">
          <DoorOpen aria-hidden="true" className="text-muted-foreground mt-0.5 size-4" />
          <div className="min-w-0">
            <p className="truncate font-medium">{roomName}</p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {meeting.room.locationText ?? t('meetings.noRoomLocation')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 text-sm">
        <UsersRound aria-hidden="true" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">{t('meetings.participantCount', { count: meeting.participantCount })}</p>
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
            {attendeeNames || t('meetings.organizerOnly')}
          </p>
        </div>
      </div>

      {meeting.schedulingNotes ? (
        <div className="border-s-2 ps-3 text-sm">
          <p className="font-medium">{t('meetings.fields.schedulingNotes')}</p>
          <p className="text-muted-foreground mt-1 leading-5">{meeting.schedulingNotes}</p>
        </div>
      ) : null}

      {coordinatorActions ? (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button variant="outline" size="sm" onClick={onEditSchedule}>
            <Pencil aria-hidden="true" className="size-4" />
            {t('meetings.editSchedule')}
          </Button>
          <Button variant="outline" size="sm" disabled={rejecting || approving} onClick={onReject}>
            {t('meetings.reject')}
          </Button>
          <Button size="sm" disabled={approving || rejecting} onClick={onApprove}>
            {t('meetings.approve')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
