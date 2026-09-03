import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, DoorOpen, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { toApiClientError } from '@/lib/api-error'
import {
  formatRiyadhDateInput,
  formatRiyadhTimeInput,
  formatTime,
  riyadhLocalDateTimeToUtcIso,
} from '@/lib/date-time'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import {
  useEditMeetingRescheduleRequest,
  useRequestMeetingReschedule,
  useUpdateOrganizerRequestedSchedule,
} from '../hooks/use-meetings'
import type { MeetingDetail, MeetingRevisionDetail, MeetingRoom } from '../types/meeting.types'
import {
  MeetingSchedulePicker,
  type MeetingScheduleSelectionState,
} from './MeetingSchedulePicker'

type OrganizerScheduleMode = 'CHANGE_INITIAL' | 'REQUEST_RESCHEDULE' | 'EDIT_RESCHEDULE'

function roomName(room: MeetingRoom, arabic: boolean): string {
  return arabic ? room.nameAr : room.nameEn
}

function scheduleDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function ScheduleCard({
  label,
  room,
  startAtUtc,
  endAtUtc,
  locale,
  arabic,
}: {
  label: string
  room: MeetingRoom
  startAtUtc: string
  endAtUtc: string
  locale: string
  arabic: boolean
}) {
  const timeFormat = useTimeFormatPreference()
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs font-semibold">{label}</p>
        <CalendarClock aria-hidden="true" className="text-primary size-4" />
      </div>
      <p className="mt-2 text-sm font-semibold">{scheduleDate(startAtUtc, locale)}</p>
      <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Clock3 aria-hidden="true" className="size-3.5" />
          {formatTime(startAtUtc, locale, timeFormat)}
          <span aria-hidden="true">–</span>
          {formatTime(endAtUtc, locale, timeFormat)}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <DoorOpen aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{roomName(room, arabic)}</span>
        </span>
      </div>
    </div>
  )
}

function resolveMode(detail: MeetingDetail): OrganizerScheduleMode {
  if (detail.permissions.canEditPendingSchedule) return 'CHANGE_INITIAL'
  if (detail.permissions.canEditPendingReschedule && detail.pendingReschedule) return 'EDIT_RESCHEDULE'
  return 'REQUEST_RESCHEDULE'
}

function initialRevision(detail: MeetingDetail, mode: OrganizerScheduleMode): MeetingRevisionDetail | null {
  return mode === 'EDIT_RESCHEDULE' ? detail.pendingReschedule : null
}

export function MeetingRescheduleDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: MeetingDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  const locale = arabic ? 'ar-SA-u-ca-gregory' : 'en-SA'
  const rooms = useActiveMeetingRooms()
  const updateInitial = useUpdateOrganizerRequestedSchedule()
  const requestReschedule = useRequestMeetingReschedule()
  const editReschedule = useEditMeetingRescheduleRequest()

  const meeting = detail.meeting
  const mode = resolveMode(detail)
  const pendingRevision = initialRevision(detail, mode)
  const sourceSchedule = pendingRevision ?? meeting

  const [date, setDate] = useState(() => formatRiyadhDateInput(sourceSchedule.startAtUtc))
  const [startTime, setStartTime] = useState(() => formatRiyadhTimeInput(sourceSchedule.startAtUtc))
  const [endTime, setEndTime] = useState(() => formatRiyadhTimeInput(sourceSchedule.endAtUtc))
  const [roomId, setRoomId] = useState<number | null>(sourceSchedule.room.id)
  const [selectionState, setSelectionState] = useState<MeetingScheduleSelectionState | null>(null)

  useEffect(() => {
    if (!open) return
    const nextMode = resolveMode(detail)
    const revision = initialRevision(detail, nextMode)
    const source = revision ?? detail.meeting
    setDate(formatRiyadhDateInput(source.startAtUtc))
    setStartTime(formatRiyadhTimeInput(source.startAtUtc))
    setEndTime(formatRiyadhTimeInput(source.endAtUtc))
    setRoomId(source.room.id)
    setSelectionState(null)
  }, [detail, open])

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

  const hasValidWindow =
    roomId !== null &&
    selectedStartAtUtc !== null &&
    selectedEndAtUtc !== null &&
    new Date(selectedEndAtUtc).getTime() > new Date(selectedStartAtUtc).getTime()

  const isPending = updateInitial.isPending || requestReschedule.isPending || editReschedule.isPending
  const canSubmit = hasValidWindow && !isPending

  const title =
    mode === 'CHANGE_INITIAL'
      ? t('meetings.workspace.changeRequestedSchedule')
      : mode === 'EDIT_RESCHEDULE'
        ? t('meetings.workspace.editRescheduleRequest')
        : t('meetings.workspace.rescheduleTitle')

  const description =
    mode === 'CHANGE_INITIAL'
      ? t('meetings.workspace.changeRequestedScheduleDescription')
      : mode === 'EDIT_RESCHEDULE'
        ? t('meetings.workspace.editRescheduleDescription')
        : t('meetings.workspace.rescheduleDescription')

  const submitLabel =
    mode === 'CHANGE_INITIAL'
      ? t('meetings.workspace.saveRequestedSchedule')
      : mode === 'EDIT_RESCHEDULE'
        ? t('meetings.workspace.saveRescheduleRequest')
        : t('meetings.workspace.requestReschedule')

  async function submit() {
    if (!canSubmit || roomId === null || !selectedStartAtUtc || !selectedEndAtUtc) return

    try {
      if (mode === 'CHANGE_INITIAL') {
        await updateInitial.mutateAsync({
          meetingId: meeting.id,
          revisionId: meeting.revisionId,
          revisionRowVersion: meeting.revisionRowVersion,
          roomId,
          startAtUtc: selectedStartAtUtc,
          endAtUtc: selectedEndAtUtc,
          schedulingNotes: meeting.schedulingNotes ?? null,
        })
        toast.success(t('meetings.workspace.requestedScheduleUpdated'))
      } else if (mode === 'EDIT_RESCHEDULE' && pendingRevision) {
        await editReschedule.mutateAsync({
          meetingId: meeting.id,
          revisionId: pendingRevision.id,
          revisionRowVersion: pendingRevision.rowVersion,
          roomId,
          startAtUtc: selectedStartAtUtc,
          endAtUtc: selectedEndAtUtc,
        })
        toast.success(t('meetings.workspace.rescheduleRequestUpdated'))
      } else {
        await requestReschedule.mutateAsync({
          meetingId: meeting.id,
          meetingRowVersion: meeting.meetingRowVersion,
          roomId,
          startAtUtc: selectedStartAtUtc,
          endAtUtc: selectedEndAtUtc,
        })
        toast.success(t('meetings.workspace.rescheduleRequested'))
      }
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue:
            mode === 'CHANGE_INITIAL'
              ? t('meetings.workspace.requestedScheduleUpdateError')
              : mode === 'EDIT_RESCHEDULE'
                ? t('meetings.workspace.rescheduleUpdateError')
                : t('meetings.workspace.rescheduleError'),
        }),
      )
    }
  }

  const availabilityClass = selectionState?.hasKnownConflict
    ? 'border-warning/40 bg-warning/5 text-warning-foreground'
    : selectionState && !selectionState.hasCapacity
      ? 'border-warning/40 bg-warning/5 text-warning-foreground'
      : selectionState?.canSchedule
        ? 'border-success/30 bg-success/5 text-success'
        : 'border-border bg-muted/20 text-muted-foreground'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="max-h-[calc(100vh-1.5rem)] w-[min(76rem,calc(100vw-1.5rem))] overflow-y-auto p-0"
      >
        <header className="border-b bg-background px-5 py-5 pe-14 sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                  <CalendarClock aria-hidden="true" className="size-5" />
                </span>
                <Badge variant="secondary">{t('meetings.workspace.organizerScheduleChange')}</Badge>
              </div>
              <DialogTitle className="mt-3 text-xl font-bold sm:text-2xl">{title}</DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1.5 max-w-3xl text-sm leading-6">
                {description}
              </DialogDescription>
              <p className="mt-2 truncate text-sm font-semibold">{meeting.title}</p>
            </div>
          </div>
        </header>

        <div className="space-y-5 p-4 sm:p-6">
          {mode !== 'CHANGE_INITIAL' ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t('meetings.workspace.currentSchedule')}</h3>
              <ScheduleCard
                label={t('meetings.workspace.currentSchedule')}
                room={meeting.room}
                startAtUtc={meeting.startAtUtc}
                endAtUtc={meeting.endAtUtc}
                locale={locale}
                arabic={arabic}
              />
            </section>
          ) : null}

          <div className="overflow-hidden rounded-2xl border bg-muted/10 shadow-sm">
            <MeetingSchedulePicker
              date={date}
              roomId={roomId}
              rooms={rooms.data ?? []}
              participantCount={meeting.participantCount}
              startTime={startTime}
              endTime={endTime}
              disabled={isPending || rooms.isPending}
              allowBusySelection
              excludeMeetingId={meeting.status === 'SCHEDULED' ? meeting.id : null}
              heading={t('meetings.workspace.chooseRequestedSchedule')}
              description={t('meetings.workspace.chooseRequestedScheduleDescription')}
              onSelectionStateChange={setSelectionState}
              onDateChange={setDate}
              onRoomChange={setRoomId}
              onTimeChange={(nextStartTime, nextEndTime) => {
                setStartTime(nextStartTime)
                setEndTime(nextEndTime)
              }}
            />
          </div>

          {hasValidWindow ? (
            <div className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm', availabilityClass)}>
              {selectionState?.isChecking ? (
                <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin" />
              ) : selectionState?.canSchedule ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <p className="font-medium">
                  {selectionState?.isChecking
                    ? t('meetings.availability.checking')
                    : selectionState?.canSchedule
                      ? t('meetings.availability.available')
                      : t('meetings.availability.requestCanContinue')}
                </p>
                {!selectionState?.canSchedule && !selectionState?.isChecking ? (
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {t('meetings.workspace.proposalDoesNotReserve')}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="bg-background/95 sticky bottom-0 z-10 border-t px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!canSubmit} onClick={() => void submit()}>
              {isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

