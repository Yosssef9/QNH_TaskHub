import {
  BellRing,
  CalendarClock,
  ClipboardCheck,
  Hourglass,
  RefreshCcw,
  SearchX,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { TextareaField } from '@/components/shared/Input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CoordinatorMeetingQueueCard } from '@/features/meetings/components/CoordinatorMeetingQueueCard'
import { CoordinatorMeetingScheduleDialog } from '@/features/meetings/components/CoordinatorMeetingScheduleDialog'
import { CoordinatorRescheduleDialog } from '@/features/meetings/components/CoordinatorRescheduleDialog'
import { MeetingCollectionState } from '@/features/meetings/components/MeetingCollectionState'
import { MeetingRescheduleQueueCard } from '@/features/meetings/components/MeetingRescheduleQueueCard'
import {
  useApproveMeetingRequest,
  useApproveMeetingReschedule,
  useCoordinatorMeetingQueue,
  useCoordinatorReschedules,
  useRejectMeetingRequest,
  useRejectMeetingReschedule,
} from '@/features/meetings/hooks/use-meetings'
import type {
  MeetingRescheduleQueueItem,
  MeetingRoom,
  MeetingSummary,
} from '@/features/meetings/types/meeting.types'
import { toApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'
import { formatRiyadhDateInput } from '@/lib/date-time'

type QueueTab = 'REQUESTS' | 'RESCHEDULES'
type DateFilter = 'ALL' | 'TODAY' | 'TOMORROW' | 'NEXT_7'

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function dateKeyToUtcNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`)
}

function groupByScheduleDate<T>(
  items: readonly T[],
  scheduleValue: (item: T) => string,
): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const key = formatRiyadhDateInput(scheduleValue(item))
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function ageMinutes(createdAtUtc: string | null | undefined, now: Date): number | null {
  if (!createdAtUtc) return null
  const createdAt = new Date(createdAtUtc).getTime()
  if (!Number.isFinite(createdAt)) return null
  return Math.max(0, Math.floor((now.getTime() - createdAt) / 60_000))
}

export function MeetingCoordinationPage() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-SA'

  const queue = useCoordinatorMeetingQueue(true)
  const reschedules = useCoordinatorReschedules(true)
  const approveRequest = useApproveMeetingRequest()
  const rejectRequest = useRejectMeetingRequest()
  const approveReschedule = useApproveMeetingReschedule()
  const rejectReschedule = useRejectMeetingReschedule()

  const [tab, setTab] = useState<QueueTab>('REQUESTS')
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('ALL')
  const [organizerFilter, setOrganizerFilter] = useState('ALL')
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL')
  const [now, setNow] = useState(() => new Date())

  const [editingSchedule, setEditingSchedule] = useState<MeetingSummary | null>(null)
  const [approvingMeeting, setApprovingMeeting] = useState<MeetingSummary | null>(null)
  const [rejectingMeeting, setRejectingMeeting] = useState<MeetingSummary | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [editingReschedule, setEditingReschedule] = useState<MeetingRescheduleQueueItem | null>(null)
  const [approvingReschedule, setApprovingReschedule] =
    useState<MeetingRescheduleQueueItem | null>(null)
  const [rejectingReschedule, setRejectingReschedule] =
    useState<MeetingRescheduleQueueItem | null>(null)
  const [rescheduleRejectReason, setRescheduleRejectReason] = useState('')

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  async function approve() {
    if (!approvingMeeting) return
    try {
      await approveRequest.mutateAsync({
        meetingId: approvingMeeting.id,
        revisionId: approvingMeeting.revisionId,
        revisionRowVersion: approvingMeeting.revisionRowVersion,
      })
      toast.success(t('meetings.requestApproved'))
      setApprovingMeeting(null)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.errors.approve'),
        }),
      )
    }
  }

  async function reject() {
    if (!rejectingMeeting) return
    try {
      await rejectRequest.mutateAsync({
        meetingId: rejectingMeeting.id,
        revisionId: rejectingMeeting.revisionId,
        revisionRowVersion: rejectingMeeting.revisionRowVersion,
        reason: rejectionReason.trim() || null,
      })
      toast.success(t('meetings.requestRejected'))
      setRejectingMeeting(null)
      setRejectionReason('')
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.errors.reject'),
        }),
      )
    }
  }

  async function approvePendingReschedule() {
    if (!approvingReschedule) return
    try {
      await approveReschedule.mutateAsync({
        meetingId: approvingReschedule.meeting.id,
        revisionId: approvingReschedule.requestedRevision.id,
        revisionRowVersion: approvingReschedule.requestedRevision.rowVersion,
      })
      toast.success(t('meetings.workspace.rescheduleApproved'))
      setApprovingReschedule(null)
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
    if (!rejectingReschedule) return
    try {
      await rejectReschedule.mutateAsync({
        meetingId: rejectingReschedule.meeting.id,
        revisionId: rejectingReschedule.requestedRevision.id,
        revisionRowVersion: rejectingReschedule.requestedRevision.rowVersion,
        reason: rescheduleRejectReason.trim() || null,
      })
      toast.success(t('meetings.workspace.rescheduleRejected'))
      setRejectingReschedule(null)
      setRescheduleRejectReason('')
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.workspace.rescheduleRejectError'),
        }),
      )
    }
  }

  const requestItems = queue.data ?? []
  const rescheduleItems = reschedules.data ?? []
  const requestCount = requestItems.length
  const rescheduleCount = rescheduleItems.length
  const pendingDecisionCount = requestCount + rescheduleCount
  const todayKey = formatRiyadhDateInput(now)
  const tomorrowKey = addDays(todayKey, 1)
  const nextSevenEnd = addDays(todayKey, 6)

  function formatAgeValue(createdAtUtc: string | null | undefined): string {
    const minutes = ageMinutes(createdAtUtc, now)
    if (minutes === null) return t('meetings.coordination.waitingUnknown')
    if (minutes < 1) return t('meetings.coordination.justNow')
    if (minutes < 60) {
      return t('meetings.coordination.minutesValue', { count: minutes })
    }

    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    if (hours < 24) {
      return remainingMinutes > 0
        ? t('meetings.coordination.hoursMinutesValue', {
            hours,
            minutes: remainingMinutes,
          })
        : t('meetings.coordination.hoursValue', { count: hours })
    }

    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return remainingHours > 0
      ? t('meetings.coordination.daysHoursValue', { days, hours: remainingHours })
      : t('meetings.coordination.daysValue', { count: days })
  }

  function waitingLabel(createdAtUtc: string | null | undefined): string {
    if (!createdAtUtc) return t('meetings.coordination.waitingUnknown')
    return t('meetings.coordination.waitingFor', { value: formatAgeValue(createdAtUtc) })
  }

  const oldestCreatedAt = useMemo(() => {
    const candidates = [
      ...requestItems.map((meeting) => meeting.revisionCreatedAtUtc),
      ...rescheduleItems.map((item) => item.requestedRevision.createdAtUtc),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite)

    if (candidates.length === 0) return null
    return new Date(Math.min(...candidates)).toISOString()
  }, [requestItems, rescheduleItems])

  const rooms = useMemo(() => {
    const map = new Map<number, MeetingRoom>()
    for (const meeting of requestItems) map.set(meeting.room.id, meeting.room)
    for (const item of rescheduleItems) {
      map.set(item.requestedRevision.room.id, item.requestedRevision.room)
    }

    return [...map.values()].sort((left, right) => {
      const leftName = i18n.language.startsWith('ar') ? left.nameAr : left.nameEn
      const rightName = i18n.language.startsWith('ar') ? right.nameAr : right.nameEn
      return leftName.localeCompare(rightName, i18n.language)
    })
  }, [i18n.language, requestItems, rescheduleItems])

  const organizers = useMemo(() => {
    const map = new Map<number, MeetingSummary['organizer']>()
    for (const meeting of requestItems) map.set(meeting.organizer.userId, meeting.organizer)
    for (const item of rescheduleItems) {
      map.set(item.meeting.organizer.userId, item.meeting.organizer)
    }
    return [...map.values()].sort((left, right) =>
      left.userName.localeCompare(right.userName, i18n.language),
    )
  }, [i18n.language, requestItems, rescheduleItems])

  function matchesDate(value: string): boolean {
    if (dateFilter === 'ALL') return true
    const key = formatRiyadhDateInput(value)
    if (dateFilter === 'TODAY') return key === todayKey
    if (dateFilter === 'TOMORROW') return key === tomorrowKey
    return key >= todayKey && key <= nextSevenEnd
  }

  function matchesSearch(meeting: MeetingSummary, room: MeetingRoom): boolean {
    const normalized = search.trim().toLocaleLowerCase(i18n.language)
    if (!normalized) return true

    const haystack = [
      meeting.title,
      meeting.description ?? '',
      meeting.organizer.userName,
      meeting.organizer.userCode,
      room.nameAr,
      room.nameEn,
      room.locationText ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase(i18n.language)

    return haystack.includes(normalized)
  }

  const filteredRequests = requestItems.filter(
    (meeting) =>
      (roomFilter === 'ALL' || meeting.room.id === Number(roomFilter)) &&
      (organizerFilter === 'ALL' || meeting.organizer.userId === Number(organizerFilter)) &&
      matchesDate(meeting.startAtUtc) &&
      matchesSearch(meeting, meeting.room),
  )

  const filteredReschedules = rescheduleItems.filter((item) => {
    const requested = item.requestedRevision
    return (
      (roomFilter === 'ALL' || requested.room.id === Number(roomFilter)) &&
      (organizerFilter === 'ALL' ||
        item.meeting.organizer.userId === Number(organizerFilter)) &&
      matchesDate(requested.startAtUtc) &&
      matchesSearch(item.meeting, requested.room)
    )
  })

  const requestGroups = groupByScheduleDate(
    filteredRequests,
    (meeting) => meeting.startAtUtc,
  )
  const rescheduleGroups = groupByScheduleDate(
    filteredReschedules,
    (item) => item.requestedRevision.startAtUtc,
  )

  const groupDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        numberingSystem: 'latn',
        timeZone: 'UTC',
      }),
    [locale],
  )

  function groupLabel(dateKey: string): string {
    const formatted = groupDateFormatter.format(dateKeyToUtcNoon(dateKey))
    if (dateKey === todayKey) {
      return `${t('meetings.coordination.today')} — ${formatted}`
    }
    if (dateKey === tomorrowKey) {
      return `${t('meetings.coordination.tomorrow')} — ${formatted}`
    }
    return formatted
  }

  function clearFilters() {
    setSearch('')
    setRoomFilter('ALL')
    setOrganizerFilter('ALL')
    setDateFilter('ALL')
  }

  function reviewQueue() {
    clearFilters()
    setTab(requestCount > 0 ? 'REQUESTS' : 'RESCHEDULES')
  }

  const filtersActive =
    search.trim().length > 0 ||
    roomFilter !== 'ALL' ||
    organizerFilter !== 'ALL' ||
    dateFilter !== 'ALL'

  const selectedRoom =
    roomFilter === 'ALL' ? null : rooms.find((room) => room.id === Number(roomFilter)) ?? null
  const selectedOrganizer =
    organizerFilter === 'ALL'
      ? null
      : organizers.find((organizer) => organizer.userId === Number(organizerFilter)) ?? null

  const dateFilterLabel =
    dateFilter === 'TODAY'
      ? t('meetings.coordination.today')
      : dateFilter === 'TOMORROW'
        ? t('meetings.coordination.tomorrow')
        : dateFilter === 'NEXT_7'
          ? t('meetings.coordination.nextSevenDays')
          : t('meetings.coordination.allDates')

  const metricCards = [
    {
      label: t('meetings.coordination.meetingRequestsMetric'),
      value: requestCount,
      icon: ClipboardCheck,
      iconClass: 'bg-primary/10 text-primary',
    },
    {
      label: t('meetings.coordination.rescheduleRequestsMetric'),
      value: rescheduleCount,
      icon: RefreshCcw,
      iconClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    },
    {
      label: t('meetings.coordination.oldestWaitingMetric'),
      value: oldestCreatedAt ? formatAgeValue(oldestCreatedAt) : '—',
      icon: Hourglass,
      iconClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t('meetings.eyebrow')}
        title={t('meetings.coordinationQueueTitle')}
        description={t('meetings.coordinationQueueDescription')}
      />

      <section className="grid gap-3 xl:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
        <Card
          className={cn(
            'overflow-hidden p-5 shadow-sm',
            pendingDecisionCount > 0
              ? 'border-amber-500/25 bg-gradient-to-br from-amber-500/[0.08] via-card to-card'
              : 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card',
          )}
        >
          <div className="flex h-full items-start gap-4">
            <span
              className={cn(
                'grid size-11 shrink-0 place-items-center rounded-2xl',
                pendingDecisionCount > 0
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
              )}
            >
              <BellRing aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <Badge variant={pendingDecisionCount > 0 ? 'warning' : 'success'}>
                {pendingDecisionCount > 0
                  ? t('meetings.coordination.needsDecision')
                  : t('meetings.coordination.allCaughtUp')}
              </Badge>
              <p className="mt-2 text-lg font-bold">
                {pendingDecisionCount > 0
                  ? t('meetings.coordination.pendingDecisionCount', {
                      count: pendingDecisionCount,
                    })
                  : t('meetings.coordination.noPendingDecisions')}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('meetings.coordination.pendingBreakdown', {
                  requests: requestCount,
                  reschedules: rescheduleCount,
                })}
              </p>
              {pendingDecisionCount > 0 ? (
                <Button variant="outline" size="sm" className="mt-3" onClick={reviewQueue}>
                  {t('meetings.coordination.reviewNow')}
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        {metricCards.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.label} className="p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs font-semibold">{metric.label}</p>
                  <p className="mt-2 truncate text-2xl font-bold tabular-nums">{metric.value}</p>
                </div>
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', metric.iconClass)}>
                  <Icon aria-hidden="true" className="size-5" />
                </span>
              </div>
            </Card>
          )
        })}
      </section>

      <Card className="p-1.5 shadow-sm">
        <div
          role="tablist"
          aria-label={t('meetings.coordinationQueueTitle')}
          className="grid gap-1 sm:grid-cols-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'REQUESTS'}
            className={cn(
              'flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold',
              tab === 'REQUESTS'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => setTab('REQUESTS')}
          >
            <ClipboardCheck aria-hidden="true" className="size-4" />
            {t('meetings.coordination.requestsTab')}
            <Badge variant="secondary">{requestCount}</Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'RESCHEDULES'}
            className={cn(
              'flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold',
              tab === 'RESCHEDULES'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => setTab('RESCHEDULES')}
          >
            <CalendarClock aria-hidden="true" className="size-4" />
            {t('meetings.coordination.reschedulesTab')}
            <Badge variant="secondary">{rescheduleCount}</Badge>
          </button>
        </div>
      </Card>

      <Card className="p-3 shadow-sm">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            ariaLabel={t('meetings.coordination.searchLabel')}
            placeholder={t('meetings.coordination.searchPlaceholder')}
            className="xl:max-w-sm"
          />

          <div className="grid flex-1 gap-2 sm:grid-cols-3">
            <Select value={roomFilter} onValueChange={setRoomFilter}>
              <SelectTrigger aria-label={t('meetings.coordination.roomFilter')}>
                <SelectValue>
                  {selectedRoom
                    ? i18n.language.startsWith('ar')
                      ? selectedRoom.nameAr
                      : selectedRoom.nameEn
                    : t('meetings.coordination.allRooms')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('meetings.coordination.allRooms')}</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={String(room.id)}>
                    {i18n.language.startsWith('ar') ? room.nameAr : room.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={organizerFilter} onValueChange={setOrganizerFilter}>
              <SelectTrigger aria-label={t('meetings.coordination.organizerFilter')}>
                <SelectValue>
                  {selectedOrganizer?.userName ?? t('meetings.coordination.allOrganizers')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('meetings.coordination.allOrganizers')}</SelectItem>
                {organizers.map((organizer) => (
                  <SelectItem key={organizer.userId} value={String(organizer.userId)}>
                    {organizer.userName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={dateFilter}
              onValueChange={(value) => setDateFilter(value as DateFilter)}
            >
              <SelectTrigger aria-label={t('meetings.coordination.dateFilter')}>
                <SelectValue>{dateFilterLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('meetings.coordination.allDates')}</SelectItem>
                <SelectItem value="TODAY">{t('meetings.coordination.today')}</SelectItem>
                <SelectItem value="TOMORROW">{t('meetings.coordination.tomorrow')}</SelectItem>
                <SelectItem value="NEXT_7">{t('meetings.coordination.nextSevenDays')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtersActive ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {t('meetings.coordination.clearFilters')}
            </Button>
          ) : null}
        </div>
      </Card>

      {tab === 'REQUESTS' ? (
        <MeetingCollectionState
          pending={queue.isPending}
          error={queue.isError}
          empty={requestCount === 0}
          emptyTitle={t('meetings.queueEmptyTitle')}
          emptyDescription={t('meetings.queueEmptyDescription')}
          onRetry={() => void queue.refetch()}
          icon={ClipboardCheck}
          className="!grid-cols-1 xl:!grid-cols-1"
        >
          {filteredRequests.length === 0 ? (
            <Card className="border-dashed p-10 text-center">
              <SearchX aria-hidden="true" className="text-muted-foreground mx-auto size-8" />
              <h2 className="mt-3 font-semibold">{t('meetings.coordination.noFilteredTitle')}</h2>
              <p className="text-muted-foreground mx-auto mt-1 max-w-lg text-sm">
                {t('meetings.coordination.noFilteredDescription')}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                {t('meetings.coordination.clearFilters')}
              </Button>
            </Card>
          ) : (
            <div className="space-y-5">
              {requestGroups.map(([dateKey, items]) => (
                <section key={dateKey} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <h2 className="text-sm font-bold">{groupLabel(dateKey)}</h2>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {items.map((meeting) => (
                      <CoordinatorMeetingQueueCard
                        key={meeting.id}
                        meeting={meeting}
                        waitingLabel={waitingLabel(meeting.revisionCreatedAtUtc)}
                        onOpen={() => navigate(`/meetings/${meeting.id}`)}
                        onEditSchedule={() => setEditingSchedule(meeting)}
                        onApprove={() => setApprovingMeeting(meeting)}
                        onReject={() => {
                          setRejectingMeeting(meeting)
                          setRejectionReason('')
                        }}
                        approving={
                          approveRequest.isPending && approvingMeeting?.id === meeting.id
                        }
                        rejecting={
                          rejectRequest.isPending && rejectingMeeting?.id === meeting.id
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </MeetingCollectionState>
      ) : (
        <MeetingCollectionState
          pending={reschedules.isPending}
          error={reschedules.isError}
          empty={rescheduleCount === 0}
          emptyTitle={t('meetings.workspace.noReschedules')}
          emptyDescription={t('meetings.workspace.noReschedulesDescription')}
          onRetry={() => void reschedules.refetch()}
          icon={CalendarClock}
          className="!grid-cols-1 xl:!grid-cols-1"
        >
          {filteredReschedules.length === 0 ? (
            <Card className="border-dashed p-10 text-center">
              <SearchX aria-hidden="true" className="text-muted-foreground mx-auto size-8" />
              <h2 className="mt-3 font-semibold">{t('meetings.coordination.noFilteredTitle')}</h2>
              <p className="text-muted-foreground mx-auto mt-1 max-w-lg text-sm">
                {t('meetings.coordination.noFilteredDescription')}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                {t('meetings.coordination.clearFilters')}
              </Button>
            </Card>
          ) : (
            <div className="space-y-5">
              {rescheduleGroups.map(([dateKey, items]) => (
                <section key={dateKey} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <h2 className="text-sm font-bold">{groupLabel(dateKey)}</h2>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {items.map((item) => (
                      <MeetingRescheduleQueueCard
                        key={item.meeting.id}
                        item={item}
                        waitingLabel={waitingLabel(item.requestedRevision.createdAtUtc)}
                        onOpen={() => navigate(`/meetings/${item.meeting.id}`)}
                        onEdit={() => setEditingReschedule(item)}
                        onApprove={() => setApprovingReschedule(item)}
                        onReject={() => {
                          setRejectingReschedule(item)
                          setRescheduleRejectReason('')
                        }}
                        approving={
                          approveReschedule.isPending &&
                          approvingReschedule?.meeting.id === item.meeting.id
                        }
                        rejecting={
                          rejectReschedule.isPending &&
                          rejectingReschedule?.meeting.id === item.meeting.id
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </MeetingCollectionState>
      )}

      {editingSchedule ? (
        <CoordinatorMeetingScheduleDialog
          key={`${editingSchedule.id}-${editingSchedule.revisionRowVersion}`}
          meeting={editingSchedule}
          open
          onOpenChange={(open) => {
            if (!open) setEditingSchedule(null)
          }}
        />
      ) : null}

      {editingReschedule ? (
        <CoordinatorRescheduleDialog
          item={editingReschedule}
          open
          onOpenChange={(open) => {
            if (!open) setEditingReschedule(null)
          }}
        />
      ) : null}

      <ConfirmModal
        open={approvingMeeting !== null}
        title={t('meetings.approveTitle')}
        message={t('meetings.approveDescription', { title: approvingMeeting?.title ?? '' })}
        confirmText={t('meetings.approveAsRequested')}
        cancelText={t('common.cancel')}
        loading={approveRequest.isPending}
        onConfirm={() => void approve()}
        onCancel={() => setApprovingMeeting(null)}
      />

      <ConfirmModal
        open={rejectingMeeting !== null}
        title={t('meetings.rejectTitle')}
        message={t('meetings.rejectDescription', { title: rejectingMeeting?.title ?? '' })}
        confirmText={t('meetings.reject')}
        cancelText={t('common.cancel')}
        danger
        loading={rejectRequest.isPending}
        onConfirm={() => void reject()}
        onCancel={() => {
          setRejectingMeeting(null)
          setRejectionReason('')
        }}
      >
        <TextareaField
          label={t('meetings.rejectionReason')}
          value={rejectionReason}
          maxLength={1000}
          onChange={(event) => setRejectionReason(event.target.value)}
        />
      </ConfirmModal>

      <ConfirmModal
        open={approvingReschedule !== null}
        title={t('meetings.workspace.approveRescheduleTitle')}
        message={t('meetings.workspace.approveRescheduleDescription')}
        confirmText={t('meetings.approveAsRequested')}
        cancelText={t('common.cancel')}
        loading={approveReschedule.isPending}
        onConfirm={() => void approvePendingReschedule()}
        onCancel={() => setApprovingReschedule(null)}
      />

      <ConfirmModal
        open={rejectingReschedule !== null}
        title={t('meetings.workspace.rejectRescheduleTitle')}
        message={t('meetings.workspace.rejectRescheduleDescription')}
        confirmText={t('meetings.reject')}
        cancelText={t('common.cancel')}
        danger
        loading={rejectReschedule.isPending}
        onConfirm={() => void rejectPendingReschedule()}
        onCancel={() => {
          setRejectingReschedule(null)
          setRescheduleRejectReason('')
        }}
      >
        <TextareaField
          label={t('meetings.rejectionReason')}
          value={rescheduleRejectReason}
          maxLength={1000}
          onChange={(event) => setRescheduleRejectReason(event.target.value)}
        />
      </ConfirmModal>
    </div>
  )
}
