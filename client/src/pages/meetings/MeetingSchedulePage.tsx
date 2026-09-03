import { CalendarPlus2, DoorOpen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  SearchableMultiSelect,
  type SearchableSelectOption,
} from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  TaskCalendar,
  type MeetingCalendarSlotSelection,
} from '@/features/calendar/components/TaskCalendar'
import type {
  CalendarViewMode,
  CalendarVisibleRange,
} from '@/features/calendar/types/calendar.types'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import {
  MeetingEditorDialog,
  type MeetingEditorInitialSchedule,
} from '@/features/meetings/components/MeetingEditorDialog'
import { MeetingRoomColorLegend } from '@/features/meetings/components/MeetingRoomColorLegend'
import { useActiveMeetingRooms } from '@/features/meetings/hooks/use-meeting-rooms'
import { getMeetingRoomAccent } from '@/features/meetings/meeting-room-colors'
import { useMeetingSchedule } from '@/features/meetings/hooks/use-meetings'
import { cn } from '@/lib/cn'
import { formatRiyadhDateInput, riyadhLocalDateTimeToUtcIso } from '@/lib/date-time'

interface CreateSeed {
  id: number
  schedule: MeetingEditorInitialSchedule
}

export function MeetingSchedulePage() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const currentUser = useCurrentUser()
  const rooms = useActiveMeetingRooms()
  const [range, setRange] = useState<CalendarVisibleRange | null>(null)
  const [viewMode, setViewMode] = useState<CalendarViewMode>('WEEK')
  const [roomId, setRoomId] = useState<number | null>(null)
  const [showAdjacentDates, setShowAdjacentDates] = useState(true)
  const [createSeed, setCreateSeed] = useState<CreateSeed | null>(null)

  const canCoordinate = currentUser.data?.access.meetingCoordinateEnabled === true

  const input = useMemo(() => {
    if (!range) return null
    return {
      fromAtUtc: riyadhLocalDateTimeToUtcIso(range.start, '00:00'),
      toAtUtc: riyadhLocalDateTimeToUtcIso(range.end, '00:00'),
      ...(roomId === null ? {} : { roomId }),
    }
  }, [range, roomId])

  const schedule = useMeetingSchedule(input)
  const roomOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (rooms.data ?? []).map((room) => ({
        value: room.id,
        label: i18n.language.startsWith('ar') ? room.nameAr : room.nameEn,
        description: [
          room.locationText,
          t('meetings.capacityValue', { count: room.capacity }),
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    [i18n.language, rooms.data, t],
  )

  function selectSlot(slot: MeetingCalendarSlotSelection) {
    setCreateSeed({
      id: Date.now(),
      schedule: {
        ...slot,
        roomId,
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('meetings.eyebrow')}
        title={t('meetings.schedulePage.title')}
        description={t('meetings.schedulePage.description')}
        actions={
          <Button
            onClick={() =>
              setCreateSeed({
                id: Date.now(),
                schedule: {
                  date: formatRiyadhDateInput(new Date()),
                  startTime: '09:00',
                  endTime: '10:00',
                  roomId,
                },
              })
            }
          >
            <CalendarPlus2 aria-hidden="true" className="size-4" />
            {t('meetings.createMeeting')}
          </Button>
        }
      />

      <Card className="overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                <DoorOpen aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">{t('meetings.schedulePage.roomFilter')}</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t('meetings.schedulePage.roomFilterHint')}
                </p>
              </div>
            </div>

            <SearchableMultiSelect
              value={roomId}
              options={roomOptions}
              className="w-full lg:max-w-sm"
              placeholder={t('meetings.schedulePage.allRooms')}
              searchPlaceholder={t('meetings.fields.roomSearch')}
              noResultsText={t('meetings.noActiveRooms')}
              loading={rooms.isPending}
              ariaLabel={t('meetings.schedulePage.roomFilter')}
              onChange={(value) => setRoomId(value === null ? null : Number(value))}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t('meetings.schedulePage.roomFilter')}>
            <button
              type="button"
              aria-pressed={roomId === null}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                roomId === null
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
              )}
              onClick={() => setRoomId(null)}
            >
              {t('meetings.schedulePage.allRooms')}
            </button>
            {(rooms.data ?? []).map((room) => {
              const selected = roomId === room.id
              const label = i18n.language.startsWith('ar') ? room.nameAr : room.nameEn
              return (
                <button
                  key={room.id}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    selected
                      ? 'border-primary bg-primary/12 text-primary shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
                  )}
                  onClick={() => setRoomId(room.id)}
                >
                  <span
                    aria-hidden="true"
                    className="me-1.5 inline-block size-2 rounded-full align-middle ring-1 ring-black/10 dark:ring-white/15"
                    style={{ backgroundColor: getMeetingRoomAccent(room.colorKey) }}
                  />
                  {label}
                  <span className="ms-1 opacity-70">· {room.capacity}</span>
                </button>
              )
            })}
          </div>

          <p className="text-muted-foreground text-xs">
            {roomId === null
              ? t('meetings.schedulePage.clickTimeHintAllRooms')
              : t('meetings.schedulePage.clickTimeHintRoom')}
          </p>
        </div>
      </Card>

      {rooms.isSuccess ? <MeetingRoomColorLegend rooms={rooms.data ?? []} /> : null}

      {rooms.isError || schedule.isError ? (
        <ErrorState
          className="min-h-40"
          title={t('meetings.schedulePage.loadErrorTitle')}
          description={t('meetings.schedulePage.loadErrorDescription')}
          onRetry={() => {
            if (rooms.isError) void rooms.refetch()
            if (schedule.isError) void schedule.refetch()
          }}
        />
      ) : null}

      <TaskCalendar
        tasks={[]}
        meetings={schedule.data ?? []}
        meetingsEnabled
        meetingScheduleMode
        isFetching={schedule.isFetching}
        showEmpty={schedule.isSuccess && (schedule.data?.length ?? 0) === 0}
        viewMode={viewMode}
        selectedDate={null}
        searchTarget={null}
        showAdjacentDates={showAdjacentDates}
        displayPreferencePending={false}
        onViewModeChange={setViewMode}
        onRangeChange={setRange}
        onSelectDate={() => undefined}
        onOpenTask={() => undefined}
        onOpenMeeting={(meetingId) => navigate(`/meetings/${meetingId}`)}
        onSelectMeetingSlot={selectSlot}
        onShowAdjacentDatesChange={setShowAdjacentDates}
      />

      {createSeed ? (
        <MeetingEditorDialog
          key={createSeed.id}
          open
          mode={canCoordinate ? 'DIRECT' : 'REQUEST'}
          initialSchedule={createSeed.schedule}
          onOpenChange={(open) => !open && setCreateSeed(null)}
        />
      ) : null}
    </div>
  )
}

