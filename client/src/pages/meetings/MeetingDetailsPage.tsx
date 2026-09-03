import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CirclePlus,
  Clock3,
  DoorOpen,
  Ellipsis,
  History,
  LayoutGrid,
  ListChecks,
  Paperclip,
  RefreshCcw,
  Save,
  UserRound,
  UsersRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { TextareaField } from '@/components/shared/Input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CoordinatorDirectRescheduleDialog } from '@/features/meetings/components/CoordinatorDirectRescheduleDialog'
import { CoordinatorMeetingScheduleDialog } from '@/features/meetings/components/CoordinatorMeetingScheduleDialog'
import { CoordinatorRescheduleDialog } from '@/features/meetings/components/CoordinatorRescheduleDialog'
import { MeetingAgendaDisplay } from '@/features/meetings/components/MeetingAgendaDisplay'
import { MeetingAgendaWorkspace } from '@/features/meetings/components/MeetingAgendaWorkspace'
import { MeetingFilesPanel } from '@/features/meetings/components/MeetingFilesPanel'
import { MeetingFilesPreview } from '@/features/meetings/components/MeetingFilesPreview'
import { MeetingRescheduleDialog } from '@/features/meetings/components/MeetingRescheduleDialog'
import { MeetingTemplateEditorDialog } from '@/features/meetings/components/MeetingTemplateEditorDialog'
import {
  useApproveMeetingRequest,
  useApproveMeetingReschedule,
  useCancelMeeting,
  useMeetingDetail,
  useRejectMeetingRequest,
  useRejectMeetingReschedule,
  useCancelMeetingRescheduleRequest,
} from '@/features/meetings/hooks/use-meetings'
import type {
  MeetingActivityItem,
  MeetingParticipant,
  MeetingRevisionDetail,
  MeetingRoom,
  MeetingStatus,
} from '@/features/meetings/types/meeting.types'
import { toApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'
import { APP_TIME_ZONE, formatDateTime, formatTime, formatTimeRange } from '@/lib/date-time'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { getMeetingRoomAccent } from '@/features/meetings/meeting-room-colors'

function revisionVariant(status: MeetingRevisionDetail['revisionStatus']) {
  if (status === 'APPROVED') return 'success' as const
  if (status === 'REJECTED') return 'destructive' as const
  return 'warning' as const
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface ActivityScheduleSnapshot {
  roomId: number | null
  startAtUtc: string
  endAtUtc: string
}

function scheduleSnapshot(value: unknown): ActivityScheduleSnapshot | null {
  if (!isRecord(value)) return null
  const startAtUtc = typeof value.startAtUtc === 'string' ? value.startAtUtc : null
  const endAtUtc = typeof value.endAtUtc === 'string' ? value.endAtUtc : null
  if (!startAtUtc || !endAtUtc) return null
  return {
    roomId: typeof value.roomId === 'number' ? value.roomId : null,
    startAtUtc,
    endAtUtc,
  }
}

function ActivityScheduleDetails({
  item,
  roomById,
  locale,
  arabic,
}: {
  item: MeetingActivityItem
  roomById: Map<number, MeetingRoom>
  locale: string
  arabic: boolean
}) {
  const { t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  if (!item.changes) return null

  const candidates = [
    ['before', 'meetings.workspace.historyBefore'],
    ['requested', 'meetings.workspace.historyRequested'],
    ['organizerRequested', 'meetings.workspace.historyRequested'],
    ['after', 'meetings.workspace.historyFinal'],
    ['final', 'meetings.workspace.historyFinal'],
  ] as const

  const snapshots: Array<{ key: string; labelKey: string; snapshot: ActivityScheduleSnapshot }> = []
  for (const [key, labelKey] of candidates) {
    const snapshot = scheduleSnapshot(item.changes[key])
    if (snapshot && !snapshots.some((entry) => entry.snapshot.startAtUtc === snapshot.startAtUtc && entry.snapshot.endAtUtc === snapshot.endAtUtc && entry.snapshot.roomId === snapshot.roomId)) {
      snapshots.push({ key, labelKey, snapshot })
    }
  }
  if (!snapshots.length) return null

  return (
    <div className="mt-2 grid gap-2 md:grid-cols-2">
      {snapshots.map(({ key, labelKey, snapshot }) => {
        const room = snapshot.roomId === null ? null : roomById.get(snapshot.roomId) ?? null
        return (
          <div key={key} className="bg-muted/35 rounded-lg border px-3 py-2.5 text-xs">
            <p className="text-muted-foreground font-semibold">{t(labelKey)}</p>
            <p className="mt-1 font-medium">
              {formatDateTime(snapshot.startAtUtc, locale, timeFormat)} → {formatDateTime(snapshot.endAtUtc, locale, timeFormat)}
            </p>
            {room ? (
              <p className="text-muted-foreground mt-1">
                {arabic ? room.nameAr : room.nameEn}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ActivityMetadata({ item }: { item: MeetingActivityItem }) {
  const { t } = useTranslation()
  if (!item.changes) return null
  const reason = typeof item.changes.reason === 'string' && item.changes.reason.trim()
    ? item.changes.reason.trim()
    : null
  const schedulingNotes =
    typeof item.changes.schedulingNotes === 'string' && item.changes.schedulingNotes.trim()
      ? item.changes.schedulingNotes.trim()
      : null

  if (!reason && !schedulingNotes) return null

  return (
    <div className="bg-muted/25 mt-2 space-y-1.5 rounded-lg border px-3 py-2.5 text-xs">
      {reason ? (
        <p>
          <span className="text-muted-foreground font-semibold">{t('meetings.workspace.historyReason')}: </span>
          <span>{reason}</span>
        </p>
      ) : null}
      {schedulingNotes ? (
        <p>
          <span className="text-muted-foreground font-semibold">{t('meetings.workspace.historySchedulingNotes')}: </span>
          <span>{schedulingNotes}</span>
        </p>
      ) : null}
    </div>
  )
}


type MeetingDetailsTab = 'OVERVIEW' | 'AGENDA' | 'FILES' | 'ACTIVITY'

function meetingStatusVariant(status: MeetingStatus) {
  if (status === 'SCHEDULED') return 'success' as const
  if (status === 'PENDING_APPROVAL') return 'warning' as const
  if (status === 'REJECTED') return 'destructive' as const
  return 'secondary' as const
}

function participantInitials(participant: MeetingParticipant): string {
  const parts = participant.userName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return participant.userCode.slice(0, 2).toUpperCase()
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function roomAccentSurface(room: MeetingRoom, arabic: boolean): CSSProperties {
  const accent = getMeetingRoomAccent(room.colorKey)
  const direction = arabic ? 'to right' : 'to left'
  return {
    borderInlineEnd: `4px solid ${accent}`,
    background: `linear-gradient(${direction},
      color-mix(in oklab, ${accent} 7%, var(--card)) 0%,
      color-mix(in oklab, ${accent} 3%, var(--card)) 32%,
      var(--card) 72%)`,
  }
}

function activityPresentation(activityType: string): {
  icon: LucideIcon
  iconClassName: string
} {
  if (activityType.includes('APPROVED')) {
    return {
      icon: CheckCircle2,
      iconClassName: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    }
  }
  if (
    activityType.includes('REJECTED') ||
    activityType === 'CANCELLED' ||
    activityType.includes('CANCELLED')
  ) {
    return {
      icon: XCircle,
      iconClassName: 'bg-destructive/10 text-destructive',
    }
  }
  if (activityType.includes('RESCHEDULE') || activityType.includes('SCHEDULE_CHANGED')) {
    return {
      icon: RefreshCcw,
      iconClassName: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
    }
  }
  if (activityType.includes('ATTACHMENT')) {
    return {
      icon: Paperclip,
      iconClassName: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
    }
  }
  if (activityType === 'REQUESTED' || activityType === 'DIRECT_CREATED') {
    return {
      icon: CirclePlus,
      iconClassName: 'bg-primary/10 text-primary',
    }
  }
  return {
    icon: History,
    iconClassName: 'bg-muted text-muted-foreground',
  }
}

export function MeetingDetailsPage() {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const navigate = useNavigate()
  const params = useParams()
  const meetingId = Number(params.meetingId)
  const query = useMeetingDetail(Number.isInteger(meetingId) && meetingId > 0 ? meetingId : null)
  const cancelMutation = useCancelMeeting()
  const approveInitial = useApproveMeetingRequest()
  const rejectInitial = useRejectMeetingRequest()
  const withdrawReschedule = useCancelMeetingRescheduleRequest()
  const approveReschedule = useApproveMeetingReschedule()
  const rejectReschedule = useRejectMeetingReschedule()

  const [organizerScheduleOpen, setOrganizerScheduleOpen] = useState(false)
  const [coordinatorInitialAdjustOpen, setCoordinatorInitialAdjustOpen] = useState(false)
  const [approveInitialOpen, setApproveInitialOpen] = useState(false)
  const [rejectInitialOpen, setRejectInitialOpen] = useState(false)
  const [rejectInitialReason, setRejectInitialReason] = useState('')
  const [directRescheduleOpen, setDirectRescheduleOpen] = useState(false)
  const [coordinatorAdjustOpen, setCoordinatorAdjustOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<MeetingDetailsTab>('OVERVIEW')
  const [moreOpen, setMoreOpen] = useState(false)

  const arabic = i18n.language.startsWith('ar')
  const locale = arabic ? 'ar-SA' : 'en-SA'

  if (query.isPending) return <LoadingState className="min-h-[50vh]" />
  if (query.isError || !query.data) {
    return <ErrorState className="min-h-[50vh]" onRetry={() => void query.refetch()} />
  }

  const detail = query.data
  const meeting = detail.meeting
  const pendingReschedule = detail.pendingReschedule
  const durationMinutes = Math.max(
    1,
    Math.round(
      (new Date(meeting.endAtUtc).getTime() - new Date(meeting.startAtUtc).getTime()) / 60000,
    ),
  )

  const roomById = new Map<number, MeetingRoom>()
  roomById.set(meeting.room.id, meeting.room)
  for (const revision of detail.revisions) roomById.set(revision.room.id, revision.room)
  if (pendingReschedule) roomById.set(pendingReschedule.room.id, pendingReschedule.room)

  const organizerScheduleLabel = detail.permissions.canEditPendingSchedule
    ? t('meetings.workspace.changeRequestedSchedule')
    : detail.permissions.canEditPendingReschedule
      ? t('meetings.workspace.editRescheduleRequest')
      : t('meetings.workspace.requestReschedule')

  const canOpenOrganizerSchedule =
    detail.permissions.canEditPendingSchedule ||
    detail.permissions.canReschedule ||
    detail.permissions.canEditPendingReschedule

  const currentRoomName = arabic ? meeting.room.nameAr : meeting.room.nameEn
  const currentRoomAccent = getMeetingRoomAccent(meeting.room.colorKey)
  const meetingDateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    numberingSystem: 'latn',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(meeting.startAtUtc))

  const timelineEntries = [
    ...detail.activity.map((item) => ({
      key: `activity-${item.id}`,
      kind: 'ACTIVITY' as const,
      at: item.createdAtUtc,
      item,
    })),
    ...detail.revisions.map((revision) => ({
      key: `revision-${revision.id}`,
      kind: 'REVISION' as const,
      at: revision.decidedAtUtc ?? revision.createdAtUtc,
      revision,
    })),
  ].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())

  async function cancel() {
    try {
      await cancelMutation.mutateAsync({
        meetingId: meeting.id,
        meetingRowVersion: meeting.meetingRowVersion,
        reason: cancelReason.trim() || null,
      })
      toast.success(t('meetings.workspace.cancelled'))
      setCancelOpen(false)
      setCancelReason('')
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.workspace.cancelError'),
        }),
      )
    }
  }

  async function approvePendingInitialRequest() {
    try {
      await approveInitial.mutateAsync({
        meetingId: meeting.id,
        revisionId: meeting.revisionId,
        revisionRowVersion: meeting.revisionRowVersion,
      })
      toast.success(t('meetings.requestApproved'))
      setApproveInitialOpen(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.errors.approve'),
        }),
      )
    }
  }

  async function rejectPendingInitialRequest() {
    try {
      await rejectInitial.mutateAsync({
        meetingId: meeting.id,
        revisionId: meeting.revisionId,
        revisionRowVersion: meeting.revisionRowVersion,
        reason: rejectInitialReason.trim() || null,
      })
      toast.success(t('meetings.requestRejected'))
      setRejectInitialOpen(false)
      setRejectInitialReason('')
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.errors.reject'),
        }),
      )
    }
  }

  async function withdrawPendingReschedule() {
    if (!pendingReschedule) return
    try {
      await withdrawReschedule.mutateAsync({
        meetingId: meeting.id,
        revisionId: pendingReschedule.id,
        revisionRowVersion: pendingReschedule.rowVersion,
        reason: withdrawReason.trim() || null,
      })
      toast.success(t('meetings.workspace.rescheduleWithdrawn'))
      setWithdrawOpen(false)
      setWithdrawReason('')
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.workspace.rescheduleWithdrawError'),
        }),
      )
    }
  }

  async function approvePendingReschedule() {
    if (!pendingReschedule) return
    try {
      await approveReschedule.mutateAsync({
        meetingId: meeting.id,
        revisionId: pendingReschedule.id,
        revisionRowVersion: pendingReschedule.rowVersion,
      })
      toast.success(t('meetings.workspace.rescheduleApproved'))
      setApproveOpen(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.workspace.rescheduleApproveError'),
        }),
      )
    }
  }

  async function rejectPendingReschedule() {
    if (!pendingReschedule) return
    try {
      await rejectReschedule.mutateAsync({
        meetingId: meeting.id,
        revisionId: pendingReschedule.id,
        revisionRowVersion: pendingReschedule.rowVersion,
        reason: rejectReason.trim() || null,
      })
      toast.success(t('meetings.workspace.rescheduleRejected'))
      setRejectOpen(false)
      setRejectReason('')
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.workspace.rescheduleRejectError'),
        }),
      )
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-8 pb-1 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.72fr)] xl:items-start">
        <div className="min-w-0">
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs font-semibold">
            <button
              type="button"
              className="hover:text-foreground transition-colors"
              onClick={() => navigate('/meetings')}
            >
              {t('meetings.myMeetingsTitle')}
            </button>
            <span aria-hidden="true">›</span>
            <span className="text-foreground">{t('meetings.workspace.detailsEyebrow')}</span>
          </div>

          <div className="mt-4 flex min-w-0 items-center gap-3">
            <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
              <CalendarDays aria-hidden="true" className="size-5" />
            </span>
            <h1 className="min-w-0 truncate text-3xl font-bold tracking-tight sm:text-4xl">
              {meeting.title}
            </h1>
          </div>

          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">
            {meeting.description ?? t('meetings.workspace.noDescription')}
          </p>

          <div className="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <span className="inline-flex items-center gap-2 font-semibold text-foreground">
              <CalendarDays aria-hidden="true" className="size-4" />
              {meetingDateLabel}
            </span>

            <span className="inline-flex items-center gap-2 tabular-nums">
              <Clock3 aria-hidden="true" className="size-4" />
              {formatTimeRange(meeting.startAtUtc, meeting.endAtUtc, locale, timeFormat)}
            </span>

            <span aria-hidden="true" className="bg-border hidden h-8 w-px sm:block" />

            <span className="inline-flex min-w-0 items-start gap-2.5">
              <DoorOpen
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
                style={{ color: currentRoomAccent }}
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">{currentRoomName}</span>
                <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                  {meeting.room.locationText ?? t('meetings.noRoomLocation')}
                </span>
              </span>
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-5 [direction:ltr]">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              dir={arabic ? 'rtl' : 'ltr'}
              variant="outline"
              onClick={() => navigate('/meetings')}
            >
                {t('meetings.workspace.back')}
              <ArrowLeft aria-hidden="true" className="size-4" />
            
            </Button>

            {detail.permissions.canDecidePendingRequest ? (
              <>
                <Button
                  dir={arabic ? 'rtl' : 'ltr'}
                  onClick={() => setApproveInitialOpen(true)}
                >
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  {t('meetings.approveAsRequested')}
                </Button>
                <Button
                  dir={arabic ? 'rtl' : 'ltr'}
                  variant="outline"
                  onClick={() => setCoordinatorInitialAdjustOpen(true)}
                >
                  <CalendarClock aria-hidden="true" className="size-4" />
                  {t('meetings.coordinatorSchedule.adjustAndApprove')}
                </Button>
              </>
            ) : detail.permissions.canCoordinatorReschedule && !pendingReschedule ? (
              <Button
                dir={arabic ? 'rtl' : 'ltr'}
                onClick={() => setDirectRescheduleOpen(true)}
              >
                <CalendarClock aria-hidden="true" className="size-4" />
                {t('meetings.workspace.rescheduleMeetingNow')}
              </Button>
            ) : canOpenOrganizerSchedule ? (
              <Button
                dir={arabic ? 'rtl' : 'ltr'}
                onClick={() => setOrganizerScheduleOpen(true)}
              >
                <CalendarClock aria-hidden="true" className="size-4" />
                {organizerScheduleLabel}
              </Button>
            ) : null}

            {detail.permissions.canSaveAsTemplate || detail.permissions.canCancel || detail.permissions.canDecidePendingRequest ? (
              <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t('meetings.workspace.moreActions')}>
                    <Ellipsis aria-hidden="true" className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-1.5">
                  <div className="grid gap-1">
                    {detail.permissions.canSaveAsTemplate ? (
                      <button
                        type="button"
                        className="hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-medium outline-none"
                        onClick={() => {
                          setMoreOpen(false)
                          setTemplateOpen(true)
                        }}
                      >
                        <Save aria-hidden="true" className="text-muted-foreground size-4" />
                        {t('meetings.templates.saveAsTemplate')}
                      </button>
                    ) : null}
                    {detail.permissions.canDecidePendingRequest ? (
                      <button
                        type="button"
                        className="hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-medium outline-none"
                        onClick={() => {
                          setMoreOpen(false)
                          setRejectInitialOpen(true)
                        }}
                      >
                        <XCircle aria-hidden="true" className="text-muted-foreground size-4" />
                        {t('meetings.reject')}
                      </button>
                    ) : null}
                    {detail.permissions.canCancel ? (
                      <>
                        {detail.permissions.canDecidePendingRequest ? (
                          <div className="bg-border my-1 h-px" />
                        ) : null}
                        <button
                          type="button"
                          className="text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-semibold outline-none"
                          onClick={() => {
                            setMoreOpen(false)
                            setCancelOpen(true)
                          }}
                        >
                          <XCircle aria-hidden="true" className="size-4" />
                          {t('meetings.workspace.cancelMeeting')}
                        </button>
                      </>
                    ) : null}
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        </div>
      </section>

      <div
        role="tablist"
        aria-label={t('meetings.workspace.detailsTabsLabel')}
        className="border-border flex w-full justify-center gap-1 overflow-x-auto border-b"
      >
        {([
          ['OVERVIEW', LayoutGrid, t('meetings.workspace.tabs.overview')],
          ['AGENDA', ListChecks, t('meetings.workspace.tabs.agenda')],
          ['FILES', Paperclip, t('meetings.workspace.tabs.files')],
          ['ACTIVITY', History, t('meetings.workspace.tabs.activity')],
        ] as const).map(([tab, Icon, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={cn(
              'relative flex min-h-11 shrink-0 items-center gap-2 px-4 text-sm font-semibold outline-none transition-colors',
              'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
              'focus-visible:bg-muted/60',
              activeTab === tab
                ? 'text-primary after:bg-primary'
                : 'text-muted-foreground hover:text-foreground after:bg-transparent',
            )}
            onClick={() => setActiveTab(tab)}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'OVERVIEW' ? (
        <div role="tabpanel" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              className="overflow-hidden border-border/70 p-0 shadow-sm"
              style={roomAccentSurface(meeting.room, arabic)}
            >
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                      <CalendarClock aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                      <h2 className="font-bold">{t('meetings.workspace.currentSchedule')}</h2>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {t('meetings.workspace.currentScheduleDescription')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={meetingStatusVariant(meeting.status)}>
                    {t(`meetings.status.${meeting.status}`)}
                  </Badge>
                </div>

                <div className="bg-primary/[0.035] text-primary mt-5 rounded-xl border border-primary/10 px-4 py-2.5 text-center text-sm font-bold">
                  {meetingDateLabel}
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {formatTime(meeting.startAtUtc, locale, timeFormat)}
                  </span>
                  <div className="relative h-1 flex-1 rounded-full bg-primary/20">
                    <span className="bg-primary absolute inset-y-0 start-0 end-0 rounded-full" />
                    <span className="bg-primary ring-card absolute top-1/2 start-0 size-3 -translate-y-1/2 rounded-full ring-4" />
                    <span className="bg-primary ring-card absolute top-1/2 end-0 size-3 -translate-y-1/2 rounded-full ring-4" />
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {formatTime(meeting.endAtUtc, locale, timeFormat)}
                  </span>
                </div>

                <div className="mt-5 flex items-start gap-3">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-xl border"
                    style={{
                      color: currentRoomAccent,
                      borderColor: `color-mix(in oklab, ${currentRoomAccent} 30%, var(--border))`,
                      background: `color-mix(in oklab, ${currentRoomAccent} 8%, var(--card))`,
                    }}
                  >
                    <DoorOpen aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{currentRoomName}</p>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {meeting.room.locationText ?? t('meetings.noRoomLocation')}
                    </p>
                  </div>
                </div>

                {meeting.schedulingNotes ? (
                  <div className="bg-muted/30 mt-4 rounded-xl border px-4 py-3">
                    <p className="text-xs font-semibold">{t('meetings.fields.schedulingNotes')}</p>
                    <p className="text-muted-foreground mt-1 text-xs leading-5">
                      {meeting.schedulingNotes}
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="border-border/70 p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 grid size-10 place-items-center rounded-xl">
                    <UsersRound aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-bold">{t('meetings.workspace.participants')}</h2>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {t('meetings.workspace.participantCount', { count: meeting.participantCount })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {[meeting.organizer, ...meeting.attendees].map((participant) => {
                  const organizer = participant.userId === meeting.organizer.userId
                  return (
                    <div
                      key={`${organizer ? 'organizer' : 'attendee'}-${participant.userId}`}
                      className="hover:bg-muted/25 flex items-center gap-3 rounded-xl border border-border/70 px-3.5 py-3 transition-colors"
                    >
                      <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold">
                        {participantInitials(participant)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{participant.userName}</p>
                          {organizer ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {t('meetings.organizer')}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs">{participant.userCode}</p>
                      </div>
                      <UserRound aria-hidden="true" className="text-muted-foreground size-4" />
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          {pendingReschedule ? (
            <Card className="border-warning/35 bg-warning/5 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="bg-warning/10 text-warning grid size-10 shrink-0 place-items-center rounded-xl">
                    <RefreshCcw aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold">{t('meetings.workspace.pendingReschedule')}</h2>
                    <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
                      {t('meetings.workspace.pendingRescheduleDescription')}
                    </p>
                  </div>
                </div>
                <Badge variant="warning">{t('meetings.workspace.awaitingCoordinator')}</Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl border bg-background/70 p-3.5">
                  {formatDateTime(pendingReschedule.startAtUtc, locale, timeFormat)} →{' '}
                  {formatDateTime(pendingReschedule.endAtUtc, locale, timeFormat)}
                </div>
                <div className="rounded-xl border bg-background/70 p-3.5">
                  {arabic ? pendingReschedule.room.nameAr : pendingReschedule.room.nameEn}
                </div>
              </div>

              {detail.permissions.canCancelPendingReschedule ? (
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
                  <Button variant="outline" onClick={() => setOrganizerScheduleOpen(true)}>
                    {t('meetings.workspace.editRescheduleRequest')}
                  </Button>
                  <Button variant="outline" onClick={() => setWithdrawOpen(true)}>
                    {t('meetings.workspace.withdrawReschedule')}
                  </Button>
                </div>
              ) : null}

              {detail.permissions.canDecidePendingReschedule ? (
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
                  <Button variant="outline" onClick={() => setRejectOpen(true)}>
                    {t('meetings.reject')}
                  </Button>
                  <Button variant="outline" onClick={() => setCoordinatorAdjustOpen(true)}>
                    {t('meetings.coordinatorSchedule.adjustAndApprove')}
                  </Button>
                  <Button onClick={() => setApproveOpen(true)}>
                    {t('meetings.approveAsRequested')}
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="border-border/70 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                    <ListChecks aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <h2 className="font-bold">{t('meetings.create.agenda.title')}</h2>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {t('meetings.workspace.agendaPreviewDescription')}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setActiveTab('AGENDA')}>
                  {detail.permissions.canManageAgenda
                    ? t('meetings.workspace.manageAgenda')
                    : t('meetings.workspace.viewAgenda')}
                </Button>
              </div>

              {detail.agendaItems.length > 0 ? (
                <ol className="mt-4 space-y-2">
                  {detail.agendaItems.slice(0, 3).map((item, index) => (
                    <li key={item.id} className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-muted/10 p-2.5">
                      <span className="bg-background text-primary grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-xs font-semibold">{item.topic}</p>
                        {item.presenter || item.plannedDurationMinutes !== null ? (
                          <p className="text-muted-foreground mt-1 truncate text-[11px]">
                            {item.presenter?.userName ?? t('meetings.create.agenda.noPresenter')}
                            {item.plannedDurationMinutes !== null
                              ? ` · ${t('meetings.create.agenda.minutesValue', { count: item.plannedDurationMinutes })}`
                              : ''}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="bg-muted/10 mt-4 rounded-xl border border-dashed px-4 py-7 text-center">
                  <span className="bg-background text-primary mx-auto grid size-10 place-items-center rounded-full border shadow-xs">
                    <ListChecks aria-hidden="true" className="size-4" />
                  </span>
                  <p className="mt-3 text-sm font-semibold">{t('meetings.create.agenda.noAgenda')}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{t('meetings.workspace.agendaDescription')}</p>
                </div>
              )}

              {detail.agendaItems.length > 3 ? (
                <p className="text-muted-foreground mt-3 text-xs">
                  {t('meetings.workspace.moreAgendaTopics', { count: detail.agendaItems.length - 3 })}
                </p>
              ) : null}
            </Card>

            <MeetingFilesPreview
              meetingId={meeting.id}
              canManage={detail.permissions.canManageAttachments}
              onOpenFull={() => setActiveTab('FILES')}
            />

            <Card className="border-border/70 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="bg-violet-500/10 text-violet-600 dark:text-violet-300 grid size-9 shrink-0 place-items-center rounded-xl">
                    <History aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <h2 className="font-bold">{t('meetings.workspace.tabs.activity')}</h2>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {t('meetings.workspace.activityPreviewDescription')}
                    </p>
                  </div>
                </div>
              </div>

              {timelineEntries.length > 0 ? (
                <div className="mt-4 space-y-0">
                  {timelineEntries.slice(0, 3).map((entry, index) => {
                    const isActivity = entry.kind === 'ACTIVITY'
                    const presentation = isActivity
                      ? activityPresentation(entry.item.activityType)
                      : {
                          icon: CalendarClock,
                          iconClassName: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
                        }
                    const Icon = presentation.icon
                    return (
                      <div key={entry.key} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < Math.min(3, timelineEntries.length) - 1 ? (
                          <span className="bg-border absolute top-8 bottom-0 start-[15px] w-px" />
                        ) : null}
                        <span className={cn('relative z-[1] grid size-8 shrink-0 place-items-center rounded-full', presentation.iconClassName)}>
                          <Icon aria-hidden="true" className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">
                            {isActivity
                              ? t(`meetings.workspace.activityTypes.${entry.item.activityType}`, {
                                  defaultValue: entry.item.activityType,
                                })
                              : t('meetings.workspace.revision', { number: entry.revision.revisionNumber })}
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
                            {formatDateTime(entry.at, locale, timeFormat)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="bg-muted/10 mt-4 rounded-xl border border-dashed px-4 py-7 text-center">
                  <History aria-hidden="true" className="text-muted-foreground mx-auto size-6" />
                  <p className="mt-3 text-sm font-semibold">{t('meetings.workspace.noActivity')}</p>
                </div>
              )}

              <button
                type="button"
                className="text-primary hover:text-primary/80 mt-4 text-xs font-semibold transition-colors"
                onClick={() => setActiveTab('ACTIVITY')}
              >
                {t('meetings.workspace.viewAllActivity')}
              </button>
            </Card>
          </div>
        </div>
      ) : null}

      {activeTab === 'AGENDA' ? (
        <div role="tabpanel">
          {detail.permissions.canManageAgenda ? (
            <MeetingAgendaWorkspace detail={detail} meetingDurationMinutes={durationMinutes} />
          ) : (
            <MeetingAgendaDisplay
              items={detail.agendaItems}
              meetingDurationMinutes={durationMinutes}
              className="shadow-sm"
            />
          )}
        </div>
      ) : null}

      {activeTab === 'FILES' ? (
        <div role="tabpanel">
          <MeetingFilesPanel meetingId={meeting.id} canManage={detail.permissions.canManageAttachments} />
        </div>
      ) : null}

      {activeTab === 'ACTIVITY' ? (
        <div role="tabpanel">
          <Card className="border-border/70 p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                <History aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-bold">{t('meetings.workspace.tabs.activity')}</h2>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {t('meetings.workspace.activityTimelineDescription')}
                </p>
              </div>
            </div>

            {timelineEntries.length > 0 ? (
              <div className="mt-6 space-y-0">
                {timelineEntries.map((entry, index) => {
                  if (entry.kind === 'ACTIVITY') {
                    const presentation = activityPresentation(entry.item.activityType)
                    const Icon = presentation.icon
                    return (
                      <div key={entry.key} className="relative flex gap-4 pb-6 last:pb-0">
                        {index < timelineEntries.length - 1 ? (
                          <span className="bg-border absolute top-10 bottom-0 start-[19px] w-px" />
                        ) : null}
                        <span
                          className={cn(
                            'relative z-[1] grid size-10 shrink-0 place-items-center rounded-full border border-background shadow-sm',
                            presentation.iconClassName,
                          )}
                        >
                          <Icon aria-hidden="true" className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-card px-4 py-3.5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">
                                {t(`meetings.workspace.activityTypes.${entry.item.activityType}`, {
                                  defaultValue: entry.item.activityType,
                                })}
                              </p>
                              <p className="text-muted-foreground mt-1 text-xs">
                                {entry.item.actor.userName}
                              </p>
                            </div>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {formatDateTime(entry.item.createdAtUtc, locale, timeFormat)}
                            </span>
                          </div>
                          <ActivityScheduleDetails
                            item={entry.item}
                            roomById={roomById}
                            locale={locale}
                            arabic={arabic}
                          />
                          <ActivityMetadata item={entry.item} />
                        </div>
                      </div>
                    )
                  }

                  const revision = entry.revision
                  return (
                    <div key={entry.key} className="relative flex gap-4 pb-6 last:pb-0">
                      {index < timelineEntries.length - 1 ? (
                        <span className="bg-border absolute top-10 bottom-0 start-[19px] w-px" />
                      ) : null}
                      <span className="bg-violet-500/10 text-violet-600 dark:text-violet-300 relative z-[1] grid size-10 shrink-0 place-items-center rounded-full border border-background shadow-sm">
                        <CalendarClock aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-card px-4 py-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">
                              {t('meetings.workspace.revision', { number: revision.revisionNumber })}
                            </p>
                            <Badge variant={revisionVariant(revision.revisionStatus)}>
                              {t(`meetings.workspace.revisionStatus.${revision.revisionStatus}`)}
                            </Badge>
                          </div>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {formatDateTime(entry.at, locale, timeFormat)}
                          </span>
                        </div>
                        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <span>
                            {formatDateTime(revision.startAtUtc, locale, timeFormat)} →{' '}
                            {formatDateTime(revision.endAtUtc, locale, timeFormat)}
                          </span>
                          <span>{arabic ? revision.room.nameAr : revision.room.nameEn}</span>
                        </div>
                        <p className="text-muted-foreground mt-2 text-xs">
                          {t('meetings.workspace.requestedBy', { name: revision.requestedBy.userName })}
                          {revision.approvedBy
                            ? ` · ${t('meetings.workspace.approvedBy', { name: revision.approvedBy.userName })}`
                            : ''}
                          {revision.rejectedBy
                            ? ` · ${t('meetings.workspace.rejectedBy', { name: revision.rejectedBy.userName })}`
                            : ''}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-muted/20 mt-6 rounded-xl border border-dashed px-5 py-10 text-center">
                <History aria-hidden="true" className="text-muted-foreground mx-auto size-7" />
                <p className="mt-3 text-sm font-semibold">{t('meetings.workspace.noActivity')}</p>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {organizerScheduleOpen ? (
        <MeetingRescheduleDialog detail={detail} open onOpenChange={setOrganizerScheduleOpen} />
      ) : null}
      {coordinatorInitialAdjustOpen ? (
        <CoordinatorMeetingScheduleDialog
          meeting={meeting}
          open
          onOpenChange={setCoordinatorInitialAdjustOpen}
        />
      ) : null}
      {directRescheduleOpen ? (
        <CoordinatorDirectRescheduleDialog
          detail={detail}
          open
          onOpenChange={setDirectRescheduleOpen}
        />
      ) : null}
      {coordinatorAdjustOpen && pendingReschedule ? (
        <CoordinatorRescheduleDialog
          item={{ meeting, requestedRevision: pendingReschedule }}
          open
          onOpenChange={setCoordinatorAdjustOpen}
        />
      ) : null}
      {templateOpen ? (
        <MeetingTemplateEditorDialog
          open
          initialMeeting={{
            title: meeting.title,
            description: meeting.description,
            roomId: meeting.room.id,
            attendeeUserIds: meeting.attendees.map((item) => item.userId),
            attendees: meeting.attendees,
            durationMinutes,
          }}
          onOpenChange={setTemplateOpen}
        />
      ) : null}

      <ConfirmModal
        open={approveInitialOpen}
        title={t('meetings.approveTitle')}
        message={t('meetings.approveDescription', { title: meeting.title })}
        confirmText={t('meetings.approveAsRequested')}
        cancelText={t('common.cancel')}
        loading={approveInitial.isPending}
        onConfirm={() => void approvePendingInitialRequest()}
        onCancel={() => setApproveInitialOpen(false)}
      />

      <ConfirmModal
        open={rejectInitialOpen}
        title={t('meetings.rejectTitle')}
        message={t('meetings.rejectDescription', { title: meeting.title })}
        confirmText={t('meetings.reject')}
        cancelText={t('common.cancel')}
        danger
        loading={rejectInitial.isPending}
        onConfirm={() => void rejectPendingInitialRequest()}
        onCancel={() => {
          setRejectInitialOpen(false)
          setRejectInitialReason('')
        }}
      >
        <TextareaField
          label={t('meetings.rejectionReason')}
          value={rejectInitialReason}
          maxLength={1000}
          onChange={(event) => setRejectInitialReason(event.target.value)}
        />
      </ConfirmModal>

      <ConfirmModal
        open={withdrawOpen}
        title={t('meetings.workspace.withdrawRescheduleTitle')}
        message={t('meetings.workspace.withdrawRescheduleDescription')}
        confirmText={t('meetings.workspace.withdrawReschedule')}
        cancelText={t('common.cancel')}
        loading={withdrawReschedule.isPending}
        onConfirm={() => void withdrawPendingReschedule()}
        onCancel={() => {
          setWithdrawOpen(false)
          setWithdrawReason('')
        }}
      >
        <TextareaField
          label={t('meetings.workspace.cancelRescheduleReason')}
          value={withdrawReason}
          maxLength={1000}
          onChange={(event) => setWithdrawReason(event.target.value)}
        />
      </ConfirmModal>

      <ConfirmModal
        open={approveOpen}
        title={t('meetings.workspace.approveRescheduleTitle')}
        message={t('meetings.workspace.approveRescheduleDescription')}
        confirmText={t('meetings.approveAsRequested')}
        cancelText={t('common.cancel')}
        loading={approveReschedule.isPending}
        onConfirm={() => void approvePendingReschedule()}
        onCancel={() => setApproveOpen(false)}
      />

      <ConfirmModal
        open={rejectOpen}
        title={t('meetings.workspace.rejectRescheduleTitle')}
        message={t('meetings.workspace.rejectRescheduleDescription')}
        confirmText={t('meetings.reject')}
        cancelText={t('common.cancel')}
        danger
        loading={rejectReschedule.isPending}
        onConfirm={() => void rejectPendingReschedule()}
        onCancel={() => {
          setRejectOpen(false)
          setRejectReason('')
        }}
      >
        <TextareaField
          label={t('meetings.rejectionReason')}
          value={rejectReason}
          maxLength={1000}
          onChange={(event) => setRejectReason(event.target.value)}
        />
      </ConfirmModal>

      <ConfirmModal
        open={cancelOpen}
        title={t('meetings.workspace.cancelTitle')}
        message={t('meetings.workspace.cancelDescription', { title: meeting.title })}
        confirmText={t('meetings.workspace.cancelMeeting')}
        cancelText={t('common.cancel')}
        danger
        loading={cancelMutation.isPending}
        onConfirm={() => void cancel()}
        onCancel={() => {
          setCancelOpen(false)
          setCancelReason('')
        }}
      >
        <TextareaField
          label={t('meetings.workspace.cancelReason')}
          value={cancelReason}
          maxLength={1000}
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </ConfirmModal>
    </div>
  )
}

