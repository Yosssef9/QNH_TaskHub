import {
  AlertTriangle,
  CalendarPlus2,
  CheckCircle2,
  Copy,
  FileText,
  RotateCcw,
  Save,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputField, TextareaField } from '@/components/shared/Input'
import type { SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/cn'
import { formatMeetingAttachmentBytes } from '../meeting-attachment-policy'

import { MeetingAgendaEditor, type MeetingAgendaDraftItem } from '../components/MeetingAgendaEditor'
import { MeetingParticipantPicker } from '../components/MeetingParticipantPicker'
import { MeetingSchedulePicker } from '../components/MeetingSchedulePicker'
import type { MeetingParticipant, MeetingRoom } from '../types/meeting.types'
import { MeetingSeriesFilePicker, type MeetingSeriesDraftFile } from './MeetingSeriesFilePicker'
import type {
  MeetingSeriesDefaultsInput,
  MeetingSeriesPreviewOccurrence,
} from './meeting-series.types'

export interface MeetingSeriesOccurrenceScheduleValues {
  date: string
  startTime: string
  endTime: string
  roomId: number
}

export interface MeetingSeriesOccurrenceDetailValues {
  title: string
  description: string | null
  organizerAttending: boolean
  attendeeUserIds: number[]
  agendaItems: Array<{
    topic: string
    presenterUserId: number | null
    plannedDurationMinutes: number | null
  }>
}

function participantOption(participant: MeetingParticipant): SearchableSelectOption {
  return {
    value: participant.userId,
    label: participant.userName,
    description: participant.userCode,
  }
}

function agendaDraftItems(occurrence: MeetingSeriesPreviewOccurrence): MeetingAgendaDraftItem[] {
  return occurrence.agendaItems.map((item, index) => ({
    clientId: `${occurrence.occurrenceKey}-agenda-${index}`,
    id: null,
    topic: item.topic,
    presenterUserId: item.presenterUserId ?? null,
    plannedDurationMinutes: item.plannedDurationMinutes ?? null,
  }))
}

function timeDurationMinutes(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  const start = (startHour || 0) * 60 + (startMinute || 0)
  const end = (endHour || 0) * 60 + (endMinute || 0)
  return Math.max(15, end - start)
}

function selectedParticipantOptions(
  userIds: readonly number[],
  known: readonly SearchableSelectOption[],
): SearchableSelectOption[] {
  const byId = new Map(known.map((option) => [Number(option.value), option]))
  return userIds
    .map((userId) => byId.get(userId))
    .filter((option): option is SearchableSelectOption => Boolean(option))
}

export function MeetingSeriesOccurrenceEditor({
  occurrence,
  defaults,
  rooms,
  seriesOccurrences,
  organizer,
  participantOptions,
  knownParticipantOptions,
  participantSearch,
  participantLoading,
  participantLoadingMore,
  participantHasMore,
  saving = false,
  commonAttachmentFiles,
  attachmentFiles,
  attachmentMaxCount,
  onAttachmentFilesChange,
  onParticipantSearchChange,
  onLoadMoreParticipants,
  onRememberParticipantOptions,
  onSaveSchedule,
  onSaveDetails,
  onResetAll,
  onRemove,
  onDuplicate,
  onClose,
}: {
  occurrence: MeetingSeriesPreviewOccurrence
  defaults: MeetingSeriesDefaultsInput
  rooms: readonly MeetingRoom[]
  seriesOccurrences: readonly MeetingSeriesPreviewOccurrence[]
  organizer: MeetingParticipant | null
  participantOptions: readonly SearchableSelectOption[]
  knownParticipantOptions: readonly SearchableSelectOption[]
  participantSearch: string
  participantLoading: boolean
  participantLoadingMore: boolean
  participantHasMore: boolean
  saving?: boolean
  commonAttachmentFiles: readonly MeetingSeriesDraftFile[]
  attachmentFiles: MeetingSeriesDraftFile[]
  attachmentMaxCount: number
  onAttachmentFilesChange: (files: MeetingSeriesDraftFile[]) => void
  onParticipantSearchChange: (value: string) => void
  onLoadMoreParticipants: () => void
  onRememberParticipantOptions: (values: readonly number[]) => void
  onSaveSchedule: (values: MeetingSeriesOccurrenceScheduleValues) => void
  onSaveDetails: (values: MeetingSeriesOccurrenceDetailValues) => void
  onResetSchedule: () => void
  onResetDetails: () => void
  onResetAll: () => void
  onRemove?: () => void
  onDuplicate?: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState(occurrence.date)
  const [startTime, setStartTime] = useState(occurrence.startTime)
  const [endTime, setEndTime] = useState(occurrence.endTime)
  const [roomId, setRoomId] = useState<number>(occurrence.roomId)
  const [title, setTitle] = useState(occurrence.title)
  const [description, setDescription] = useState(occurrence.description ?? '')
  const [organizerAttending, setOrganizerAttending] = useState(occurrence.organizerAttending)
  const [attendeeUserIds, setAttendeeUserIds] = useState<number[]>(occurrence.attendeeUserIds)
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaDraftItem[]>(() => agendaDraftItems(occurrence))

  useEffect(() => {
    setDate(occurrence.date)
    setStartTime(occurrence.startTime)
    setEndTime(occurrence.endTime)
    setRoomId(occurrence.roomId)
    setTitle(occurrence.title)
    setDescription(occurrence.description ?? '')
    setOrganizerAttending(occurrence.organizerAttending)
    setAttendeeUserIds(occurrence.attendeeUserIds)
    setAgendaItems(agendaDraftItems(occurrence))
  }, [occurrence])

  const invalidTime = !startTime || !endTime || endTime <= startTime

  const allKnownOptions = useMemo(() => {
    const byId = new Map<number, SearchableSelectOption>()
    for (const option of [...knownParticipantOptions, ...participantOptions]) {
      byId.set(Number(option.value), option)
    }
    if (organizer) byId.set(organizer.userId, participantOption(organizer))
    return [...byId.values()]
  }, [knownParticipantOptions, organizer, participantOptions])

  const selectedOptions = useMemo(
    () => selectedParticipantOptions(attendeeUserIds, allKnownOptions),
    [allKnownOptions, attendeeUserIds],
  )

  const agendaParticipants = useMemo<MeetingParticipant[]>(() => {
    const participants: MeetingParticipant[] = []
    if (organizerAttending && organizer) participants.push(organizer)
    for (const option of selectedOptions) {
      participants.push({
        userId: Number(option.value),
        userCode: option.description ?? '',
        userName: option.label,
      })
    }
    return participants
  }, [organizer, organizerAttending, selectedOptions])

  const allowedPresenterIds = useMemo(
    () => new Set(agendaParticipants.map((participant) => participant.userId)),
    [agendaParticipants],
  )
  const invalidPresenterItems = agendaItems.filter(
    (item) => item.presenterUserId !== null && !allowedPresenterIds.has(item.presenterUserId),
  )
  const agendaErrors = Object.fromEntries(
    invalidPresenterItems.map((item) => [
      item.clientId,
      t('meetings.series.customize.presenterMustAttend'),
    ]),
  )
  const attendeeDelta = useMemo(() => {
    const defaultsSet = new Set(defaults.attendeeUserIds)
    const currentSet = new Set(attendeeUserIds)
    return {
      added: attendeeUserIds.filter((id) => !defaultsSet.has(id)).length,
      removed: defaults.attendeeUserIds.filter((id) => !currentSet.has(id)).length,
    }
  }, [attendeeUserIds, defaults.attendeeUserIds])
  const participantCount = attendeeUserIds.length + (organizerAttending ? 1 : 0)
  const detailsStructurallyValid =
    title.trim().length > 0 &&
    agendaItems.every((item) => item.topic.trim().length > 0) &&
    invalidPresenterItems.length === 0

  const supplementalBusyRanges = useMemo(
    () =>
      seriesOccurrences
        .filter(
          (item) =>
            item.occurrenceKey !== occurrence.occurrenceKey &&
            item.date === date &&
            item.roomId === roomId,
        )
        .map((item) => ({
          startTime: item.startTime,
          endTime: item.endTime,
          label: item.title,
        })),
    [date, occurrence.occurrenceKey, roomId, seriesOccurrences],
  )

  function saveAll() {
    if (!date || !roomId || invalidTime || !detailsStructurallyValid) return

    onSaveSchedule({ date, startTime, endTime, roomId })
    onSaveDetails({
      title: title.trim(),
      description: description.trim() || null,
      organizerAttending,
      attendeeUserIds,
      agendaItems: agendaItems.map((item) => ({
        topic: item.topic.trim(),
        presenterUserId: item.presenterUserId,
        plannedDurationMinutes: item.plannedDurationMinutes,
      })),
    })
    onClose()
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b px-5 py-5 pe-14 sm:px-6 sm:pe-16">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-primary text-xs font-semibold uppercase tracking-wide">
              {t('meetings.series.customize.editorEyebrow')}
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              {t('meetings.series.customize.editorTitle')}
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">{occurrence.title}</p>
          </div>

          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
              occurrence.validation.isValid
                ? 'border-success/25 bg-success/5 text-success'
                : 'border-destructive/25 bg-destructive/5 text-destructive',
            )}
          >
            {occurrence.validation.isValid ? (
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
            ) : (
              <AlertTriangle aria-hidden="true" className="size-3.5" />
            )}
            {t(
              occurrence.validation.isValid
                ? 'meetings.series.redesign.statusReady'
                : 'meetings.series.redesign.statusAttention',
            )}
          </div>
        </div>

        {occurrence.originalDate && occurrence.isCustomized ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {t('meetings.series.customize.originalSchedule', {
              date: occurrence.originalDate,
              start: occurrence.originalStartTime,
              end: occurrence.originalEndTime,
            })}
          </p>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 overflow-y-auto xl:grid-cols-[minmax(22rem,0.78fr)_minmax(34rem,1.22fr)] xl:overflow-hidden">
        <section className="space-y-4 border-b p-4 sm:p-5 xl:min-h-0 xl:overflow-y-auto xl:border-b-0 xl:border-e xl:[scrollbar-width:thin]">
          {occurrence.validation.issues.length > 0 ? (
            <div className="border-destructive/30 bg-destructive/5 rounded-xl border p-3.5">
              <p className="text-destructive flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle aria-hidden="true" className="size-4" />
                {t('meetings.series.customize.needsAttention')}
              </p>
              <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                {occurrence.validation.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>• {issue.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="border-success/25 bg-success/[0.03] rounded-xl border p-3.5">
              <p className="text-success flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 aria-hidden="true" className="size-4" />
                {t('meetings.series.redesign.singleMeetingReady')}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('meetings.series.redesign.singleMeetingReadyHint')}
              </p>
            </div>
          )}

          <div className="rounded-2xl border bg-background">
            <div className="border-b p-4">
              <p className="text-sm font-semibold">
                {t('meetings.create.detailsTitle')}
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                {t('meetings.series.customize.detailsSectionHint')}
              </p>
            </div>
            <div className="space-y-4 p-4">
              <InputField
                value={title}
                label={t('meetings.fields.title')}
                required
                maxLength={250}
                onChange={(event) => setTitle(event.target.value)}
              />
              <TextareaField
                value={description}
                label={t('meetings.fields.description')}
                rows={3}
                maxLength={10000}
                onChange={(event) => setDescription(event.target.value)}
              />

              <div className="bg-muted/15 rounded-xl border p-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {t('meetings.create.organizerAttendance.willAttend')}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('meetings.series.customize.organizerAttendanceHint')}
                    </p>
                  </div>
                  <Switch
                    checked={organizerAttending}
                    onCheckedChange={setOrganizerAttending}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {t('meetings.create.participantsTitle')}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {t('meetings.series.customize.attendeeOverrideHint')}
                    </p>
                  </div>
                  <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                    <UsersRound aria-hidden="true" className="size-3.5" />
                    {t('meetings.participantCount', { count: participantCount })}
                  </span>
                </div>
                <MeetingParticipantPicker
                  values={attendeeUserIds}
                  options={participantOptions}
                  selectedOptions={selectedOptions}
                  searchValue={participantSearch}
                  participantCount={participantCount}
                  loading={participantLoading}
                  loadingMore={participantLoadingMore}
                  hasMore={participantHasMore}
                  onSearchChange={onParticipantSearchChange}
                  onLoadMore={onLoadMoreParticipants}
                  onChange={(values) => {
                    setAttendeeUserIds(values)
                    onRememberParticipantOptions(values)
                  }}
                />
                {attendeeDelta.added > 0 || attendeeDelta.removed > 0 ? (
                  <p className="text-primary mt-2 text-xs font-medium">
                    {t('meetings.series.customize.attendeeDelta', attendeeDelta)}
                  </p>
                ) : null}
              </div>

              <MeetingAgendaEditor
                items={agendaItems}
                participants={agendaParticipants}
                organizerUserId={organizer?.userId ?? null}
                meetingDurationMinutes={timeDurationMinutes(startTime, endTime)}
                errors={agendaErrors}
                preserveInvalidPresenters
                onChange={setAgendaItems}
              />

              {commonAttachmentFiles.length > 0 ? (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.035] p-3.5">
                  <div className="flex items-start gap-2.5">
                    <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-lg">
                      <FileText aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {t('meetings.series.attachments.inheritedTitle')}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                        {t('meetings.series.attachments.inheritedDescription', {
                          count: commonAttachmentFiles.length,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {commonAttachmentFiles.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2"
                      >
                        <FileText aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {item.file.name}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-[11px]">
                          {formatMeetingAttachmentBytes(item.file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <MeetingSeriesFilePicker
                files={attachmentFiles}
                maxCount={attachmentMaxCount}
                title={t('meetings.series.attachments.occurrenceTitle')}
                description={t('meetings.series.attachments.occurrenceDescription')}
                onChange={onAttachmentFilesChange}
              />

              {invalidPresenterItems.length > 0 ? (
                <div className="border-destructive/30 bg-destructive/5 rounded-xl border p-3">
                  <p className="text-destructive flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle aria-hidden="true" className="size-4" />
                    {t('meetings.series.customize.presenterConflictTitle')}
                  </p>
                  <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                    {invalidPresenterItems.map((item) => (
                      <li key={item.clientId}>
                        •{' '}
                        {t('meetings.series.customize.presenterConflictTopic', {
                          topic:
                            item.topic ||
                            t('meetings.create.agenda.untitledTopic'),
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {onDuplicate ? (
              <Button type="button" variant="outline" disabled={saving} onClick={onDuplicate}>
                <Copy aria-hidden="true" className="size-4" />
                {t('meetings.series.customize.duplicate')}
              </Button>
            ) : null}
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={saving}
                onClick={onRemove}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {t('meetings.series.customize.remove')}
              </Button>
            ) : null}
          </div>
        </section>

        <div className="min-h-0 xl:overflow-y-auto xl:[scrollbar-width:thin]">
          <MeetingSchedulePicker
            date={date}
            roomId={roomId}
            rooms={[...rooms]}
            participantCount={participantCount}
            startTime={startTime}
            endTime={endTime}
            allowBusySelection
            showDurationPicker={false}
            directTimeRangeSelection
            supplementalBusyRanges={supplementalBusyRanges}
            heading={t('meetings.series.redesign.scheduleWorkspaceTitle')}
            description={t('meetings.series.redesign.scheduleWorkspaceHint')}
            disabled={saving}
            onDateChange={setDate}
            onRoomChange={(value) => value !== null && setRoomId(value)}
            onTimeChange={(nextStartTime, nextEndTime) => {
              setStartTime(nextStartTime)
              setEndTime(nextEndTime)
            }}
          />
        </div>
      </div>

      <div className="bg-background flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5 sm:px-6">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={onResetAll}>
            <RotateCcw aria-hidden="true" className="size-4" />
            {t('meetings.series.redesign.useSeriesSettings')}
          </Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>

        <Button
          type="button"
          disabled={saving || !date || !roomId || invalidTime || !detailsStructurallyValid}
          onClick={saveAll}
        >
          <Save aria-hidden="true" className="size-4" />
          {t('meetings.series.redesign.saveAndClose')}
        </Button>
      </div>
    </div>
  )
}

export function MeetingSeriesAddOccurrenceDialog({
  open,
  rooms,
  existingOccurrences,
  participantCount,
  initialValues,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  rooms: readonly MeetingRoom[]
  existingOccurrences: readonly MeetingSeriesPreviewOccurrence[]
  participantCount: number
  initialValues: MeetingSeriesOccurrenceScheduleValues
  onOpenChange: (open: boolean) => void
  onAdd: (values: MeetingSeriesOccurrenceScheduleValues) => void
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState(initialValues.date)
  const [startTime, setStartTime] = useState(initialValues.startTime)
  const [endTime, setEndTime] = useState(initialValues.endTime)
  const [roomId, setRoomId] = useState(initialValues.roomId)

  useEffect(() => {
    if (!open) return
    setDate(initialValues.date)
    setStartTime(initialValues.startTime)
    setEndTime(initialValues.endTime)
    setRoomId(initialValues.roomId)
  }, [initialValues, open])

  const invalidTime = !startTime || !endTime || endTime <= startTime
  const supplementalBusyRanges = useMemo(
    () =>
      existingOccurrences
        .filter((item) => item.date === date && item.roomId === roomId)
        .map((item) => ({
          startTime: item.startTime,
          endTime: item.endTime,
          label: item.title,
        })),
    [date, existingOccurrences, roomId],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="flex max-h-[calc(100dvh-2rem)] w-[min(76rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0"
      >
        <div className="border-b px-5 py-5 pe-14 sm:px-6 sm:pe-16">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
              <CalendarPlus2 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <DialogTitle>{t('meetings.series.addOccurrence.title')}</DialogTitle>
              <DialogDescription className="mt-1">
                {t('meetings.series.redesign.addMeetingWorkspaceHint')}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <MeetingSchedulePicker
            date={date}
            roomId={roomId}
            rooms={[...rooms]}
            participantCount={participantCount}
            startTime={startTime}
            endTime={endTime}
            allowBusySelection
            showDurationPicker={false}
            directTimeRangeSelection
            supplementalBusyRanges={supplementalBusyRanges}
            heading={t('meetings.series.redesign.addMeetingScheduleTitle')}
            description={t('meetings.series.redesign.addMeetingScheduleHint')}
            onDateChange={setDate}
            onRoomChange={(value) => value !== null && setRoomId(value)}
            onTimeChange={(nextStartTime, nextEndTime) => {
              setStartTime(nextStartTime)
              setEndTime(nextEndTime)
            }}
          />
        </div>

        <div className="bg-background flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5 sm:px-6">
          <p className="text-muted-foreground max-w-2xl text-xs">
            {t('meetings.series.redesign.addMeetingConflictHint')}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              disabled={!date || invalidTime || !roomId}
              onClick={() => {
                onAdd({ date, startTime, endTime, roomId })
                onOpenChange(false)
              }}
            >
              {t('meetings.series.addOccurrence.add')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

