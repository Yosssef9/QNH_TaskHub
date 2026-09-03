import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Clock3,
  DoorOpen,
  RotateCcw,
  SearchX,
  UserRound,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SearchInput } from '@/components/shared/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { cn } from '@/lib/cn'
import { formatRiyadhDateInput, formatTime, formatTimeRange } from '@/lib/date-time'

import { getMeetingRoomAccent } from '../meeting-room-colors'
import type { MeetingSummary } from '../types/meeting.types'

type MeetingTab = 'UPCOMING' | 'TODAY' | 'WEEK' | 'PAST'
type MeetingRoleFilter = 'ALL' | 'ORGANIZER' | 'PARTICIPANT'

interface MyMeetingsDashboardProps {
  meetings: MeetingSummary[]
  currentUserId: number
  onOpenMeeting: (meetingId: number) => void
}

function dateKeyToUtcNoon(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12))
}

function addDays(dateKey: string, days: number): string {
  const date = dateKeyToUtcNoon(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function weekBounds(todayKey: string): { start: string; end: string } {
  const today = dateKeyToUtcNoon(todayKey)
  const start = addDays(todayKey, -today.getUTCDay())
  return { start, end: addDays(start, 6) }
}

function includesNormalized(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

function meetingRoomSurface(meeting: MeetingSummary): CSSProperties {
  const accent = getMeetingRoomAccent(meeting.room.colorKey)
  return {
    borderInlineStart: `4px solid ${accent}`,
    background: `color-mix(in oklab, ${accent} 5%, var(--card))`,
  }
}

function meetingRoomAccentStyle(meeting: MeetingSummary): CSSProperties {
  return { color: getMeetingRoomAccent(meeting.room.colorKey) }
}

function meetingListRoomSurface(meeting: MeetingSummary, isRtl: boolean): CSSProperties {
  const accent = getMeetingRoomAccent(meeting.room.colorKey)
  const direction = isRtl ? 'to right' : 'to left'

  return {
    borderInlineEnd: `4px solid ${accent}`,
    background: `linear-gradient(${direction},
      color-mix(in oklab, ${accent} 12%, var(--card)) 0%,
      color-mix(in oklab, ${accent} 7%, var(--card)) 16%,
      color-mix(in oklab, ${accent} 3%, var(--card)) 34%,
      var(--card) 68%)`,
  }
}

function meetingListHoverSurface(meeting: MeetingSummary, isRtl: boolean): CSSProperties {
  const accent = getMeetingRoomAccent(meeting.room.colorKey)
  const direction = isRtl ? 'to right' : 'to left'

  return {
    background: `linear-gradient(${direction},
      color-mix(in oklab, ${accent} 18%, var(--card)) 0%,
      color-mix(in oklab, ${accent} 10%, var(--card)) 17%,
      color-mix(in oklab, ${accent} 4%, var(--card)) 36%,
      transparent 66%)`,
  }
}

export function MyMeetingsDashboard({
  meetings,
  currentUserId,
  onOpenMeeting,
}: MyMeetingsDashboardProps) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-SA'
  const [now, setNow] = useState(() => new Date())
  const [tab, setTab] = useState<MeetingTab>('UPCOMING')
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('ALL')
  const [roleFilter, setRoleFilter] = useState<MeetingRoleFilter>('ALL')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const todayKey = formatRiyadhDateInput(now)
  const tomorrowKey = addDays(todayKey, 1)
  const currentWeek = weekBounds(todayKey)

  const groupDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        numberingSystem: 'latn',
        timeZone: 'UTC',
      }),
    [locale],
  )

  const rooms = useMemo(() => {
    const roomMap = new Map<number, MeetingSummary['room']>()
    for (const meeting of meetings) roomMap.set(meeting.room.id, meeting.room)
    return [...roomMap.values()].sort((left, right) => {
      const leftName = i18n.language.startsWith('ar') ? left.nameAr : left.nameEn
      const rightName = i18n.language.startsWith('ar') ? right.nameAr : right.nameEn
      return leftName.localeCompare(rightName, i18n.language)
    })
  }, [i18n.language, meetings])

  const selectedRoom =
    roomFilter === 'ALL' ? null : (rooms.find((room) => room.id === Number(roomFilter)) ?? null)

  const RoleFilterIcon =
    roleFilter === 'ORGANIZER'
      ? UserRoundCheck
      : roleFilter === 'PARTICIPANT'
        ? UserRound
        : UsersRound

  const counts = useMemo(() => {
    let today = 0
    let thisWeek = 0
    let organized = 0
    let reschedule = 0

    for (const meeting of meetings) {
      const dateKey = formatRiyadhDateInput(meeting.startAtUtc)
      if (dateKey === todayKey) today += 1
      if (dateKey >= currentWeek.start && dateKey <= currentWeek.end) thisWeek += 1
      if (meeting.organizer.userId === currentUserId) {
        organized += 1
        if (meeting.hasPendingReschedule) reschedule += 1
      }
    }

    return { today, thisWeek, organized, reschedule }
  }, [currentUserId, currentWeek.end, currentWeek.start, meetings, todayKey])

  const nextMeeting = useMemo(
    () =>
      meetings
        .filter((meeting) => new Date(meeting.endAtUtc).getTime() >= now.getTime())
        .sort(
          (left, right) =>
            new Date(left.startAtUtc).getTime() - new Date(right.startAtUtc).getTime(),
        )[0] ?? null,
    [meetings, now],
  )

  const filteredMeetings = useMemo(() => {
    const needle = search.trim()
    const nowTime = now.getTime()

    const filtered = meetings.filter((meeting) => {
      const startDateKey = formatRiyadhDateInput(meeting.startAtUtc)
      const endTime = new Date(meeting.endAtUtc).getTime()

      if (tab === 'UPCOMING' && endTime < nowTime) return false
      if (tab === 'TODAY' && startDateKey !== todayKey) return false
      if (tab === 'WEEK' && (startDateKey < currentWeek.start || startDateKey > currentWeek.end)) {
        return false
      }
      if (tab === 'PAST' && endTime >= nowTime) return false

      if (roomFilter !== 'ALL' && meeting.room.id !== Number(roomFilter)) return false
      if (roleFilter === 'ORGANIZER' && meeting.organizer.userId !== currentUserId) return false
      if (roleFilter === 'PARTICIPANT' && meeting.organizer.userId === currentUserId) return false

      if (!needle) return true
      const searchable = [
        meeting.title,
        meeting.description ?? '',
        meeting.room.nameAr,
        meeting.room.nameEn,
        meeting.room.locationText ?? '',
        meeting.organizer.userName,
        ...meeting.attendees.map((attendee) => attendee.userName),
      ].join(' ')
      return includesNormalized(searchable, needle)
    })

    return filtered.sort((left, right) => {
      const difference = new Date(left.startAtUtc).getTime() - new Date(right.startAtUtc).getTime()
      return tab === 'PAST' ? -difference : difference
    })
  }, [
    currentUserId,
    currentWeek.end,
    currentWeek.start,
    meetings,
    now,
    roleFilter,
    roomFilter,
    search,
    tab,
    todayKey,
  ])

  const groupedMeetings = useMemo(() => {
    const groups = new Map<string, MeetingSummary[]>()
    for (const meeting of filteredMeetings) {
      const dateKey = formatRiyadhDateInput(meeting.startAtUtc)
      const group = groups.get(dateKey) ?? []
      group.push(meeting)
      groups.set(dateKey, group)
    }
    return [...groups.entries()]
  }, [filteredMeetings])

  function roomName(meeting: MeetingSummary): string {
    return i18n.language.startsWith('ar') ? meeting.room.nameAr : meeting.room.nameEn
  }

  function groupLabel(dateKey: string): string {
    const formatted = groupDateFormatter.format(dateKeyToUtcNoon(dateKey))
    if (dateKey === todayKey) return `${t('meetings.myDashboard.todayGroup')} — ${formatted}`
    if (dateKey === tomorrowKey) {
      return `${t('meetings.myDashboard.tomorrowGroup')} — ${formatted}`
    }
    return formatted
  }

  function nextMeetingTimingLabel(meeting: MeetingSummary): string {
    const differenceMs = new Date(meeting.startAtUtc).getTime() - now.getTime()
    if (differenceMs <= 0) return t('meetings.myDashboard.inProgress')

    const minutes = Math.max(1, Math.ceil(differenceMs / 60_000))
    if (minutes < 60) {
      return t('meetings.myDashboard.startsIn', {
        value: t('meetings.myDashboard.minutesValue', { count: minutes }),
      })
    }

    const hours = Math.ceil(minutes / 60)
    if (hours < 24) {
      return t('meetings.myDashboard.startsIn', {
        value: t('meetings.myDashboard.hoursValue', { count: hours }),
      })
    }

    return t('meetings.myDashboard.startsIn', {
      value: t('meetings.myDashboard.daysValue', { count: Math.ceil(hours / 24) }),
    })
  }

  const kpis = [
    {
      label: t('meetings.myDashboard.todayKpi'),
      value: counts.today,
      icon: CalendarDays,
      iconClass: 'bg-primary/10 text-primary',
    },
    {
      label: t('meetings.myDashboard.weekKpi'),
      value: counts.thisWeek,
      icon: CalendarRange,
      iconClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
    },
    {
      label: t('meetings.myDashboard.organizedKpi'),
      value: counts.organized,
      icon: UserRoundCheck,
      iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    },
    {
      label: t('meetings.myDashboard.rescheduleKpi'),
      value: counts.reschedule,
      icon: RotateCcw,
      iconClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-300',
      unit: t('meetings.myDashboard.requestsUnit'),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label} className="flex items-center justify-between gap-4 p-4 shadow-sm">
              <div>
                <p className="text-sm font-semibold">{kpi.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <strong className="text-2xl font-bold tabular-nums">{kpi.value}</strong>
                  <span className="text-muted-foreground text-xs">
                    {kpi.unit ?? t('meetings.myDashboard.meetingsUnit')}
                  </span>
                </div>
              </div>
              <span
                className={cn('grid size-10 shrink-0 place-items-center rounded-xl', kpi.iconClass)}
              >
                <Icon aria-hidden="true" className="size-5" />
              </span>
            </Card>
          )
        })}
      </div>

      {nextMeeting ? (
        <Card
          className="border-border/70 overflow-hidden p-0 shadow-sm"
          style={meetingRoomSurface(nextMeeting)}
        >
          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(8rem,0.65fr))_minmax(7rem,0.5fr)] lg:items-center">
            <div className="min-w-0">
              <div className="text-primary mb-1.5 flex items-center gap-2 text-xs font-bold">
                <CalendarDays aria-hidden="true" className="size-4" />
                {t('meetings.myDashboard.nextMeeting')}
              </div>
              <h2 className="truncate text-xl font-bold sm:text-2xl">{nextMeeting.title}</h2>
              <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <Clock3 aria-hidden="true" className="size-4" />
                <span>
                  {formatTimeRange(
                    nextMeeting.startAtUtc,
                    nextMeeting.endAtUtc,
                    locale,
                    timeFormat,
                  )}
                </span>
              </div>
              <Button className="mt-4" size="sm" onClick={() => onOpenMeeting(nextMeeting.id)}>
                {t('meetings.myDashboard.openMeeting')}
                <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
              </Button>
            </div>

            <DashboardFact
              icon={DoorOpen}
              label={t('meetings.myDashboard.roomLabel')}
              value={roomName(nextMeeting)}
              iconStyle={meetingRoomAccentStyle(nextMeeting)}
            />
            <DashboardFact
              icon={UserRound}
              label={t('meetings.myDashboard.organizerLabel')}
              value={nextMeeting.organizer.userName}
            />
            <DashboardFact
              icon={UsersRound}
              label={t('meetings.myDashboard.participantsLabel')}
              value={t('meetings.participantCount', { count: nextMeeting.participantCount })}
            />

            <div className="border-primary/15 bg-primary/[0.04] rounded-xl border px-4 py-3 text-center">
              <p className="text-primary text-sm font-bold">
                {nextMeetingTimingLabel(nextMeeting)}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            debounceMs={150}
            className="xl:max-w-sm"
            placeholder={t('meetings.myDashboard.searchPlaceholder')}
            ariaLabel={t('meetings.myDashboard.searchLabel')}
          />

          <div className="bg-muted/45 flex w-full overflow-x-auto rounded-xl p-1 xl:w-auto">
            {(['UPCOMING', 'TODAY', 'WEEK', 'PAST'] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={tab === item}
                className={cn(
                  'focus-visible:ring-ring min-h-9 shrink-0 rounded-lg px-4 text-xs font-semibold outline-none focus-visible:ring-2 sm:text-sm',
                  tab === item
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
                onClick={() => setTab(item)}
              >
                {t(`meetings.myDashboard.tabs.${item}`)}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:w-auto">
            <Select value={roomFilter} onValueChange={setRoomFilter}>
              <SelectTrigger
                className="hover:bg-muted/35 h-11 rounded-xl px-3 shadow-sm transition-colors sm:min-w-52"
                aria-label={t('meetings.myDashboard.roomFilter')}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  {selectedRoom ? (
                    <span
                      aria-hidden="true"
                      className="ring-background size-2.5 shrink-0 rounded-full shadow-sm ring-2"
                      style={{ backgroundColor: getMeetingRoomAccent(selectedRoom.colorKey) }}
                    />
                  ) : (
                    <DoorOpen
                      aria-hidden="true"
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  )}
                  <span className="truncate font-medium">
                    {selectedRoom
                      ? i18n.language.startsWith('ar')
                        ? selectedRoom.nameAr
                        : selectedRoom.nameEn
                      : t('meetings.myDashboard.allRooms')}
                  </span>
                </span>
              </SelectTrigger>

              <SelectContent className="border-border/70 w-[min(23rem,calc(100vw-2rem))] rounded-xl shadow-xl">
                <SelectItem
                  value="ALL"
                  className="data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary my-0.5 cursor-pointer rounded-lg py-2.5 ps-2.5 pe-9"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="bg-muted/60 text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
                      <DoorOpen aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {t('meetings.myDashboard.allRooms')}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-xs font-normal">
                        {t('meetings.myDashboard.allRoomsDescription')}
                      </span>
                    </span>
                  </span>
                </SelectItem>

                {rooms.map((room) => {
                  const accent = getMeetingRoomAccent(room.colorKey)
                  const label = i18n.language.startsWith('ar') ? room.nameAr : room.nameEn
                  return (
                    <SelectItem
                      key={room.id}
                      value={String(room.id)}
                      className="data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary my-0.5 cursor-pointer rounded-lg py-2.5 ps-2.5 pe-9"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-9 shrink-0 place-items-center rounded-lg border"
                          style={{
                            borderColor: `color-mix(in oklab, ${accent} 30%, var(--border))`,
                            background: `color-mix(in oklab, ${accent} 9%, var(--card))`,
                          }}
                        >
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{label}</span>
                          <span className="text-muted-foreground mt-0.5 block truncate text-xs font-normal">
                            {room.locationText ?? t('meetings.noRoomLocation')}
                          </span>
                        </span>
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            <Select
              value={roleFilter}
              onValueChange={(value) => setRoleFilter(value as MeetingRoleFilter)}
            >
              <SelectTrigger
                className="hover:bg-muted/35 h-11 rounded-xl px-3 shadow-sm transition-colors sm:min-w-44"
                aria-label={t('meetings.myDashboard.roleFilter')}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <RoleFilterIcon
                    aria-hidden="true"
                    className="text-muted-foreground size-4 shrink-0"
                  />
                  <span className="truncate font-medium">
                    {t(`meetings.myDashboard.roles.${roleFilter}`)}
                  </span>
                </span>
              </SelectTrigger>

              <SelectContent className="border-border/70 w-[min(21rem,calc(100vw-2rem))] rounded-xl shadow-xl">
                {(
                  [
                    ['ALL', UsersRound],
                    ['ORGANIZER', UserRoundCheck],
                    ['PARTICIPANT', UserRound],
                  ] as const
                ).map(([role, Icon]) => (
                  <SelectItem
                    key={role}
                    value={role}
                    className="data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary my-0.5 cursor-pointer rounded-lg py-2.5 ps-2.5 pe-9"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="bg-muted/60 text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {t(`meetings.myDashboard.roles.${role}`)}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block truncate text-xs font-normal">
                          {t(`meetings.myDashboard.roleDescriptions.${role}`)}
                        </span>
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {groupedMeetings.length === 0 ? (
        <Card className="grid min-h-48 place-items-center p-6 text-center">
          <div>
            <SearchX aria-hidden="true" className="text-muted-foreground mx-auto size-8" />
            <h3 className="mt-3 font-semibold">{t('meetings.myDashboard.noFilteredTitle')}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('meetings.myDashboard.noFilteredDescription')}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {groupedMeetings.map(([dateKey, items]) => (
            <section key={dateKey} aria-labelledby={`meeting-group-${dateKey}`}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <CalendarDays aria-hidden="true" className="text-muted-foreground size-4" />
                <h2 id={`meeting-group-${dateKey}`} className="text-sm font-semibold">
                  {groupLabel(dateKey)}
                </h2>
              </div>
              <div className="grid gap-2">
                {items.map((meeting) => (
                  <MeetingListRow
                    key={meeting.id}
                    meeting={meeting}
                    locale={locale}
                    timeFormat={timeFormat}
                    roomName={roomName(meeting)}
                    showReschedule={
                      meeting.organizer.userId === currentUserId && meeting.hasPendingReschedule
                    }
                    past={new Date(meeting.endAtUtc).getTime() < now.getTime()}
                    onOpen={() => onOpenMeeting(meeting.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function DashboardFact({
  icon: Icon,
  label,
  value,
  iconStyle,
}: {
  icon: LucideIcon
  label: string
  value: string
  iconStyle?: CSSProperties
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="bg-muted/55 text-muted-foreground grid size-9 shrink-0 place-items-center rounded-xl">
        <Icon aria-hidden="true" className="size-4" style={iconStyle} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{value}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
      </div>
    </div>
  )
}

function MeetingListRow({
  meeting,
  locale,
  timeFormat,
  roomName,
  showReschedule,
  past,
  onOpen,
}: {
  meeting: MeetingSummary
  locale: string
  timeFormat: ReturnType<typeof useTimeFormatPreference>
  roomName: string
  showReschedule: boolean
  past: boolean
  onOpen: () => void
}) {
  const { i18n, t } = useTranslation()
  const isRtl = i18n.dir() === 'rtl'

  return (
    <button
      type="button"
      className={cn(
        'group border-border/70 relative w-full cursor-pointer overflow-hidden rounded-xl border p-0 text-start shadow-sm outline-none',
        'transition-[border-color,box-shadow,transform] duration-150 ease-out',
        'hover:border-border hover:-translate-y-px hover:shadow-md',
        'focus-visible:border-ring/50 focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:-translate-y-px focus-visible:ring-2 focus-visible:ring-offset-2',
        'motion-reduce:transform-none motion-reduce:transition-none',
        past && 'opacity-75',
      )}
      style={meetingListRoomSurface(meeting, isRtl)}
      aria-label={t('meetings.myDashboard.openMeetingLabel', { title: meeting.title })}
      onClick={onOpen}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        style={meetingListHoverSurface(meeting, isRtl)}
      />

      <div className="relative z-[1] grid min-h-20 gap-3 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(15rem,1.55fr)_minmax(12rem,1fr)_minmax(10rem,0.8fr)_minmax(7rem,0.55fr)_minmax(7rem,0.6fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <ChevronRight
              aria-hidden="true"
              className="text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground size-4 shrink-0 transition-[color,transform] duration-200 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
            />
            <h3 className="group-hover:text-foreground group-focus-visible:text-foreground truncate text-sm font-bold transition-colors duration-150 motion-reduce:transition-none sm:text-base">
              {meeting.title}
            </h3>
            {showReschedule ? (
              <Badge variant="warning" className="shrink-0 text-[10px]">
                {t('meetings.myDashboard.rescheduleRequested')}
              </Badge>
            ) : null}
          </div>
          {meeting.description ? (
            <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">{meeting.description}</p>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <DoorOpen
            aria-hidden="true"
            className="size-4 shrink-0"
            style={meetingRoomAccentStyle(meeting)}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{roomName}</p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {meeting.room.locationText ?? t('meetings.noRoomLocation')}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <UserRound aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{meeting.organizer.userName}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('meetings.myDashboard.organizerLabel')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <UsersRound aria-hidden="true" className="text-muted-foreground size-4" />
          <div>
            <p className="text-sm font-semibold tabular-nums">{meeting.participantCount}</p>
            <p className="text-muted-foreground text-xs">
              {t('meetings.myDashboard.participantsLabel')}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <div className="text-end tabular-nums">
            <p className="text-sm font-bold" dir="auto">
              {formatTime(meeting.startAtUtc, locale, timeFormat)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs" dir="auto">
              {formatTime(meeting.endAtUtc, locale, timeFormat)}
            </p>
          </div>
        </div>
      </div>
    </button>
  )
}
