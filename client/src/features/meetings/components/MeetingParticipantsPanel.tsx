import { UsersRound } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { MeetingAttendanceParticipant, MeetingAttendanceStatus, MeetingParticipant, MeetingSummary } from '../types/meeting.types'
import { MeetingAttendanceIndicator, MeetingAttendanceSelect } from './MeetingAttendanceSelect'
import './MeetingParticipantsPanel.css'

interface Props {
  meeting: Pick<MeetingSummary, 'organizer' | 'attendees' | 'organizerAttending' | 'participantCount'>
  attendance: readonly MeetingAttendanceParticipant[]
  canManageAttendance: boolean
  showStartNotice: boolean
  isSaving: boolean
  onChangeAttendance: (userId: number, status: MeetingAttendanceStatus) => void | Promise<void>
  onChangeAllAttendance: (status: 'ATTENDED' | 'NOT_MARKED') => void | Promise<void>
}

function participantInitials(participant: MeetingParticipant): string {
  const parts = participant.userName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return participant.userCode.slice(0, 2).toUpperCase()
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

/** Presentation only: the parent retains the existing permission/start-time checks and mutations. */
export function MeetingParticipantsPanel({ meeting, attendance, canManageAttendance, showStartNotice,
  isSaving, onChangeAttendance, onChangeAllAttendance }: Props) {
  const { t, i18n } = useTranslation()
  const headingId = useId()
  const byUser = new Map(attendance.map((item) => [item.participant.userId, item]))
  const counts = attendance.reduce((totals, item) => {
    totals[item.status] += 1
    return totals
  }, { NOT_MARKED: 0, ATTENDED: 0, ABSENT: 0 })

  return (
    <Card className="meeting-participants-panel min-w-0 w-full self-start border-border/70 p-5 shadow-sm sm:p-6"
      dir={i18n.language.toLowerCase().startsWith('ar') ? 'rtl' : 'ltr'} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-success/12 text-success-foreground grid size-10 shrink-0 place-items-center rounded-xl">
            <UsersRound aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="font-bold">{t('meetings.workspace.participants')}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('meetings.workspace.participantCount', { count: meeting.participantCount })}
            </p>
          </div>
        </div>
        {canManageAttendance && attendance.length > 0 ? (
          <div className="flex max-w-full flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-start"
              disabled={isSaving} onClick={() => void onChangeAllAttendance('ATTENDED')}>
              {t('meetings.workspace.attendance.markAll')}
            </Button>
            <Button size="sm" variant="ghost" className="h-auto min-h-8 whitespace-normal text-start"
              disabled={isSaving} onClick={() => void onChangeAllAttendance('NOT_MARKED')}>
              {t('meetings.workspace.attendance.clear')}
            </Button>
          </div>
        ) : null}
      </div>

      {attendance.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {(['ATTENDED', 'ABSENT', 'NOT_MARKED'] as const).map((status) => (
            <div key={status} className={status === 'ATTENDED' ? 'rounded-lg bg-success/12 px-2 py-2.5 text-success-foreground'
              : status === 'ABSENT' ? 'rounded-lg bg-destructive/10 px-2 py-2.5 text-destructive'
              : 'rounded-lg bg-muted/50 px-2 py-2.5'}>
              <p className="text-lg font-bold tabular-nums">{counts[status]}</p>
              <p className="text-muted-foreground text-[11px]">{t(`meetings.workspace.attendance.status.${status}`)}</p>
            </div>
          ))}
        </div>
      ) : null}
      {showStartNotice ? (
        <div className="bg-muted/25 text-muted-foreground mt-4 rounded-xl border border-dashed px-3.5 py-3 text-xs leading-5">
          {t('meetings.workspace.attendance.availableAtStart')}
        </div>
      ) : null}

      <div className="meeting-participants-list mt-5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        role="region" aria-label={t('meetings.workspace.attendance.participantList')} tabIndex={0}>
        <ul className="space-y-2">
          {[meeting.organizer, ...meeting.attendees].map((participant) => {
            const organizer = participant.userId === meeting.organizer.userId
            const entry = byUser.get(participant.userId)
            return (
              <li key={`${organizer ? 'organizer' : 'attendee'}-${participant.userId}`}
                className="meeting-participant-row hover:bg-muted/25 rounded-xl border border-border/70 px-3.5 py-3 transition-colors">
                <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold" aria-hidden="true">
                  {participantInitials(participant)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold [overflow-wrap:anywhere]" dir="auto">{participant.userName}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs"><bdi>{participant.userCode}</bdi></p>
                  {organizer ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">{t('meetings.organizer')}</Badge>
                      <Badge variant={meeting.organizerAttending ? 'success' : 'secondary'} className="text-[10px]">
                        {t(meeting.organizerAttending ? 'meetings.workspace.organizerAttending' : 'meetings.workspace.organizerNotAttending')}
                      </Badge>
                    </div>
                  ) : null}
                </div>
                {entry ? (
                  <div className="meeting-participant-attendance">
                    {canManageAttendance ? (
                      <MeetingAttendanceSelect status={entry.status} participantName={participant.userName} disabled={isSaving}
                        onStatusChange={(status) => void onChangeAttendance(participant.userId, status)} />
                    ) : <MeetingAttendanceIndicator status={entry.status} pill />}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
