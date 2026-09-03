import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  DoorOpen,
  Loader2,
  MessageSquareText,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaField } from '@/components/shared/Input'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import {
  formatRiyadhDateInput,
  formatRiyadhTimeInput,
  formatTime,
  riyadhLocalDateTimeToUtcIso,
} from '@/lib/date-time'

import type { MeetingRoom } from '../types/meeting.types'
import {
  MeetingSchedulePicker,
  type MeetingScheduleSelectionState,
} from './MeetingSchedulePicker'

interface ScheduleSnapshot {
  label: string
  room: MeetingRoom
  startAtUtc: string
  endAtUtc: string
  emphasis?: 'neutral' | 'requested'
}

interface CoordinatorScheduleEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  meetingTitle: string
  participantCount: number
  rooms: MeetingRoom[]
  roomsPending?: boolean
  roomsError?: boolean
  onRetryRooms?: () => void
  initialRoomId: number
  initialStartAtUtc: string
  initialEndAtUtc: string
  initialNotes?: string | null
  referenceSchedules: ScheduleSnapshot[]
  comparisonBaseline: ScheduleSnapshot
  excludeMeetingId?: number | null
  savePending?: boolean
  saveLabel: string
  onSave: (input: {
    roomId: number
    startAtUtc: string
    endAtUtc: string
    schedulingNotes: string | null
  }) => Promise<void>
}

function roomName(room: MeetingRoom, arabic: boolean): string {
  return arabic ? room.nameAr : room.nameEn
}

function formatScheduleDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function SnapshotCard({
  snapshot,
  locale,
  arabic,
  timeFormat,
}: {
  snapshot: ScheduleSnapshot
  locale: string
  arabic: boolean
  timeFormat: '12H' | '24H'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        snapshot.emphasis === 'requested'
          ? 'border-primary/25 bg-primary/[0.045]'
          : 'bg-muted/20',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs font-semibold">{snapshot.label}</p>
        <CalendarClock aria-hidden="true" className="text-primary size-4" />
      </div>
      <p className="mt-2 text-sm font-semibold">
        {formatScheduleDate(snapshot.startAtUtc, locale)}
      </p>
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Clock3 aria-hidden="true" className="size-3.5" />
          {formatTime(snapshot.startAtUtc, locale, timeFormat)}
          <span aria-hidden="true">–</span>
          {formatTime(snapshot.endAtUtc, locale, timeFormat)}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <DoorOpen aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{roomName(snapshot.room, arabic)}</span>
        </span>
      </div>
    </div>
  )
}

export function CoordinatorScheduleEditorDialog({
  open,
  onOpenChange,
  title,
  description,
  meetingTitle,
  participantCount,
  rooms,
  roomsPending = false,
  roomsError = false,
  onRetryRooms,
  initialRoomId,
  initialStartAtUtc,
  initialEndAtUtc,
  initialNotes = null,
  referenceSchedules,
  comparisonBaseline,
  excludeMeetingId = null,
  savePending = false,
  saveLabel,
  onSave,
}: CoordinatorScheduleEditorDialogProps) {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const timeFormat = currentUser.data?.preferences.timeFormat ?? '12H'
  const arabic = i18n.language.startsWith('ar')
  const locale = arabic ? 'ar-SA-u-ca-gregory' : 'en-SA'

  const [roomId, setRoomId] = useState<number | null>(initialRoomId)
  const [date, setDate] = useState(() => formatRiyadhDateInput(initialStartAtUtc))
  const [startTime, setStartTime] = useState(() => formatRiyadhTimeInput(initialStartAtUtc))
  const [endTime, setEndTime] = useState(() => formatRiyadhTimeInput(initialEndAtUtc))
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [notesOpen, setNotesOpen] = useState(Boolean(initialNotes?.trim()))
  const [selectionState, setSelectionState] = useState<MeetingScheduleSelectionState | null>(
    null,
  )

  useEffect(() => {
    if (!open) return
    setRoomId(initialRoomId)
    setDate(formatRiyadhDateInput(initialStartAtUtc))
    setStartTime(formatRiyadhTimeInput(initialStartAtUtc))
    setEndTime(formatRiyadhTimeInput(initialEndAtUtc))
    setNotes(initialNotes ?? '')
    setNotesOpen(Boolean(initialNotes?.trim()))
    setSelectionState(null)
  }, [
    initialEndAtUtc,
    initialNotes,
    initialRoomId,
    initialStartAtUtc,
    open,
  ])

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === roomId) ?? null,
    [roomId, rooms],
  )

  const selectedStartAtUtc = useMemo(() => {
    try {
      return riyadhLocalDateTimeToUtcIso(date, startTime)
    } catch {
      return null
    }
  }, [date, startTime])

  const selectedEndAtUtc = useMemo(() => {
    try {
      return riyadhLocalDateTimeToUtcIso(date, endTime)
    } catch {
      return null
    }
  }, [date, endTime])

  const newSnapshot: ScheduleSnapshot | null =
    selectedRoom && selectedStartAtUtc && selectedEndAtUtc
      ? {
          label: t('meetings.coordinatorSchedule.newSchedule'),
          room: selectedRoom,
          startAtUtc: selectedStartAtUtc,
          endAtUtc: selectedEndAtUtc,
        }
      : null

  const hasScheduleChanged =
    newSnapshot !== null &&
    (
      newSnapshot.room.id !== comparisonBaseline.room.id ||
      new Date(newSnapshot.startAtUtc).getTime() !==
        new Date(comparisonBaseline.startAtUtc).getTime() ||
      new Date(newSnapshot.endAtUtc).getTime() !==
        new Date(comparisonBaseline.endAtUtc).getTime()
    )

  const canSave =
    !savePending &&
    roomId !== null &&
    selectionState?.canSchedule === true &&
    selectedStartAtUtc !== null &&
    selectedEndAtUtc !== null

  async function submit() {
    if (!canSave || roomId === null || !selectedStartAtUtc || !selectedEndAtUtc) return
    await onSave({
      roomId,
      startAtUtc: selectedStartAtUtc,
      endAtUtc: selectedEndAtUtc,
      schedulingNotes: notes.trim() || null,
    })
  }

  const statusClass = !selectionState || selectionState.isChecking
    ? 'border-border bg-muted/20 text-foreground'
    : selectionState.hasKnownConflict
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : !selectionState.hasCapacity
        ? 'border-warning/40 bg-warning/5 text-warning-foreground'
        : selectionState.hasScheduleLoadError
          ? 'border-warning/40 bg-warning/5 text-warning-foreground'
          : 'border-success/30 bg-success/5 text-success'

  const statusText = selectionState?.isChecking
    ? t('meetings.coordinatorSchedule.checking')
    : selectionState?.hasKnownConflict
      ? t('meetings.coordinatorSchedule.conflict')
      : selectionState && !selectionState.hasCapacity
        ? t('meetings.coordinatorSchedule.capacity')
        : selectionState?.hasScheduleLoadError
          ? t('meetings.coordinatorSchedule.loadError')
          : selectionState?.canSchedule
            ? t('meetings.coordinatorSchedule.available')
            : t('meetings.coordinatorSchedule.chooseSchedule')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="max-h-[calc(100vh-1.5rem)] w-[min(76rem,calc(100vw-1.5rem))] overflow-y-auto p-0"
      >
        <div className="relative">
          <header className="border-b bg-background px-5 py-5 pe-14 sm:px-7 sm:py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                    <CalendarClock aria-hidden="true" className="size-5" />
                  </span>
                  <Badge variant="secondary">
                    {t('meetings.coordinatorSchedule.badge')}
                  </Badge>
                </div>
                <DialogTitle className="mt-3 text-xl font-bold sm:text-2xl">{title}</DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1.5 max-w-3xl text-sm leading-6">
                  {description}
                </DialogDescription>
                <p className="mt-2 truncate text-sm font-semibold">{meetingTitle}</p>
              </div>

              <div className="bg-muted/30 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs">
                <UsersRound aria-hidden="true" className="text-primary size-4" />
                <span className="font-semibold">
                  {t('meetings.participantCount', { count: participantCount })}
                </span>
              </div>
            </div>
          </header>

          <div className="space-y-5 p-4 sm:p-6">
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {t('meetings.coordinatorSchedule.contextTitle')}
                </h3>
                <span className="text-muted-foreground text-xs">
                  {t('meetings.coordinatorSchedule.ownershipHint')}
                </span>
              </div>
              <div className={cn('grid gap-3', referenceSchedules.length > 1 && 'lg:grid-cols-2')}>
                {referenceSchedules.map((snapshot, index) => (
                  <SnapshotCard
                    key={`${snapshot.label}-${index}`}
                    snapshot={snapshot}
                    locale={locale}
                    arabic={arabic}
                    timeFormat={timeFormat}
                  />
                ))}
              </div>
            </section>

            {roomsPending ? (
              <div className="text-muted-foreground flex min-h-48 items-center justify-center gap-2 rounded-2xl border bg-muted/10 text-sm">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                {t('meetings.coordinatorSchedule.loadingRooms')}
              </div>
            ) : roomsError ? (
              <div className="border-warning/40 bg-warning/5 rounded-2xl border p-5 text-sm">
                <p className="font-semibold">{t('meetings.coordinatorSchedule.roomsLoadError')}</p>
                {onRetryRooms ? (
                  <Button className="mt-3" variant="outline" size="sm" onClick={onRetryRooms}>
                    {t('common.retry')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border bg-muted/10 shadow-sm">
                <MeetingSchedulePicker
                  date={date}
                  roomId={roomId}
                  rooms={rooms}
                  participantCount={participantCount}
                  startTime={startTime}
                  endTime={endTime}
                  disabled={savePending}
                  allowBusySelection={false}
                  excludeMeetingId={excludeMeetingId}
                  heading={t('meetings.coordinatorSchedule.pickerTitle')}
                  description={t('meetings.coordinatorSchedule.pickerDescription')}
                  onSelectionStateChange={setSelectionState}
                  onDateChange={setDate}
                  onRoomChange={setRoomId}
                  onTimeChange={(nextStartTime, nextEndTime) => {
                    setStartTime(nextStartTime)
                    setEndTime(nextEndTime)
                  }}
                />
              </div>
            )}

            {!roomsPending && !roomsError ? (
              <div className={cn('flex items-start gap-2 rounded-xl border p-3.5 text-sm', statusClass)}>
                {selectionState?.isChecking ? (
                  <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin" />
                ) : selectionState?.canSchedule ? (
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                )}
                <div>
                  <p className="font-semibold">{statusText}</p>
                  {selectionState?.hasKnownConflict ? (
                    <p className="mt-1 text-xs opacity-85">
                      {t('meetings.coordinatorSchedule.conflictHint')}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {newSnapshot && hasScheduleChanged ? (
              <section className="rounded-2xl border bg-background p-4 sm:p-5">
                <h3 className="text-sm font-semibold">
                  {t('meetings.coordinatorSchedule.changeSummary')}
                </h3>
                <div className="mt-3 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
                  <SnapshotCard
                    snapshot={{
                      ...comparisonBaseline,
                      label: t('meetings.coordinatorSchedule.before'),
                    }}
                    locale={locale}
                    arabic={arabic}
                    timeFormat={timeFormat}
                  />
                  <div className="text-muted-foreground hidden items-center justify-center md:flex">
                    <ArrowRight aria-hidden="true" className="size-5 rtl:rotate-180" />
                  </div>
                  <SnapshotCard
                    snapshot={{
                      ...newSnapshot,
                      label: t('meetings.coordinatorSchedule.after'),
                      emphasis: 'requested',
                    }}
                    locale={locale}
                    arabic={arabic}
                    timeFormat={timeFormat}
                  />
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border bg-muted/10">
              <button
                type="button"
                className="focus-visible:ring-ring flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-start outline-none focus-visible:ring-2"
                aria-expanded={notesOpen}
                onClick={() => setNotesOpen((current) => !current)}
              >
                <span className="flex items-center gap-2">
                  <MessageSquareText aria-hidden="true" className="text-primary size-4" />
                  <span>
                    <span className="block text-sm font-semibold">
                      {t('meetings.coordinatorSchedule.notesTitle')}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {t('meetings.coordinatorSchedule.notesDescription')}
                    </span>
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('size-4 transition-transform', notesOpen && 'rotate-180')}
                />
              </button>
              {notesOpen ? (
                <div className="border-t px-4 py-4">
                  <TextareaField
                    label={t('meetings.fields.schedulingNotes')}
                    value={notes}
                    maxLength={1000}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
              ) : null}
            </section>
          </div>

          <footer className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-5 py-4 backdrop-blur sm:px-7">
            <p className="text-muted-foreground text-xs">
              {selectionState?.canSchedule
                ? t('meetings.coordinatorSchedule.readyToSave')
                : t('meetings.coordinatorSchedule.saveBlockedHint')}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={savePending}
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button disabled={!canSave} onClick={() => void submit()}>
                {savePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                {saveLabel}
              </Button>
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}

