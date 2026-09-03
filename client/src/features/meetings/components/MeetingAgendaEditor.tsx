import {
  ChevronDown,
  Clock3,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  SortableDragHandle,
  SortableDropIndicator,
  TaskHubDragDropProvider,
  useTaskHubSortable,
} from '@/components/shared/TaskHubSortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'

import type { MeetingParticipant } from '../types/meeting.types'

const DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90] as const

export interface MeetingAgendaDraftItem {
  clientId: string
  topic: string
  presenterUserId: number | null
  plannedDurationMinutes: number | null
}

interface MeetingAgendaEditorProps {
  items: MeetingAgendaDraftItem[]
  participants: MeetingParticipant[]
  organizerUserId: number | null
  meetingDurationMinutes: number
  disabled?: boolean
  errors?: Record<string, string>
  focusItemId?: string | null
  focusRequestId?: number
  onChange: (items: MeetingAgendaDraftItem[]) => void
  onErrorClear?: (clientId: string) => void
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `agenda-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function reorderAgendaItems(
  items: readonly MeetingAgendaDraftItem[],
  sourceId: string,
  targetId: string,
): MeetingAgendaDraftItem[] | readonly MeetingAgendaDraftItem[] {
  if (sourceId === targetId) return items

  const sourceIndex = items.findIndex((item) => item.clientId === sourceId)
  const targetIndex = items.findIndex((item) => item.clientId === targetId)

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items

  const next = [...items]
  const [movedItem] = next.splice(sourceIndex, 1)
  if (!movedItem) return items

  next.splice(targetIndex, 0, movedItem)
  return next
}

function agendaSummary(
  count: number,
  plannedMinutes: number,
  hasPlannedTime: boolean,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (count === 0) return t('meetings.create.agenda.emptyCollapsed')
  if (!hasPlannedTime) return t('meetings.create.agenda.topicCount', { count })
  return t('meetings.create.agenda.topicCountWithTime', {
    count,
    minutes: plannedMinutes,
  })
}

export function MeetingAgendaEditor({
  items,
  participants,
  organizerUserId,
  meetingDurationMinutes,
  disabled = false,
  errors = {},
  focusItemId = null,
  focusRequestId = 0,
  onChange,
  onErrorClear,
}: MeetingAgendaEditorProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const topicRefs = useRef(new Map<string, HTMLInputElement>())

  const participantById = useMemo(
    () => new Map(participants.map((participant) => [participant.userId, participant])),
    [participants],
  )
  const allowedPresenterIds = useMemo(
    () => new Set(participants.map((participant) => participant.userId)),
    [participants],
  )
  const plannedMinutes = items.reduce(
    (total, item) => total + (item.plannedDurationMinutes ?? 0),
    0,
  )
  const hasPlannedTime = items.some((item) => item.plannedDurationMinutes !== null)
  const exceedsMeeting = hasPlannedTime && plannedMinutes > meetingDurationMinutes
  const progress = hasPlannedTime
    ? Math.min(100, Math.max(0, (plannedMinutes / Math.max(1, meetingDurationMinutes)) * 100))
    : 0

  useEffect(() => {
    const invalidPresenterExists = items.some(
      (item) => item.presenterUserId !== null && !allowedPresenterIds.has(item.presenterUserId),
    )
    if (!invalidPresenterExists) return

    onChange(
      items.map((item) =>
        item.presenterUserId !== null && !allowedPresenterIds.has(item.presenterUserId)
          ? { ...item, presenterUserId: null }
          : item,
      ),
    )
  }, [allowedPresenterIds, items, onChange])

  useEffect(() => {
    if (!focusItemId || focusRequestId <= 0) return
    setOpen(true)
    setEditingId(focusItemId)
    const frame = window.requestAnimationFrame(() => {
      const input = topicRefs.current.get(focusItemId)
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      input?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusItemId, focusRequestId])

  function updateItem(clientId: string, patch: Partial<MeetingAgendaDraftItem>) {
    onChange(items.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item)))
  }

  function addItem() {
    const clientId = createClientId()
    onChange([
      ...items,
      {
        clientId,
        topic: '',
        presenterUserId: null,
        plannedDurationMinutes: null,
      },
    ])
    setOpen(true)
    setEditingId(clientId)
    window.requestAnimationFrame(() => topicRefs.current.get(clientId)?.focus())
  }

  function deleteItem(clientId: string) {
    onChange(items.filter((item) => item.clientId !== clientId))
    onErrorClear?.(clientId)
    if (editingId === clientId) setEditingId(null)
  }

  const collapsedSummary = agendaSummary(items.length, plannedMinutes, hasPlannedTime, t)

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-4 px-4 py-3.5 text-start outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex min-w-0 flex-1 items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
            <ListChecks aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{t('meetings.create.agenda.title')}</span>
              {items.length > 0 ? (
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {t('meetings.create.agenda.topicCount', { count: items.length })}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground mt-1 block text-xs leading-5">
              {open ? t('meetings.create.agenda.description') : collapsedSummary}
            </span>
          </span>
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
          className="text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg group-hover:text-foreground"
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: 'easeOut' }}
            className="overflow-hidden border-t"
          >
            <div className="space-y-4 p-4 sm:p-5">
              {items.length === 0 ? (
                <div className="bg-muted/20 flex flex-col items-center rounded-xl border border-dashed px-5 py-7 text-center">
                  <span className="bg-background text-muted-foreground grid size-11 place-items-center rounded-xl border shadow-xs">
                    <ListChecks aria-hidden="true" className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold">{t('meetings.create.agenda.emptyTitle')}</p>
                  <p className="text-muted-foreground mt-1 max-w-md text-xs leading-5">
                    {t('meetings.create.agenda.emptyDescription')}
                  </p>
                  <Button className="mt-4" size="sm" variant="outline" disabled={disabled} onClick={addItem}>
                    <Plus aria-hidden="true" className="size-4" />
                    {t('meetings.create.agenda.addFirst')}
                  </Button>
                </div>
              ) : (
                <TaskHubDragDropProvider
                  onDragEnd={(event) => {
                    if (event.canceled) return

                    const sourceId = event.operation.source?.id
                    const targetId = event.operation.target?.id
                    if (sourceId === undefined || sourceId === null || targetId === undefined || targetId === null) {
                      return
                    }

                    const next = reorderAgendaItems(items, String(sourceId), String(targetId))
                    if (next === items) return
                    onChange([...next])
                  }}
                >
                  <div className="space-y-2.5">
                    {items.map((item, index) => (
                      <SortableAgendaItem
                        key={item.clientId}
                        item={item}
                        index={index}
                        participantById={participantById}
                        participants={participants}
                        organizerUserId={organizerUserId}
                        editing={editingId === item.clientId}
                        disabled={disabled}
                        error={errors[item.clientId]}
                        topicRef={(node) => {
                          if (node) topicRefs.current.set(item.clientId, node)
                          else topicRefs.current.delete(item.clientId)
                        }}
                        onEdit={() => setEditingId(item.clientId)}
                        onDone={() => setEditingId(null)}
                        onDelete={() => deleteItem(item.clientId)}
                        onChange={(patch) => updateItem(item.clientId, patch)}
                        onTopicChange={(topic) => {
                          updateItem(item.clientId, { topic })
                          if (topic.trim()) onErrorClear?.(item.clientId)
                        }}
                      />
                    ))}
                  </div>
                </TaskHubDragDropProvider>
              )}

              {items.length > 0 ? (
                <Button size="sm" variant="outline" disabled={disabled} onClick={addItem}>
                  <Plus aria-hidden="true" className="size-4" />
                  {t('meetings.create.agenda.addTopic')}
                </Button>
              ) : null}

              {hasPlannedTime ? (
                <div
                  className={cn(
                    'rounded-xl border p-3.5',
                    exceedsMeeting ? 'border-warning/40 bg-warning/5' : 'bg-muted/20',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Clock3 aria-hidden="true" className={cn('size-3.5', exceedsMeeting ? 'text-warning' : 'text-primary')} />
                      {t('meetings.create.agenda.timeTitle')}
                    </span>
                    <span className={cn('font-semibold tabular-nums', exceedsMeeting && 'text-warning-foreground')}>
                      {t('meetings.create.agenda.timeValue', {
                        planned: plannedMinutes,
                        meeting: meetingDurationMinutes,
                      })}
                    </span>
                  </div>
                  <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn('h-full rounded-full transition-[width]', exceedsMeeting ? 'bg-warning' : 'bg-primary')}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className={cn('mt-2 text-xs leading-5', exceedsMeeting ? 'text-warning-foreground' : 'text-muted-foreground')}>
                    {exceedsMeeting
                      ? t('meetings.create.agenda.timeOver', {
                          minutes: plannedMinutes - meetingDurationMinutes,
                        })
                      : t('meetings.create.agenda.timeOptional')}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs leading-5">
                  {t('meetings.create.agenda.timeOptional')}
                </p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}

function SortableAgendaItem({
  item,
  index,
  participantById,
  participants,
  organizerUserId,
  editing,
  disabled,
  error,
  topicRef,
  onEdit,
  onDone,
  onDelete,
  onChange,
  onTopicChange,
}: {
  item: MeetingAgendaDraftItem
  index: number
  participantById: Map<number, MeetingParticipant>
  participants: MeetingParticipant[]
  organizerUserId: number | null
  editing: boolean
  disabled: boolean
  error?: string
  topicRef: (node: HTMLInputElement | null) => void
  onEdit: () => void
  onDone: () => void
  onDelete: () => void
  onChange: (patch: Partial<MeetingAgendaDraftItem>) => void
  onTopicChange: (topic: string) => void
}) {
  const { t } = useTranslation()
  const sortable = useTaskHubSortable({ id: item.clientId, index, disabled })
  const presenter = item.presenterUserId ? participantById.get(item.presenterUserId) ?? null : null

  return (
    <div ref={sortable.ref} className="relative">
      <SortableDropIndicator position={sortable.dropPosition} />
      <div
        className={cn(
          'rounded-xl border bg-background transition-shadow',
          error && 'border-destructive/70 ring-1 ring-destructive/15',
          sortable.isDragging && 'shadow-lg',
        )}
      >
        <div className="flex items-start gap-2 p-2.5 sm:p-3">
          <SortableDragHandle
            handleRef={sortable.handleRef}
            label={t('meetings.create.agenda.dragTopic', { number: index + 1 })}
            disabled={disabled}
            className="mt-0.5 shrink-0"
          />
          <span className="bg-muted text-muted-foreground mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('line-clamp-2 text-sm font-semibold leading-5', !item.topic.trim() && 'text-muted-foreground italic')}>
              {item.topic.trim() || t('meetings.create.agenda.untitledTopic')}
            </p>
            <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">
                  {presenter
                    ? presenter.userName
                    : t('meetings.create.agenda.noPresenter')}
                </span>
              </span>
              {item.plannedDurationMinutes !== null ? (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Clock3 aria-hidden="true" className="size-3.5" />
                  {t('meetings.create.agenda.minutesValue', {
                    count: item.plannedDurationMinutes,
                  })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled}
              aria-label={t('meetings.create.agenda.editTopic', { number: index + 1 })}
              onClick={onEdit}
            >
              <Pencil aria-hidden="true" className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled}
              aria-label={t('meetings.create.agenda.deleteTopic', { number: index + 1 })}
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {editing ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="overflow-hidden border-t"
            >
              <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold">
                    {t('meetings.create.agenda.topicLabel')} <span className="text-destructive">*</span>
                  </span>
                  <Input
                    ref={topicRef}
                    value={item.topic}
                    maxLength={500}
                    disabled={disabled}
                    aria-invalid={Boolean(error)}
                    placeholder={t('meetings.create.agenda.topicPlaceholder')}
                    className={cn(error && 'border-destructive focus-visible:ring-destructive/25')}
                    onChange={(event) => onTopicChange(event.target.value)}
                  />
                  {error ? (
                    <p role="alert" className="text-destructive text-xs font-medium">
                      {error}
                    </p>
                  ) : null}
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold">{t('meetings.create.agenda.presenterLabel')}</span>
                  <Select
                    value={item.presenterUserId === null ? 'NONE' : String(item.presenterUserId)}
                    disabled={disabled}
                    onValueChange={(value) =>
                      onChange({ presenterUserId: value === 'NONE' ? null : Number(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">{t('meetings.create.agenda.noPresenter')}</SelectItem>
                      {participants.map((participant) => (
                        <SelectItem key={participant.userId} value={String(participant.userId)}>
                          {participant.userName}
                          {participant.userId === organizerUserId
                            ? ` · ${t('meetings.organizer')}`
                            : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold">{t('meetings.create.agenda.durationLabel')}</span>
                  <Select
                    value={
                      item.plannedDurationMinutes === null
                        ? 'NONE'
                        : String(item.plannedDurationMinutes)
                    }
                    disabled={disabled}
                    onValueChange={(value) =>
                      onChange({ plannedDurationMinutes: value === 'NONE' ? null : Number(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">{t('meetings.create.agenda.noDuration')}</SelectItem>
                      {DURATION_OPTIONS.map((minutes) => (
                        <SelectItem key={minutes} value={String(minutes)}>
                          {t('meetings.create.agenda.minutesValue', { count: minutes })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <div className="flex justify-end sm:col-span-2">
                  <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onDone}>
                    {t('meetings.create.agenda.doneEditing')}
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
