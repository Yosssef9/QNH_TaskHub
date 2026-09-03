import { move as moveSortable } from '@dnd-kit/helpers'
import {
  Briefcase,
  CalendarDays,
  Check,
  Circle,
  Clock3,
  Flag,
  Gauge,
  Paperclip,
  Pencil,
  Plus,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { AnimatedState, taskHubFadeMotion } from '@/components/shared/TaskHubMotion'
import {
  SortableDragHandle,
  SortableDropIndicator,
  TaskHubDragDropProvider,
  useTaskHubSortable,
} from '@/components/shared/TaskHubSortable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useWorkCycle } from '@/features/work-cycles/hooks/use-work-cycles'
import { parseDateOnly } from '@/lib/date-only'
import { APP_TIME_ZONE, formatDateTime } from '@/lib/date-time'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { cn } from '@/lib/cn'

import { downloadAttachment } from '../api/tasks.api'
import {
  useCompleteSubtask,
  useDeleteAttachment,
  useDeleteSubtask,
  useReorderSubtasks,
  useTaskDetails,
  useUploadAttachment,
} from '../hooks/use-tasks'
import type { Subtask, TaskAttachment } from '../types/task.types'
import { AttachmentPreviewDialog } from './AttachmentPreviewDialog'
import { SubtaskEditorDialog } from './SubtaskEditorDialog'
import { TaskAttachmentList } from './TaskAttachmentList'
import { TaskDueIndicator, TaskPriorityIndicator } from './TaskSelectIndicators'
import { TaskStatusIndicator } from './TaskStatusIndicator'

interface Props {
  taskId: number | null
  focusSubtaskId?: number | null
  onOpenChange: (open: boolean) => void
}

function sameSubtaskOrder(left: Subtask[], right: Subtask[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id)
}

function sameSubtaskSet(left: Subtask[], right: Subtask[]) {
  if (left.length !== right.length) return false
  const ids = new Set(right.map((item) => item.id))
  return left.every((item) => ids.has(item.id))
}

function formatDate(value: string | null, locale: string): string | null {
  const date = value ? parseDateOnly(value) : null
  return date
    ? date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    : null
}

function getCurrentDateOnlyInAppTimeZone(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function SortableSubtaskRow({
  attachments,
  dragDisabled,
  readOnly,
  index,
  item,
  justMoved,
  focused,
  onDelete,
  onEdit,
  onToggle,
  onUpload,
  onOpenAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
}: {
  attachments: TaskAttachment[]
  dragDisabled: boolean
  readOnly: boolean
  index: number
  item: Subtask
  justMoved: boolean
  focused: boolean
  onDelete: () => void
  onEdit: () => void
  onToggle: () => void
  onUpload: (file: File) => void
  onOpenAttachment: (attachment: TaskAttachment) => void
  onDownloadAttachment: (attachment: TaskAttachment) => void
  onDeleteAttachment: (attachment: TaskAttachment) => void
}) {
  const { i18n, t } = useTranslation()
  const sortable = useTaskHubSortable({ id: item.id, index })
  const dueDate = formatDate(item.dueDate, i18n.language)

  return (
    <motion.li
      id={`subtask-${item.id}`}
      ref={sortable.ref}
      initial={taskHubFadeMotion.initial}
      animate={taskHubFadeMotion.animate}
      exit={taskHubFadeMotion.exit}
      transition={taskHubFadeMotion.transition}
      className="relative"
    >
      <SortableDropIndicator position={sortable.dropPosition} insetClassName="inset-x-3" />

      <div
        className={cn(
          'group bg-card hover:border-primary/20 rounded-xl border shadow-sm transition-[transform,border-color,background-color,box-shadow] duration-180 ease-out hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none',
          item.isCompleted && 'bg-muted/30',
          sortable.isDragging && 'border-primary/35 ring-primary/15 scale-[1.01] shadow-xl ring-1',
          sortable.isDropTarget &&
            !sortable.isDragging &&
            'border-primary/50 bg-primary/[0.035] ring-primary/15 ring-1',
          justMoved && !sortable.isDragging && 'bg-primary/[0.07] ring-primary/20 ring-1',
          focused &&
            !sortable.isDragging &&
            'border-primary/40 bg-primary/[0.06] ring-primary/20 ring-2',
        )}
      >
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <SortableDragHandle
            handleRef={sortable.handleRef}
            label={t('common.dragToReorder', { name: item.title })}
            disabled={dragDisabled}
            className="self-start sm:self-center"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={readOnly}
                onClick={onToggle}
                aria-label={t('tasks.details.toggleSubtask')}
                className="text-muted-foreground hover:bg-success/10 hover:text-success focus-visible:ring-ring grid size-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {item.isCompleted ? (
                  <Check className="text-success size-5 rounded-full border p-0.5" />
                ) : (
                  <Circle className="size-5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('tasks.details.toggleSubtask')}</TooltipContent>
          </Tooltip>

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'font-medium',
                item.isCompleted && 'text-muted-foreground line-through',
              )}
            >
              {item.title}
            </p>
            <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-3 text-xs">
              {dueDate ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" />
                  {dueDate}
                </span>
              ) : null}
              {attachments.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="size-3.5" />
                  {t('tasks.details.attachmentCount', { count: attachments.length })}
                </span>
              ) : null}
            </div>
          </div>

          {!readOnly ? (
            <div className="flex items-center gap-1 self-end opacity-75 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:self-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <label
                    role="button"
                    tabIndex={0}
                    aria-label={t('tasks.details.attachToSubtask')}
                    className="text-info hover:bg-info/10 focus-visible:ring-ring grid size-9 cursor-pointer place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.currentTarget.querySelector('input')?.click()
                      }
                    }}
                  >
                    <Paperclip className="size-4" />
                    <span className="sr-only">{t('tasks.details.attachToSubtask')}</span>
                    <input
                      className="hidden"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) onUpload(file)
                        event.target.value = ''
                      }}
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent>{t('tasks.details.attachToSubtask')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-primary hover:bg-primary/10 hover:text-primary size-9"
                    onClick={onEdit}
                    aria-label={t('tasks.details.editSubtask')}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('tasks.details.editSubtask')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive size-9"
                    onClick={onDelete}
                    aria-label={t('tasks.details.deleteSubtask')}
                  >
                    <span className="text-base leading-none">×</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('tasks.details.deleteSubtask')}</TooltipContent>
              </Tooltip>
            </div>
          ) : null}
        </div>

        {attachments.length > 0 ? (
          <div className="border-border/80 bg-muted/25 border-t px-4 py-3 sm:ps-[6.75rem]">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <Paperclip className="text-muted-foreground size-3.5" />
              <span>{t('tasks.details.subtaskFiles')}</span>
            </div>
            <TaskAttachmentList
              compact
              attachments={attachments}
              readOnly={readOnly}
              onOpen={onOpenAttachment}
              onDownload={onDownloadAttachment}
              onDelete={onDeleteAttachment}
            />
          </div>
        ) : null}
      </div>
    </motion.li>
  )
}

export function TaskDetailsDrawer({ taskId, focusSubtaskId = null, onOpenChange }: Props) {
  const { t, i18n } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const [subtaskEditorOpen, setSubtaskEditorOpen] = useState(false)
  const [subtaskEditorSession, setSubtaskEditorSession] = useState(0)
  const [editingSubtask, setEditingSubtask] = useState<Subtask | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<TaskAttachment | null>(null)
  const [orderedSubtasks, setOrderedSubtasks] = useState<Subtask[]>([])
  const [recentlyMovedSubtaskId, setRecentlyMovedSubtaskId] = useState<number | null>(null)
  const subtaskDraggingRef = useRef(false)
  const taskFileRef = useRef<HTMLInputElement>(null)
  const query = useTaskDetails(taskId)
  const completeMutation = useCompleteSubtask()
  const deleteMutation = useDeleteSubtask()
  const reorderMutation = useReorderSubtasks()
  const uploadMutation = useUploadAttachment()
  const deleteAttachmentMutation = useDeleteAttachment()
  const taskCycleId = query.data?.task.cycleId ?? null
  const cycleQuery = useWorkCycle(taskCycleId)
  const taskInstanceId = query.data?.task.kpiInstanceId ?? null
  const taskInstance =
    taskInstanceId === null
      ? null
      : (cycleQuery.data?.instances.find((item) => item.id === taskInstanceId) ?? null)
  const subtaskDueDateRequired = taskInstance?.taskPolicy.subtaskDueDateMode === 'REQUIRED'

  useEffect(() => {
    if (!query.data || focusSubtaskId === null) return

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`subtask-${focusSubtaskId}`)?.scrollIntoView({
        behavior: 'auto',
        block: 'center',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusSubtaskId, query.data])

  const readOnly = query.data?.task.isReadOnly ?? false
  const serverSubtasks = query.data?.subtasks ?? []
  const displayedSubtasks = sameSubtaskSet(orderedSubtasks, serverSubtasks)
    ? orderedSubtasks
    : serverSubtasks
  const drawerState = query.isPending ? 'loading' : query.isError ? 'error' : 'content'

  const taskAttachments = useMemo(
    () => query.data?.attachments.filter((attachment) => attachment.subtaskId === null) ?? [],
    [query.data?.attachments],
  )
  const subtaskAttachments = useMemo(() => {
    const grouped = new Map<number, TaskAttachment[]>()
    for (const attachment of query.data?.attachments ?? []) {
      if (attachment.subtaskId === null) continue
      const current = grouped.get(attachment.subtaskId) ?? []
      current.push(attachment)
      grouped.set(attachment.subtaskId, current)
    }
    return grouped
  }, [query.data?.attachments])

  useEffect(() => {
    if (query.data && !subtaskDraggingRef.current) {
      setOrderedSubtasks(query.data.subtasks)
    }
  }, [query.data])

  useEffect(() => {
    if (recentlyMovedSubtaskId === null) return
    const timeout = window.setTimeout(() => setRecentlyMovedSubtaskId(null), 650)
    return () => window.clearTimeout(timeout)
  }, [recentlyMovedSubtaskId])

  function toggle(item: Subtask) {
    if (readOnly) return
    completeMutation.mutate(
      { subtaskId: item.id, isCompleted: !item.isCompleted },
      { onError: () => toast.error(t('tasks.details.errors.subtask')) },
    )
  }

  function upload(file: File, subtaskId?: number) {
    if (readOnly || !taskId) return
    uploadMutation.mutate(
      { ...(subtaskId ? { subtaskId } : { taskId }), file },
      {
        onSuccess: () => toast.success(t('tasks.details.attachmentAdded')),
        onError: () => toast.error(t('tasks.details.errors.attachment')),
      },
    )
  }

  async function download(item: TaskAttachment) {
    try {
      await downloadAttachment(item)
    } catch {
      toast.error(t('tasks.details.errors.download'))
    }
  }

  function removeAttachment(item: TaskAttachment) {
    if (readOnly) return
    deleteAttachmentMutation.mutate(item.id, {
      onSuccess: () => toast.success(t('tasks.details.attachmentRemoved')),
      onError: () => toast.error(t('tasks.details.errors.attachment')),
    })
  }

  return (
    <Dialog open={taskId !== null} onOpenChange={onOpenChange}>
      <DialogContent variant="page" closeLabel={t('common.close')}>
        <AnimatedState stateKey={drawerState}>
          {query.isPending ? (
            <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 lg:px-10">
              <LoadingState />
            </div>
          ) : query.isError ? (
            <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 lg:px-10">
              <ErrorState onRetry={() => void query.refetch()} />
            </div>
          ) : (
            query.data && (
              <div className="mx-auto min-h-full w-full max-w-7xl px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-8">
                <header className="bg-background/90 border-border/80 sticky top-0 z-10 mb-5 rounded-2xl border p-5 shadow-sm backdrop-blur-md sm:p-6">
                  <div className="pe-10">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 font-semibold',
                          query.data.task.status === 'DONE'
                            ? 'bg-success/10 text-success'
                            : query.data.task.status === 'CANCELLED'
                              ? 'bg-muted text-muted-foreground'
                              : query.data.task.isOverdue
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-primary/10 text-primary',
                        )}
                      >
                        {t(`tasks.statuses.${query.data.task.status}`)}
                      </span>
                      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium">
                        <Flag className="size-3.5" />
                        {t(`tasks.priorities.${query.data.task.priority}`)}
                      </span>
                      {query.data.task.kpiName ? (
                        <span className="bg-primary/8 text-primary inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 font-medium">
                          <Gauge className="size-3.5 shrink-0" />
                          <span className="truncate">{query.data.task.kpiName}</span>
                        </span>
                      ) : null}
                    </div>

                    <DialogTitle className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                      {query.data.task.title}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground mt-2 max-w-4xl text-sm leading-6">
                      {query.data.task.description || t('tasks.details.noDescription')}
                    </DialogDescription>
                  </div>
                </header>

                {readOnly ? (
                  <div className="border-warning/30 bg-warning/10 text-warning-foreground mb-5 rounded-xl border p-4 text-sm">
                    {t('workCycles.readOnlyDescription')}
                  </div>
                ) : null}

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.75fr)]">
                  <main className="min-w-0 space-y-5">
                    <Card>
                      <CardHeader className="flex-row items-center justify-between gap-4 pb-3">
                        <div>
                          <CardTitle>{t('tasks.details.subtasks')}</CardTitle>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {t('tasks.details.subtaskCount', { count: query.data.subtasks.length })}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          disabled={readOnly}
                          onClick={() => {
                            setEditingSubtask(null)
                            setSubtaskEditorSession((current) => current + 1)
                            setSubtaskEditorOpen(true)
                          }}
                        >
                          <Plus className="size-4" />
                          {t('tasks.details.add')}
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-muted/45 mb-4 rounded-xl border p-4">
                          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium">{t('tasks.details.progress')}</span>
                            <span className="font-bold tabular-nums">
                              {query.data.progress.completed}/{query.data.progress.total} ·{' '}
                              {query.data.progress.percentage}%
                            </span>
                          </div>
                          <div className="bg-muted h-2 overflow-hidden rounded-full">
                            <div
                              className="bg-primary h-full rounded-full transition-[width] duration-300"
                              style={{ width: `${query.data.progress.percentage}%` }}
                            />
                          </div>
                        </div>

                        <TooltipProvider>
                          <TaskHubDragDropProvider
                            onDragStart={() => {
                              subtaskDraggingRef.current = true
                            }}
                            onDragEnd={(event) => {
                              subtaskDraggingRef.current = false

                              if (readOnly || event.canceled) {
                                setOrderedSubtasks(serverSubtasks)
                                return
                              }

                              const next = moveSortable(displayedSubtasks, event)
                              if (sameSubtaskOrder(next, displayedSubtasks)) return

                              const movedId = Number(event.operation.source?.id)
                              if (Number.isSafeInteger(movedId)) setRecentlyMovedSubtaskId(movedId)

                              setOrderedSubtasks(next)
                              reorderMutation.mutate(
                                {
                                  taskId: query.data.task.id,
                                  subtaskIds: next.map((item) => item.id),
                                },
                                {
                                  onError: () => {
                                    setOrderedSubtasks(serverSubtasks)
                                    toast.error(t('tasks.details.errors.reorder'))
                                  },
                                },
                              )
                            }}
                          >
                            <ul className="space-y-3" aria-busy={reorderMutation.isPending}>
                              <AnimatePresence initial={false}>
                                {displayedSubtasks.length === 0 ? (
                                  <motion.li
                                    key="no-subtasks"
                                    initial={taskHubFadeMotion.initial}
                                    animate={taskHubFadeMotion.animate}
                                    exit={taskHubFadeMotion.exit}
                                    transition={taskHubFadeMotion.transition}
                                    className="text-muted-foreground bg-muted/20 rounded-xl border border-dashed p-8 text-center text-sm"
                                  >
                                    {t('tasks.details.noSubtasks')}
                                  </motion.li>
                                ) : null}

                                {displayedSubtasks.map((item, index) => (
                                  <SortableSubtaskRow
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    attachments={subtaskAttachments.get(item.id) ?? []}
                                    dragDisabled={readOnly || reorderMutation.isPending}
                                    readOnly={readOnly}
                                    justMoved={recentlyMovedSubtaskId === item.id}
                                    focused={focusSubtaskId === item.id}
                                    onToggle={() => toggle(item)}
                                    onUpload={(file) => upload(file, item.id)}
                                    onOpenAttachment={setPreviewAttachment}
                                    onDownloadAttachment={(attachment) => void download(attachment)}
                                    onDeleteAttachment={removeAttachment}
                                    onEdit={() => {
                                      setEditingSubtask(item)
                                      setSubtaskEditorSession((current) => current + 1)
                                      setSubtaskEditorOpen(true)
                                    }}
                                    onDelete={() =>
                                      deleteMutation.mutate(item.id, {
                                        onError: () =>
                                          toast.error(t('tasks.details.errors.subtask')),
                                      })
                                    }
                                  />
                                ))}
                              </AnimatePresence>
                            </ul>
                          </TaskHubDragDropProvider>
                        </TooltipProvider>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex-row items-center justify-between gap-4 pb-3">
                        <div>
                          <CardTitle>{t('tasks.details.taskFiles')}</CardTitle>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {t('tasks.details.taskFilesDescription')}
                          </p>
                        </div>
                        <>
                          <input
                            ref={taskFileRef}
                            className="hidden"
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file) upload(file)
                              event.target.value = ''
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={readOnly}
                            onClick={() => taskFileRef.current?.click()}
                          >
                            <Paperclip className="size-4" />
                            {t('tasks.details.addFile')}
                          </Button>
                        </>
                      </CardHeader>
                      <CardContent>
                        <TaskAttachmentList
                          attachments={taskAttachments}
                          emptyLabel={t('tasks.details.noTaskFiles')}
                          readOnly={readOnly}
                          onOpen={setPreviewAttachment}
                          onDownload={(attachment) => void download(attachment)}
                          onDelete={removeAttachment}
                        />
                      </CardContent>
                    </Card>
                  </main>

                  <aside className="min-w-0 space-y-5 xl:sticky xl:top-32 xl:self-start">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle>{t('tasks.details.taskInformation')}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <InfoRow
                          icon={Flag}
                          label={t('tasks.priority')}
                          value={
                            <TaskPriorityIndicator priority={query.data.task.priority} pill />
                          }
                        />
                        <InfoRow
                          icon={Circle}
                          label={t('tasks.sortFields.status')}
                          value={<TaskStatusIndicator status={query.data.task.status} pill />}
                        />
                        <InfoRow
                          icon={CalendarDays}
                          label={t('tasks.startDate')}
                          value={
                            formatDate(query.data.task.startDate, i18n.language) ??
                            t('tasks.details.notSet')
                          }
                        />
                        <InfoRow
                          icon={Clock3}
                          label={t('tasks.dueDate')}
                          value={
                            <TaskDueIndicator
                              due={
                                query.data.task.dueDate === null
                                  ? 'NO_DATE'
                                  : query.data.task.status === 'CANCELLED'
                                    ? 'ALL'
                                    : query.data.task.isOverdue
                                      ? 'OVERDUE'
                                      : query.data.task.dueDate ===
                                          getCurrentDateOnlyInAppTimeZone()
                                        ? 'TODAY'
                                        : 'UPCOMING'
                              }
                              label={
                                formatDate(query.data.task.dueDate, i18n.language) ??
                                t('tasks.details.notSet')
                              }
                              pill
                            />
                          }
                        />
                        {query.data.task.cycleTitle ? (
                          <InfoRow
                            icon={Briefcase}
                            label={t('workCycles.title')}
                            value={query.data.task.cycleTitle}
                          />
                        ) : null}
                        {query.data.task.kpiName ? (
                          <InfoRow
                            icon={Gauge}
                            label={t('tasks.kpi')}
                            value={query.data.task.kpiName}
                          />
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3">
                          <CardTitle>{t('tasks.details.activity')}</CardTitle>
                          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                            {query.data.activity.length}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {query.data.activity.length ? (
                          <ol className="max-h-[28rem] space-y-0 overflow-y-auto pe-1">
                            <AnimatePresence initial={false}>
                              {query.data.activity.map((item) => (
                                <motion.li
                                  key={item.id}
                                  initial={taskHubFadeMotion.initial}
                                  animate={taskHubFadeMotion.animate}
                                  exit={taskHubFadeMotion.exit}
                                  transition={taskHubFadeMotion.transition}
                                  className="border-border relative border-s py-3 ps-5 text-sm last:pb-0"
                                >
                                  <span className="bg-primary ring-background absolute -start-[4.5px] top-[1.15rem] size-2 rounded-full ring-4" />
                                  <p className="font-medium">
                                    {t(`tasks.details.activities.${item.activityType}`, {
                                      defaultValue: item.activityType,
                                    })}
                                  </p>
                                  <time className="text-muted-foreground mt-1 block text-xs">
                                    {formatDateTime(item.createdAtUtc, i18n.language, timeFormat)}
                                  </time>
                                </motion.li>
                              ))}
                            </AnimatePresence>
                          </ol>
                        ) : (
                          <p className="text-muted-foreground py-4 text-center text-sm">
                            {t('tasks.details.noActivity')}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </aside>
                </div>
              </div>
            )
          )}
        </AnimatedState>
      </DialogContent>

      <AttachmentPreviewDialog
        key={previewAttachment?.id ?? 'closed'}
        attachment={previewAttachment}
        onOpenChange={(open) => !open && setPreviewAttachment(null)}
      />

      {taskId && !readOnly ? (
        <SubtaskEditorDialog
          key={subtaskEditorSession}
          open={subtaskEditorOpen}
          onOpenChange={setSubtaskEditorOpen}
          taskId={taskId}
          subtask={editingSubtask}
          dueDateRequired={subtaskDueDateRequired}
        />
      ) : null}
    </Dialog>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Flag
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-[11px] font-medium">{label}</p>
        <div className="mt-0.5 text-sm font-medium break-words">{value}</div>
      </div>
    </div>
  )
}

