import {
  ArrowUpRight,
  Link2,
  MapPin,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonStyles } from '@/components/ui/button.styles'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { MeetingEditorDialog } from '@/features/meetings/components/MeetingEditorDialog'
import type {
  MeetingDetail,
  MeetingParticipant,
  MeetingStatus,
} from '@/features/meetings/types/meeting.types'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { formatDateTime } from '@/lib/date-time'
import { cn } from '@/lib/cn'

import type { RelatedMeeting } from './meeting-follow-up.types'
import {
  FollowUpDetailHeader,
  FollowUpWorkspaceCard,
} from './MeetingFollowUpWorkspace'
import { useRelatedMeetings } from './use-meeting-follow-up'

function statusVariant(status: MeetingStatus): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (status === 'SCHEDULED') return 'success'
  if (status === 'PENDING_APPROVAL') return 'warning'
  if (status === 'REJECTED') return 'destructive'
  return 'secondary'
}

function RelatedMeetingRow({ meeting, compact = false }: { meeting: RelatedMeeting; compact?: boolean }) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-SA'
  const roomName = i18n.language.startsWith('ar') ? meeting.room.nameAr : meeting.room.nameEn

  return (
    <article
      className={cn(
        'relative rounded-xl border border-border/70 bg-card shadow-sm',
        compact ? 'p-3.5' : 'p-4 sm:p-5',
        meeting.isCurrent && 'border-primary/35 bg-primary/[0.04]',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold sm:text-base">{meeting.title}</h3>
            <Badge variant={statusVariant(meeting.status)}>{t(`meetings.status.${meeting.status}`)}</Badge>
            {meeting.isCurrent ? <Badge>{t('meetings.followUp.relatedMeetings.current')}</Badge> : null}
          </div>
          <p className="text-muted-foreground mt-2 text-xs font-medium tabular-nums">
            {formatDateTime(meeting.startAtUtc, locale, timeFormat, { dateStyle: 'medium' })}
          </p>
          {!compact ? (
            <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-3.5" />
                {roomName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UserRound aria-hidden="true" className="size-3.5" />
                {meeting.organizer.userName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UsersRound aria-hidden="true" className="size-3.5" />
                {t('meetings.participantCount', { count: meeting.participantCount })}
              </span>
            </div>
          ) : null}
        </div>
        {!meeting.isCurrent ? (
          <Link
            to={`/meetings/${meeting.id}?tab=follow-up`}
            className={buttonStyles({ size: compact ? 'icon' : 'sm', variant: 'outline' })}
            aria-label={compact ? t('meetings.followUp.relatedMeetings.open') : undefined}
          >
            {!compact ? t('meetings.followUp.relatedMeetings.open') : null}
            <ArrowUpRight aria-hidden="true" className="size-4 rtl:-rotate-90" />
          </Link>
        ) : null}
      </div>
    </article>
  )
}

export function MeetingRelatedMeetingsWorkspace({
  detail,
  mode,
  onViewAll,
  onBack,
}: {
  detail: MeetingDetail
  mode: 'preview' | 'detail'
  onViewAll?: () => void
  onBack?: () => void
}) {
  const { t } = useTranslation()
  const query = useRelatedMeetings(detail.meeting.id)

  const visibleItems = query.data?.items ?? []
  const currentIndex = visibleItems.findIndex((item) => item.isCurrent)
  const previewItems = useMemo(() => {
    if (visibleItems.length <= 3) return visibleItems
    if (currentIndex < 0) return visibleItems.slice(0, 3)
    const start = Math.max(0, Math.min(currentIndex - 1, visibleItems.length - 3))
    return visibleItems.slice(start, start + 3)
  }, [currentIndex, visibleItems])

  if (mode === 'preview') {
    return (
      <FollowUpWorkspaceCard
        icon={Link2}
        title={t('meetings.followUp.relatedMeetings.title')}
        description={t('meetings.followUp.relatedMeetings.description')}
        action={
          onViewAll ? (
            <Button variant="outline" size="sm" onClick={onViewAll}>
              {t('meetings.followUp.workspace.viewAll')}
            </Button>
          ) : null
        }
      >
        {query.isPending ? (
          <LoadingState />
        ) : query.isError || !query.data ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : (
          <div className="space-y-2.5">
            {previewItems.map((meeting) => (
              <RelatedMeetingRow key={meeting.id} meeting={meeting} compact />
            ))}
          </div>
        )}
      </FollowUpWorkspaceCard>
    )
  }

  const previousItems = currentIndex > 0 ? visibleItems.slice(0, currentIndex) : []
  const currentItem = currentIndex >= 0 ? visibleItems[currentIndex] : null
  const upcomingItems = currentIndex >= 0 ? visibleItems.slice(currentIndex + 1) : []

  return (
    <div className="space-y-5">
      <FollowUpDetailHeader
        icon={Link2}
        title={t('meetings.followUp.relatedMeetings.title')}
        description={t('meetings.followUp.relatedMeetings.detailDescription')}
        backLabel={t('meetings.followUp.workspace.backToOverview')}
        onBack={() => onBack?.()}
      />

      {query.isPending ? (
        <LoadingState />
      ) : query.isError || !query.data ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : (
        <div className="relative space-y-6 ps-6 before:absolute before:inset-y-3 before:start-[7px] before:w-px before:bg-border">
          {upcomingItems.length > 0 ? (
            <section className="space-y-3">
              <div className="relative flex items-center gap-2">
                <span className="bg-success absolute -start-[22px] size-3 rounded-full ring-4 ring-background" />
                <h3 className="text-sm font-bold">{t('meetings.followUp.relatedMeetings.upcoming')}</h3>
              </div>
              <div className="space-y-3">
                {upcomingItems.map((meeting) => (
                  <RelatedMeetingRow key={meeting.id} meeting={meeting} />
                ))}
              </div>
            </section>
          ) : null}

          {currentItem ? (
            <section className="space-y-3">
              <div className="relative flex items-center gap-2">
                <span className="bg-primary absolute -start-[24px] size-4 rounded-full ring-4 ring-background" />
                <h3 className="text-sm font-bold">{t('meetings.followUp.relatedMeetings.currentSection')}</h3>
              </div>
              <RelatedMeetingRow meeting={currentItem} />
            </section>
          ) : null}

          {previousItems.length > 0 ? (
            <section className="space-y-3">
              <div className="relative flex items-center gap-2">
                <span className="bg-muted-foreground absolute -start-[22px] size-3 rounded-full ring-4 ring-background" />
                <h3 className="text-sm font-bold">{t('meetings.followUp.relatedMeetings.previous')}</h3>
              </div>
              <div className="space-y-3">
                {[...previousItems].reverse().map((meeting) => (
                  <RelatedMeetingRow key={meeting.id} meeting={meeting} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function useFollowUpMeetingScheduling(detail: MeetingDetail) {
  const { i18n } = useTranslation()
  const currentUser = useCurrentUser()
  const [open, setOpen] = useState(false)
  const currentUserId = currentUser.data?.user.userId ?? null
  const canCoordinate = currentUser.data?.access.meetingCoordinateEnabled === true
  const canOrganize = currentUser.data?.access.meetingOrganizeEnabled === true || canCoordinate
  const isSourceOrganizer = currentUserId === detail.meeting.organizer.userId
  const canSchedule = canCoordinate || (isSourceOrganizer && canOrganize)
  const mode = canCoordinate ? 'DIRECT' : 'REQUEST'

  const copiedAttendees = useMemo<MeetingParticipant[]>(() => {
    const values = detail.meeting.organizerAttending
      ? [detail.meeting.organizer, ...detail.meeting.attendees]
      : [...detail.meeting.attendees]
    const byId = new Map(values.map((participant) => [participant.userId, participant]))
    if (currentUserId !== null) byId.delete(currentUserId)
    return [...byId.values()]
  }, [
    currentUserId,
    detail.meeting.attendees,
    detail.meeting.organizer,
    detail.meeting.organizerAttending,
  ])

  const durationMinutes = Math.max(
    30,
    Math.round(
      (new Date(detail.meeting.endAtUtc).getTime() - new Date(detail.meeting.startAtUtc).getTime()) /
        60_000,
    ),
  )

  const titleSuffix = i18n.language.startsWith('ar') ? ' - متابعة' : ' - Follow-up'
  const sourceTitleLength = Math.max(1, 250 - titleSuffix.length)
  const followUpTitle = `${detail.meeting.title.slice(0, sourceTitleLength).trimEnd()}${titleSuffix}`

  return {
    canSchedule,
    open,
    setOpen,
    mode,
    initialValues: {
      title: followUpTitle,
      description: detail.meeting.description,
      durationMinutes,
      roomId: detail.meeting.room.isActive ? detail.meeting.room.id : null,
      ...(mode === 'REQUEST' ? { organizerAttending: detail.meeting.organizerAttending } : {}),
      attendees: mode === 'REQUEST' ? detail.meeting.attendees : copiedAttendees,
      followUpOfMeetingId: detail.meeting.id,
      scheduleStartsUnselected: true,
    },
  } as const
}

export function ScheduleFollowUpMeetingDialog({
  detail,
  open,
  onOpenChange,
  mode,
  initialValues,
}: {
  detail: MeetingDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'REQUEST' | 'DIRECT'
  initialValues: Parameters<typeof MeetingEditorDialog>[0]['initialValues']
}) {
  const { t } = useTranslation()

  return (
    <MeetingEditorDialog
      key={`${detail.meeting.id}-${mode}-${open ? 'open' : 'closed'}`}
      open={open}
      mode={mode}
      heading={t('meetings.followUp.nextMeeting.schedule')}
      description={t('meetings.followUp.nextMeeting.drawerDescription')}
      initialValues={initialValues}
      onOpenChange={onOpenChange}
    />
  )
}


