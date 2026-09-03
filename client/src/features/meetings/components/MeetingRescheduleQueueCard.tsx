import type { CSSProperties } from 'react'

import {
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  DoorOpen,
  ExternalLink,
  Pencil,
  RefreshCcw,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { TimeFormatPreference } from '@/features/auth/types/auth.types'
import { getMeetingRoomAccent } from '@/features/meetings/meeting-room-colors'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { formatTimeRange } from '@/lib/date-time'

import type { MeetingRescheduleQueueItem, MeetingRoom } from '../types/meeting.types'

function cardSurface(room: MeetingRoom): CSSProperties {
  const accent = getMeetingRoomAccent(room.colorKey)
  return {
    borderInlineStart: `3px solid ${accent}`,
    background: `linear-gradient(135deg,
      color-mix(in oklab, ${accent} 4%, var(--card)) 0%,
      var(--card) 38%)`,
  }
}

function ScheduleBlock({
  label,
  room,
  startAtUtc,
  endAtUtc,
  locale,
  arabic,
  timeFormat,
  requested = false,
}: {
  label: string
  room: MeetingRoom
  startAtUtc: string
  endAtUtc: string
  locale: string
  arabic: boolean
  timeFormat: TimeFormatPreference
  requested?: boolean
}) {
  const { t } = useTranslation()
  const roomName = arabic ? room.nameAr : room.nameEn
  const accent = getMeetingRoomAccent(room.colorKey)
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    numberingSystem: 'latn',
    timeZone: 'Asia/Riyadh',
  }).format(new Date(startAtUtc))

  return (
    <div
      className={
        requested
          ? 'border-violet-500/20 bg-violet-500/[0.035] rounded-xl border p-3.5'
          : 'bg-muted/20 rounded-xl border border-border/70 p-3.5'
      }
    >
      <p className={requested ? 'text-violet-700 dark:text-violet-300 text-xs font-bold' : 'text-muted-foreground text-xs font-bold'}>
        {label}
      </p>
      <div className="mt-2 flex items-start gap-2">
        <CalendarClock
          aria-hidden="true"
          className={requested ? 'mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-300' : 'text-primary mt-0.5 size-4 shrink-0'}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{dateLabel}</p>
          <p className="text-muted-foreground mt-0.5 text-xs font-medium tabular-nums">
            {formatTimeRange(startAtUtc, endAtUtc, locale, timeFormat)}
          </p>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2 text-xs">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
          style={{ backgroundColor: accent }}
        />
        <DoorOpen aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
        <span className="truncate font-medium">{roomName}</span>
      </div>
      <p className="text-muted-foreground mt-1 truncate ps-4 text-[11px]">
        {room.locationText ?? t('meetings.noRoomLocation')}
      </p>
    </div>
  )
}

export function MeetingRescheduleQueueCard({
  item,
  waitingLabel,
  onOpen,
  onEdit,
  onApprove,
  onReject,
  approving = false,
  rejecting = false,
}: {
  item: MeetingRescheduleQueueItem
  waitingLabel: string
  onOpen: () => void
  onEdit: () => void
  onApprove: () => void
  onReject: () => void
  approving?: boolean
  rejecting?: boolean
}) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const arabic = i18n.language.startsWith('ar')
  const locale = arabic ? 'ar-SA' : 'en-SA'
  const revision = item.requestedRevision
  const busy = approving || rejecting

  return (
    <Card
      className="group overflow-hidden border-border/70 p-0 shadow-sm hover:border-border hover:shadow-md"
      style={cardSurface(revision.room)}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="bg-violet-500/10 text-violet-700 dark:text-violet-300"
              >
                <RefreshCcw aria-hidden="true" className="size-3.5" />
                {t('meetings.coordination.rescheduleRequestBadge')}
              </Badge>
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
                <Clock3 aria-hidden="true" className="size-3.5" />
                {waitingLabel}
              </span>
            </div>
            <h3 className="mt-2 truncate text-base font-bold sm:text-lg">{item.meeting.title}</h3>
            <p className="text-muted-foreground mt-1 inline-flex items-center gap-1.5 text-xs">
              <UserRound aria-hidden="true" className="size-3.5" />
              {t('meetings.organizedBy', { name: item.meeting.organizer.userName })}
            </p>
          </div>

          <div className="text-muted-foreground inline-flex items-center gap-2 text-xs">
            <UsersRound aria-hidden="true" className="size-4" />
            {t('meetings.participantCount', { count: item.meeting.participantCount })}
          </div>
        </div>

        <div className="mt-4 grid items-stretch gap-3 border-y border-border/65 py-4 lg:grid-cols-[1fr_auto_1fr]">
          <ScheduleBlock
            label={t('meetings.coordinatorSchedule.currentSchedule')}
            room={item.meeting.room}
            startAtUtc={item.meeting.startAtUtc}
            endAtUtc={item.meeting.endAtUtc}
            locale={locale}
            arabic={arabic}
            timeFormat={timeFormat}
          />
          <div className="text-muted-foreground hidden items-center justify-center px-1 lg:flex">
            <span className="bg-muted grid size-9 place-items-center rounded-full border">
              <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
            </span>
          </div>
          <ScheduleBlock
            label={t('meetings.coordinatorSchedule.organizerRequest')}
            room={revision.room}
            startAtUtc={revision.startAtUtc}
            endAtUtc={revision.endAtUtc}
            locale={locale}
            arabic={arabic}
            timeFormat={timeFormat}
            requested
          />
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
            <Button variant="outline" size="sm" disabled={busy} onClick={onEdit}>
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
