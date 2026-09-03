import type { CSSProperties } from 'react'

import {
  CalendarDays,
  Check,
  Clock3,
  DoorOpen,
  ExternalLink,
  Pencil,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getMeetingRoomAccent } from '@/features/meetings/meeting-room-colors'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import type { MeetingSummary } from '@/features/meetings/types/meeting.types'
import { formatTimeRange } from '@/lib/date-time'

function roomSurface(meeting: MeetingSummary): CSSProperties {
  const accent = getMeetingRoomAccent(meeting.room.colorKey)
  return {
    borderInlineStart: `3px solid ${accent}`,
    background: `linear-gradient(135deg,
      color-mix(in oklab, ${accent} 4%, var(--card)) 0%,
      var(--card) 38%)`,
  }
}

export function CoordinatorMeetingQueueCard({
  meeting,
  waitingLabel,
  onOpen,
  onEditSchedule,
  onApprove,
  onReject,
  approving = false,
  rejecting = false,
}: {
  meeting: MeetingSummary
  waitingLabel: string
  onOpen: () => void
  onEditSchedule: () => void
  onApprove: () => void
  onReject: () => void
  approving?: boolean
  rejecting?: boolean
}) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const arabic = i18n.language.startsWith('ar')
  const locale = arabic ? 'ar-SA' : 'en-SA'
  const busy = approving || rejecting
  const roomName = arabic ? meeting.room.nameAr : meeting.room.nameEn
  const roomAccent = getMeetingRoomAccent(meeting.room.colorKey)
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    numberingSystem: 'latn',
    timeZone: 'Asia/Riyadh',
  }).format(new Date(meeting.startAtUtc))

  return (
    <Card
      className="group overflow-hidden border-border/70 p-0 shadow-sm hover:border-border hover:shadow-md"
      style={roomSurface(meeting)}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">{t('meetings.coordination.awaitingDecision')}</Badge>
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
                <Clock3 aria-hidden="true" className="size-3.5" />
                {waitingLabel}
              </span>
            </div>
            <h3 className="mt-2 truncate text-base font-bold sm:text-lg">{meeting.title}</h3>
            <p className="text-muted-foreground mt-1 inline-flex items-center gap-1.5 text-xs">
              <UserRound aria-hidden="true" className="size-3.5" />
              {t('meetings.organizedBy', { name: meeting.organizer.userName })}
            </p>
          </div>

          <span className="bg-primary/8 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
            <CalendarDays aria-hidden="true" className="size-5" />
          </span>
        </div>

        <div className="mt-4 grid gap-3 border-y border-border/65 py-4 md:grid-cols-3">
          <div className="min-w-0 md:border-e md:border-border/60 md:pe-4">
            <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
              {t('meetings.coordination.dateTime')}
            </p>
            <p className="mt-1.5 truncate text-sm font-semibold">{dateLabel}</p>
            <p className="text-muted-foreground mt-1 inline-flex items-center gap-1.5 text-xs font-medium tabular-nums">
              <Clock3 aria-hidden="true" className="size-3.5" />
              {formatTimeRange(meeting.startAtUtc, meeting.endAtUtc, locale, timeFormat)}
            </p>
          </div>

          <div className="min-w-0 md:border-e md:border-border/60 md:px-4">
            <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
              {t('meetings.myDashboard.roomLabel')}
            </p>
            <div className="mt-1.5 flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                style={{ backgroundColor: roomAccent }}
              />
              <p className="truncate text-sm font-semibold">{roomName}</p>
            </div>
            <p className="text-muted-foreground mt-1 truncate text-xs">
              {meeting.room.locationText ?? t('meetings.noRoomLocation')}
            </p>
          </div>

          <div className="min-w-0 md:ps-4">
            <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
              {t('meetings.myDashboard.participantsLabel')}
            </p>
            <p className="mt-1.5 inline-flex items-center gap-2 text-sm font-semibold">
              <UsersRound aria-hidden="true" className="text-muted-foreground size-4" />
              {t('meetings.participantCount', { count: meeting.participantCount })}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={onOpen}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            {t('meetings.workspace.openDetails')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="border-destructive/25 bg-destructive/[0.045] text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/[0.08] dark:hover:bg-destructive/[0.14]"
            disabled={busy}
            onClick={onReject}
          >
            <X aria-hidden="true" className="size-4" />
            {t('meetings.reject')}
          </Button>

          <div className="ms-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onEditSchedule}>
              <Pencil aria-hidden="true" className="size-4" />
              {t('meetings.coordinatorSchedule.adjustAndApprove')}
            </Button>
            <Button size="sm" disabled={busy} onClick={onApprove}>
              <Check aria-hidden="true" className="size-4" />
              {t('meetings.approveAsRequested')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
