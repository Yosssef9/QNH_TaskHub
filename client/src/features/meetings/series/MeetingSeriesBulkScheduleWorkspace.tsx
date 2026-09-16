import { AlertTriangle, CheckCircle2, Clock3, DoorOpen, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import type { TimeFormatPreference } from '@/features/auth/types/auth.types'
import { formatClockTime } from '@/lib/date-time'
import { cn } from '@/lib/cn'

import { MeetingSchedulePicker } from '../components/MeetingSchedulePicker'
import { MeetingTimeRangePicker } from '../components/MeetingTimeRangePicker'
import type { MeetingRoom } from '../types/meeting.types'
import { previewMeetingSeries } from './meeting-series.api'
import type {
  MeetingSeriesException,
  MeetingSeriesPreview,
  MeetingSeriesPreviewInput,
  MeetingSeriesPreviewOccurrence,
} from './meeting-series.types'

export interface MeetingSeriesBulkScheduleValues {
  roomId?: number
  startTime?: string
  endTime?: string
}

interface MeetingSeriesBulkScheduleWorkspaceProps {
  open: boolean
  rooms: readonly MeetingRoom[]
  selectedOccurrences: readonly MeetingSeriesPreviewOccurrence[]
  allOccurrences: readonly MeetingSeriesPreviewOccurrence[]
  previewInput: MeetingSeriesPreviewInput | null
  locale: string
  timeFormat: TimeFormatPreference
  onOpenChange: (open: boolean) => void
  onApply: (values: MeetingSeriesBulkScheduleValues) => void
}

function addedClientIdFromKey(key: string): string | null {
  return key.startsWith('A:') ? key.slice(2) : null
}

function stripScheduleOverrideFields(
  item: Extract<MeetingSeriesException, { action: 'OVERRIDE' }>,
): Extract<MeetingSeriesException, { action: 'OVERRIDE' }> {
  const {
    date: _date,
    startTime: _startTime,
    endTime: _endTime,
    roomId: _roomId,
    ...rest
  } = item
  return rest
}

function hasOverrideFields(
  item: Extract<MeetingSeriesException, { action: 'OVERRIDE' }>,
): boolean {
  return Object.keys(item).some((key) => key !== 'action' && key !== 'occurrenceKey')
}

function applyScheduleChangesToInput(
  input: MeetingSeriesPreviewInput,
  occurrences: readonly MeetingSeriesPreviewOccurrence[],
  values: MeetingSeriesBulkScheduleValues,
): MeetingSeriesPreviewInput {
  let exceptions = [...input.exceptions]

  for (const occurrence of occurrences) {
    const nextStartTime = values.startTime ?? occurrence.startTime
    const nextEndTime = values.endTime ?? occurrence.endTime
    const nextRoomId = values.roomId ?? occurrence.roomId
    const addedId = addedClientIdFromKey(occurrence.occurrenceKey)

    if (addedId) {
      exceptions = exceptions.map((item) =>
        item.action === 'ADD' &&
        item.clientOccurrenceId.toLowerCase() === addedId.toLowerCase()
          ? {
              ...item,
              startTime: nextStartTime,
              endTime: nextEndTime,
              roomId: nextRoomId,
            }
          : item,
      )
      continue
    }

    const existing = exceptions.find(
      (
        item,
      ): item is Extract<MeetingSeriesException, { action: 'OVERRIDE' }> =>
        item.action === 'OVERRIDE' &&
        item.occurrenceKey === occurrence.occurrenceKey,
    )

    const next: Extract<MeetingSeriesException, { action: 'OVERRIDE' }> = {
      ...(existing
        ? stripScheduleOverrideFields(existing)
        : { action: 'OVERRIDE', occurrenceKey: occurrence.occurrenceKey }),
    }

    if (
      occurrence.originalStartTime === null ||
      nextStartTime !== occurrence.originalStartTime
    ) {
      next.startTime = nextStartTime
    }
    if (
      occurrence.originalEndTime === null ||
      nextEndTime !== occurrence.originalEndTime
    ) {
      next.endTime = nextEndTime
    }
    if (nextRoomId !== input.defaults.roomId) {
      next.roomId = nextRoomId
    }

    exceptions = exceptions.filter(
      (item) =>
        !(
          item.action === 'OVERRIDE' &&
          item.occurrenceKey === occurrence.occurrenceKey
        ),
    )
    if (hasOverrideFields(next)) exceptions.push(next)
  }

  return { ...input, exceptions }
}

function roomLabel(room: MeetingRoom, arabic: boolean): string {
  return arabic ? room.nameAr : room.nameEn
}

function roomNameById(
  rooms: readonly MeetingRoom[],
  roomId: number,
  arabic: boolean,
): string {
  const room = rooms.find((item) => item.id === roomId)
  return room ? roomLabel(room, arabic) : String(roomId)
}

function selectedPreviewOccurrences(
  preview: MeetingSeriesPreview | undefined,
  selectedKeys: ReadonlySet<string>,
): MeetingSeriesPreviewOccurrence[] {
  if (!preview) return []
  return preview.occurrences.filter((occurrence) =>
    selectedKeys.has(occurrence.occurrenceKey),
  )
}

export function MeetingSeriesBulkScheduleWorkspace({
  open,
  rooms,
  selectedOccurrences,
  allOccurrences,
  previewInput,
  locale,
  timeFormat,
  onOpenChange,
  onApply,
}: MeetingSeriesBulkScheduleWorkspaceProps) {
  const { i18n, t } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  const selectedKeys = useMemo(
    () => new Set(selectedOccurrences.map((occurrence) => occurrence.occurrenceKey)),
    [selectedOccurrences],
  )
  const firstOccurrence = selectedOccurrences[0] ?? null
  const selectedCount = selectedOccurrences.length

  const [changeRoom, setChangeRoom] = useState(false)
  const [roomId, setRoomId] = useState<number | null>(null)
  const [changeTime, setChangeTime] = useState(false)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [focusedOccurrenceKey, setFocusedOccurrenceKey] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (!open || !firstOccurrence) return
    const allSameRoom = selectedOccurrences.every(
      (occurrence) => occurrence.roomId === firstOccurrence.roomId,
    )
    const allSameTime = selectedOccurrences.every(
      (occurrence) =>
        occurrence.startTime === firstOccurrence.startTime &&
        occurrence.endTime === firstOccurrence.endTime,
    )

    setChangeRoom(false)
    setRoomId(allSameRoom ? firstOccurrence.roomId : firstOccurrence.roomId)
    setChangeTime(false)
    setStartTime(firstOccurrence.startTime)
    setEndTime(firstOccurrence.endTime)
    setFocusedOccurrenceKey(
      selectedOccurrences.find((occurrence) => !occurrence.validation.isValid)
        ?.occurrenceKey ??
        firstOccurrence.occurrenceKey,
    )

    if (!allSameTime) {
      setStartTime(firstOccurrence.startTime)
      setEndTime(firstOccurrence.endTime)
    }
  }, [firstOccurrence, open, selectedOccurrences])

  const invalidTime =
    changeTime && (!startTime || !endTime || endTime <= startTime)

  const proposedValues = useMemo<MeetingSeriesBulkScheduleValues>(
    () => ({
      ...(changeRoom && roomId ? { roomId } : {}),
      ...(changeTime ? { startTime, endTime } : {}),
    }),
    [changeRoom, changeTime, endTime, roomId, startTime],
  )

  const hasProposedChange = changeRoom || changeTime
  const candidateInput = useMemo(
    () =>
      previewInput && hasProposedChange && !invalidTime
        ? applyScheduleChangesToInput(
            previewInput,
            selectedOccurrences,
            proposedValues,
          )
        : null,
    [
      hasProposedChange,
      invalidTime,
      previewInput,
      proposedValues,
      selectedOccurrences,
    ],
  )

  const candidateQuery = useQuery({
    queryKey: ['meeting-series', 'bulk-impact', candidateInput],
    queryFn: () => previewMeetingSeries(candidateInput as MeetingSeriesPreviewInput),
    enabled: open && candidateInput !== null,
    staleTime: 0,
    retry: false,
  })

  const roomQueries = useQueries({
    queries: rooms.map((room) => {
      const roomInput =
        previewInput && open
          ? applyScheduleChangesToInput(previewInput, selectedOccurrences, {
              roomId: room.id,
              ...(changeTime ? { startTime, endTime } : {}),
            })
          : null

      return {
        queryKey: ['meeting-series', 'bulk-room-impact', room.id, roomInput],
        queryFn: () =>
          previewMeetingSeries(roomInput as MeetingSeriesPreviewInput),
        enabled:
          open &&
          previewInput !== null &&
          selectedCount > 0 &&
          !invalidTime &&
          roomInput !== null,
        staleTime: 0,
        retry: false,
      }
    }),
  })

  const currentImpact =
    hasProposedChange && candidateQuery.data
      ? selectedPreviewOccurrences(candidateQuery.data, selectedKeys)
      : [...selectedOccurrences]

  const impactByKey = useMemo(
    () =>
      new Map(
        currentImpact.map((occurrence) => [
          occurrence.occurrenceKey,
          occurrence,
        ]),
      ),
    [currentImpact],
  )

  const orderedImpact = selectedOccurrences
    .map(
      (occurrence) =>
        impactByKey.get(occurrence.occurrenceKey) ?? occurrence,
    )
    .sort((left, right) => left.date.localeCompare(right.date))

  const validCount = orderedImpact.filter(
    (occurrence) => occurrence.validation.isValid,
  ).length
  const attentionCount = orderedImpact.length - validCount

  const rankedRooms = rooms
    .map((room, index) => {
      const query = roomQueries[index]
      const matching = selectedPreviewOccurrences(query?.data, selectedKeys)
      const valid = matching.filter(
        (occurrence) => occurrence.validation.isValid,
      ).length
      return {
        room,
        query,
        valid,
        attention: selectedCount - valid,
      }
    })
    .sort((left, right) => {
      const leftReady = left.query?.data ? left.valid : -1
      const rightReady = right.query?.data ? right.valid : -1
      if (rightReady !== leftReady) return rightReady - leftReady
      if (right.room.capacity !== left.room.capacity) {
        return right.room.capacity - left.room.capacity
      }
      return roomLabel(left.room, arabic).localeCompare(
        roomLabel(right.room, arabic),
      )
    })

  const focusedOccurrence =
    orderedImpact.find(
      (occurrence) => occurrence.occurrenceKey === focusedOccurrenceKey,
    ) ??
    orderedImpact.find((occurrence) => !occurrence.validation.isValid) ??
    orderedImpact[0] ??
    null

  const supplementalBusyRanges = focusedOccurrence
    ? (
        candidateQuery.data?.occurrences ??
        allOccurrences
      )
        .filter(
          (occurrence) =>
            occurrence.occurrenceKey !== focusedOccurrence.occurrenceKey &&
            occurrence.date === focusedOccurrence.date &&
            occurrence.roomId === focusedOccurrence.roomId,
        )
        .map((occurrence) => ({
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
          label: t('meetings.series.bulk.anotherSeriesMeeting'),
        }))
    : []

  function applyChanges() {
    if (!hasProposedChange || invalidTime) return
    onApply(proposedValues)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="w-[min(94rem,calc(100vw-2rem))] max-w-none overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">
          {t('meetings.series.bulk.smartTitle', { count: selectedCount })}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('meetings.series.bulk.smartDescription')}
        </DialogDescription>

        <div className="flex max-h-[92vh] min-h-[42rem] flex-col">
          <div className="border-b px-5 py-5 pe-14 sm:px-6 sm:pe-16">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                  {t('meetings.series.bulk.bulkEyebrow')}
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {t('meetings.series.bulk.smartTitle', {
                    count: selectedCount,
                  })}
                </h2>
                <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
                  {t('meetings.series.bulk.smartDescription')}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {t('meetings.series.bulk.selectedSummary', {
                    count: selectedCount,
                  })}
                </Badge>
                {candidateQuery.isFetching ? (
                  <Badge variant="secondary">
                    <Loader2 aria-hidden="true" className="me-1 size-3 animate-spin" />
                    {t('meetings.series.bulk.checkingImpact')}
                  </Badge>
                ) : attentionCount > 0 ? (
                  <Badge variant="destructive">
                    {t('meetings.series.bulk.attentionSummary', {
                      count: attentionCount,
                    })}
                  </Badge>
                ) : (
                  <Badge variant="success">
                    {t('meetings.series.bulk.readySummary', {
                      count: validCount,
                    })}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="min-h-0 overflow-y-auto border-b p-4 sm:p-5 xl:border-b-0 xl:border-e">
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                        <DoorOpen aria-hidden="true" className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {t('meetings.series.bulk.changeRoom')}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {t('meetings.series.bulk.roomRankingHint')}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={changeRoom}
                      onCheckedChange={setChangeRoom}
                    />
                  </div>

                  <div className="mt-4 grid gap-2">
                    {rankedRooms.map(({ room, query, valid, attention }) => {
                      const active = changeRoom && roomId === room.id
                      return (
                        <button
                          key={room.id}
                          type="button"
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active
                              ? 'border-primary/45 bg-primary/[0.05] ring-1 ring-primary/10'
                              : 'bg-background hover:bg-muted/30',
                          )}
                          onClick={() => {
                            setChangeRoom(true)
                            setRoomId(room.id)
                          }}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {roomLabel(room, arabic)}
                            </p>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              {t('meetings.series.bulk.roomCapacity', {
                                count: room.capacity,
                              })}
                            </p>
                          </div>

                          {query?.isError ? (
                            <Badge variant="destructive">
                              {t('meetings.series.bulk.checkFailed')}
                            </Badge>
                          ) : query?.isFetching || !query?.data ? (
                            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                              <Loader2
                                aria-hidden="true"
                                className="size-3 animate-spin"
                              />
                              {t('meetings.series.bulk.checkingShort')}
                            </span>
                          ) : attention === 0 ? (
                            <Badge variant="success">
                              {t('meetings.series.bulk.availableForAll', {
                                ready: valid,
                                total: selectedCount,
                              })}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              {t('meetings.series.bulk.availableCount', {
                                ready: valid,
                                total: selectedCount,
                              })}
                            </Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                        <Clock3 aria-hidden="true" className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {t('meetings.series.bulk.changeTime')}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {t('meetings.series.bulk.timeImpactHint')}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={changeTime}
                      onCheckedChange={setChangeTime}
                    />
                  </div>

                  {changeTime ? (
                    <MeetingTimeRangePicker
                      className="mt-4"
                      startTime={startTime}
                      endTime={endTime}
                      error={
                        invalidTime
                          ? t('meetings.series.validation.endAfterStart')
                          : undefined
                      }
                      onChange={(nextStartTime, nextEndTime) => {
                        setStartTime(nextStartTime)
                        setEndTime(nextEndTime)
                      }}
                    />
                  ) : null}
                </Card>

                <Card className="overflow-hidden p-0">
                  <div className="border-b px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {t('meetings.series.bulk.impactTitle')}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {t('meetings.series.bulk.impactHint')}
                        </p>
                      </div>
                      {candidateQuery.isFetching ? (
                        <Loader2
                          aria-hidden="true"
                          className="text-primary size-4 animate-spin"
                        />
                      ) : null}
                    </div>
                  </div>

                  {candidateQuery.isError ? (
                    <div className="border-b border-destructive/20 bg-destructive/[0.04] px-4 py-3 text-xs text-destructive">
                      {t('meetings.series.bulk.impactCheckFailed')}
                    </div>
                  ) : null}

                  <div className="divide-y">
                    {orderedImpact.map((occurrence) => (
                      <button
                        key={occurrence.occurrenceKey}
                        type="button"
                        className={cn(
                          'grid w-full gap-2 px-4 py-3 text-start outline-none hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(9rem,1fr)_minmax(8rem,0.8fr)_minmax(9rem,1fr)_auto] sm:items-center',
                          focusedOccurrence?.occurrenceKey ===
                            occurrence.occurrenceKey && 'bg-muted/25',
                        )}
                        onClick={() =>
                          setFocusedOccurrenceKey(occurrence.occurrenceKey)
                        }
                      >
                        <div>
                          <p className="text-sm font-semibold">
                            {new Intl.DateTimeFormat(locale, {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              timeZone: 'UTC',
                            }).format(
                              new Date(`${occurrence.date}T12:00:00Z`),
                            )}
                          </p>
                          <p className="text-muted-foreground mt-0.5 truncate text-xs">
                            {occurrence.title}
                          </p>
                        </div>

                        <span
                          dir="ltr"
                          className="text-sm font-medium tabular-nums"
                        >
                          {formatClockTime(
                            occurrence.startTime,
                            locale,
                            timeFormat,
                          )}{' '}
                          –{' '}
                          {formatClockTime(
                            occurrence.endTime,
                            locale,
                            timeFormat,
                          )}
                        </span>

                        <span className="truncate text-sm">
                          {roomNameById(rooms, occurrence.roomId, arabic)}
                        </span>

                        {occurrence.validation.isValid ? (
                          <Badge variant="success">
                            {t('meetings.series.redesign.statusReady')}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            {t('meetings.series.redesign.statusAttention')}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto bg-muted/10 p-4 sm:p-5">
              {focusedOccurrence ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {t('meetings.series.bulk.inspectDateTitle')}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {t('meetings.series.bulk.inspectDateHint')}
                      </p>
                    </div>
                    {!focusedOccurrence.validation.isValid ? (
                      <Badge variant="destructive">
                        <AlertTriangle
                          aria-hidden="true"
                          className="me-1 size-3"
                        />
                        {focusedOccurrence.validation.issues[0]?.message ??
                          t('meetings.series.redesign.statusAttention')}
                      </Badge>
                    ) : (
                      <Badge variant="success">
                        <CheckCircle2
                          aria-hidden="true"
                          className="me-1 size-3"
                        />
                        {t('meetings.series.redesign.statusReady')}
                      </Badge>
                    )}
                  </div>

                  <MeetingSchedulePicker
                    date={focusedOccurrence.date}
                    roomId={focusedOccurrence.roomId}
                    rooms={[...rooms]}
                    participantCount={focusedOccurrence.participantCount}
                    startTime={focusedOccurrence.startTime}
                    endTime={focusedOccurrence.endTime}
                    timeSelected
                    disabled
                    allowBusySelection
                    showDurationPicker={false}
                    directTimeRangeSelection
                    supplementalBusyRanges={supplementalBusyRanges}
                    heading={t('meetings.series.bulk.dayTimelineTitle')}
                    description={t('meetings.series.bulk.dayTimelineHint')}
                    onDateChange={() => undefined}
                    onRoomChange={() => undefined}
                    onTimeChange={() => undefined}
                  />
                </div>
              ) : (
                <div className="grid min-h-72 place-items-center text-center">
                  <div>
                    <DoorOpen
                      aria-hidden="true"
                      className="text-muted-foreground mx-auto size-8"
                    />
                    <p className="mt-3 text-sm font-semibold">
                      {t('meetings.series.bulk.noSelectionTitle')}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('meetings.series.bulk.noSelectionHint')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-background flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5 sm:px-6">
            <div className="text-muted-foreground text-xs">
              {attentionCount > 0 ? (
                <span className="text-destructive font-medium">
                  {t('meetings.series.bulk.conflictsAllowed', {
                    count: attentionCount,
                  })}
                </span>
              ) : hasProposedChange ? (
                <span>
                  {t('meetings.series.bulk.allProposedReady', {
                    count: validCount,
                  })}
                </span>
              ) : (
                <span>{t('meetings.series.bulk.chooseChangeHint')}</span>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={!hasProposedChange || invalidTime}
                onClick={applyChanges}
              >
                {t('meetings.series.bulk.apply')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
