import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  Share2,
  UserRound,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

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
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toApiClientError } from '@/lib/api-error'
import { useWorkCycle } from '@/features/work-cycles/hooks/use-work-cycles'
import { parseDateOnly } from '@/lib/date-only'
import { APP_TIME_ZONE } from '@/lib/date-time'
import { cn } from '@/lib/cn'

import { downloadAttachment } from '../api/tasks.api'
import { TaskAssigneePicker } from '../assignment/TaskAssigneePicker'
import { TaskGroupSelect } from '../assignment/TaskGroupSelect'
import { useTaskGroups,useTaskGroupActions } from '../assignment/use-task-groups'
import { CollaborativeAssignmentsPanel } from '../assignment/CollaborativeAssignmentsPanel'
import { useAssignMainTask, useAssignSubtask, useSaveWorkNotes, useSaveCompletionSummary, useEligibleTaskUser } from '../assignment/use-general-assignment'
import {
  useCompleteSubtask,
  useDeleteAttachment,
  useDeleteSubtask,
  useReorderSubtasks,
  useTaskDetails,
  useChangeTaskStatus,
  useUploadAttachment,
} from '../hooks/use-tasks'
import { TASK_STATUSES } from '../types/task.types'
import type { Subtask, TaskAttachment, TaskStatus, TaskCompletionSummaryEntry } from '../types/task.types'
import { AttachmentPreviewDialog } from './AttachmentPreviewDialog'
import { SubtaskEditorDialog } from './SubtaskEditorDialog'
import { TaskAttachmentList } from './TaskAttachmentList'
import { TaskDueIndicator, TaskPriorityIndicator } from './TaskSelectIndicators'
import { TaskStatusIndicator } from './TaskStatusIndicator'
import { taskStatusErrorKey, taskStatusToastId } from '../status/task-status-error'
import { TaskTags } from '../tags/TaskTags'
import { TagPicker } from '../tags/TagPicker'
import { setTaskTags } from '../tags/tags.api'
import { TaskTeamIndicator } from './TaskTeamIndicator'
import { TaskActivityTimeline } from './TaskActivityTimeline'
import { ShareTaskDialog } from '@/features/task-shares/ShareTaskDialog'
import { TaskDiscussions } from '../discussions/TaskDiscussions'
import { discussionApi } from '../discussions/discussions.api'
import { DiscussionShortcut } from '../discussions/DiscussionShortcut'

// Match the existing server-side tasks.policy transition graph. Backend is authoritative.
const permittedTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'DONE', 'CANCELLED'],
  DONE: ['TODO'],
  CANCELLED: ['TODO'],
}

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

/** Completion Summary uses the same append-only authorship rule as subtask Work Notes.
 * Legacy text stays visible but cannot be attributed safely after reassignment. */
function CompletionSummaryHistory({ legacy, entries, canAdd, pending, onAdd }: {
  legacy: string | null
  entries: TaskCompletionSummaryEntry[]
  canAdd: boolean
  pending: boolean
  onAdd: (text: string, onSuccess: () => void) => void
}) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState('')
  if (!legacy && !entries.length && !canAdd) return null
  return <div className="space-y-3">
    {legacy ? <div className="bg-muted/40 rounded-lg border p-3">
      <p className="text-muted-foreground mb-1 text-xs">{t('tasks.assignment.legacySummary')}</p>
      <p className="whitespace-pre-wrap break-words text-sm">{legacy}</p>
    </div> : null}
    {entries.map(entry => <div key={entry.id} className="rounded-lg border p-3">
      <div className="text-muted-foreground mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-foreground font-semibold">{entry.authorName}</span>
        <time dateTime={entry.createdAtUtc}>{new Date(entry.createdAtUtc).toLocaleString(i18n.language)}</time>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{entry.content}</p>
    </div>)}
    {canAdd ? <div className="space-y-2">
      <Textarea rows={3} value={draft} maxLength={10000} disabled={pending}
        placeholder={t('tasks.assignment.newSummaryPlaceholder')}
        aria-label={t('tasks.assignment.newSummaryPlaceholder')}
        onChange={event => setDraft(event.target.value)} />
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={pending || !draft.trim()}
          onClick={() => {
            const content = draft.trim()
            if (!content) return
            onAdd(content, () => setDraft(''))
          }}>{t('tasks.assignment.addSummary')}</Button>
      </div>
      <p className="text-muted-foreground text-xs">{t('tasks.assignment.summaryImmutableHint')}</p>
    </div> : null}
  </div>
}

/** Work Notes are immutable individual entries. Historical shared text is archived
 * without an author label because reassignment can invalidate attribution. */
function SubtaskWorkNotes({ item, canAdd, pending, onAdd }: {
  item: Subtask
  canAdd: boolean
  pending: boolean
  onAdd: (value: string, onSuccess: () => void) => void
}) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState('')
  const entries = item.workNoteEntries ?? []
  if (!item.workNotes && !entries.length && !canAdd) return null
  return <div className="border-border/80 space-y-3 border-t px-4 py-3">
    <p className="text-muted-foreground text-xs font-semibold">{t('tasks.assignment.workNotes')}</p>
    {item.workNotes ? <div className="bg-muted/40 rounded-lg border p-3">
      <p className="text-muted-foreground mb-1 text-xs">{t('tasks.assignment.legacyNote')}</p>
      <p className="whitespace-pre-wrap break-words text-sm">{item.workNotes}</p>
    </div> : null}
    {entries.map(entry => <div key={entry.id} className="rounded-lg border p-3">
      <div className="text-muted-foreground mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-foreground font-semibold">{entry.authorName}</span>
        <time dateTime={entry.createdAtUtc}>{new Date(entry.createdAtUtc).toLocaleString(i18n.language)}</time>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{entry.content}</p>
    </div>)}
    {canAdd ? <div className="space-y-2">
      <Textarea rows={2} value={draft} maxLength={4000} disabled={pending}
        placeholder={t('tasks.assignment.newNotePlaceholder')}
        aria-label={t('tasks.assignment.newNotePlaceholder')}
        onChange={event => setDraft(event.target.value)} />
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={pending || !draft.trim()}
          onClick={() => {
            const text = draft.trim()
            if (!text) return
            onAdd(text, () => setDraft(''))
          }}>{t('tasks.assignment.addNote')}</Button>
      </div>
      <p className="text-muted-foreground text-xs">{t('tasks.assignment.noteImmutableHint')}</p>
    </div> : null}
  </div>
}

function SortableSubtaskRow({
  attachments,
  dragDisabled,
  canComplete,
  canEditNotes,
  canManage,
  canEditMetadata,
  canAssign,
  meetingId,
  excludedAssigneeIds,
  assigneePending,
  notesPending,
  onAssign,
  onSaveNotes,
  canUpload,
  canDeleteAttachment,
  index,
  item,
  justMoved,
  focused,
  onDelete,
  onEdit,
  onDiscussion,
  discussionAvailable,
  discussionUnread,
  onToggle,
  onUpload,
  onOpenAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
}: {
  attachments: TaskAttachment[]
  dragDisabled: boolean
  canComplete: boolean
  canEditNotes: boolean
  canManage: boolean
  canEditMetadata: boolean
  canAssign: boolean
  meetingId: number | null
  excludedAssigneeIds: number[]
  assigneePending: boolean
  notesPending: boolean
  onAssign: (userId: number | null) => void
  onSaveNotes: (value: string, onSuccess: () => void) => void
  canUpload: boolean
  canDeleteAttachment: (attachment: TaskAttachment) => boolean
  index: number
  item: Subtask
  justMoved: boolean
  focused: boolean
  onDelete: () => void
  onEdit: () => void
  onDiscussion: () => void
  discussionAvailable: boolean
  discussionUnread: number
  onToggle: () => void
  onUpload: (file: File) => void
  onOpenAttachment: (attachment: TaskAttachment) => void
  onDownloadAttachment: (attachment: TaskAttachment) => void
  onDeleteAttachment: (attachment: TaskAttachment) => void
}) {
  const { i18n, t } = useTranslation()
  const sortable = useTaskHubSortable({ id: item.id, index, disabled: dragDisabled })
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
                disabled={!canComplete}
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
              <TaskPriorityIndicator priority={item.priority} />
              {attachments.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="size-3.5" />
                  {t('tasks.details.attachmentCount', { count: attachments.length })}
                </span>
              ) : null}
            </div>
            {item.description && <p className="text-muted-foreground mt-2 whitespace-pre-wrap break-words text-sm">{item.description}</p>}
          </div>

          <DiscussionShortcut available={discussionAvailable}
            unread={discussionUnread} onOpen={onDiscussion} />
          {canEditMetadata || canManage || canUpload ? (
            <div className="flex items-center gap-1 self-end opacity-75 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:self-center">
              {canUpload ? <Tooltip>
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
              </Tooltip> : null}

              {canEditMetadata ? <Tooltip>
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
              </Tooltip> : null}

              {canManage ? <Tooltip>
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
              </Tooltip> : null}
            </div>
          ) : null}
        </div>

        {canAssign ? <div className="border-border/80 bg-muted/25 border-t px-4 py-3 space-y-1.5">
          <label className="text-muted-foreground text-xs font-semibold">{t('tasks.assignment.assignSubtask')}</label>
          <TaskAssigneePicker value={item.assigneeUserId ?? null} onChange={onAssign}
            inherit disabled={assigneePending} meetingId={meetingId}
            excludedUserIds={excludedAssigneeIds} />
        </div> : null}
        <SubtaskWorkNotes key={item.id} item={item} canAdd={canEditNotes}
          pending={notesPending} onAdd={onSaveNotes} />
        {attachments.length > 0 ? (
          <div className="border-border/80 bg-muted/25 border-t px-4 py-3 sm:ps-[6.75rem]">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <Paperclip className="text-muted-foreground size-3.5" />
              <span>{t('tasks.details.subtaskFiles')}</span>
            </div>
            <TaskAttachmentList
              compact
              attachments={attachments}
              readOnly={false}
              canDelete={canDeleteAttachment}
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
  const [shareOpen,setShareOpen]=useState(false)
  const [legacyTab,setLegacyTab]=useState<'overview'|'discussion'>('overview')
  const [discussionSubtaskId,setDiscussionSubtaskId]=useState<number|null>(null)
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const tagQueryClient=useQueryClient()
  const [tagEditorOpen,setTagEditorOpen]=useState(false)
  const [tagDraft,setTagDraft]=useState<number[]>([])
  const [savingTags,setSavingTags]=useState(false)
  const currentUser = useCurrentUser()
  const actorId = currentUser.data?.user.userId ?? null
  const assignMain = useAssignMainTask()
  const assignChild = useAssignSubtask()
  const saveNotes = useSaveWorkNotes()
  const saveSummary = useSaveCompletionSummary()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [subtaskEditorOpen, setSubtaskEditorOpen] = useState(false)
  const [subtaskEditorSession, setSubtaskEditorSession] = useState(0)
  const [editingSubtask, setEditingSubtask] = useState<Subtask | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<TaskAttachment | null>(null)
  const [orderedSubtasks, setOrderedSubtasks] = useState<Subtask[]>([])
  const [recentlyMovedSubtaskId, setRecentlyMovedSubtaskId] = useState<number | null>(null)
  const subtaskDraggingRef = useRef(false)
  const taskFileRef = useRef<HTMLInputElement>(null)
  const query = useTaskDetails(taskId)
  const discussionCounts=useQuery({queryKey:['discussions',taskId,'scopes'],
    queryFn:()=>discussionApi.scopes(taskId!),
    enabled:taskId!==null && query.data?.task.kpiInstanceId===null,
    refetchInterval:30000})
  const unreadDiscussions=discussionCounts.data?.reduce((total,scope)=>total+scope.unread,0)??0
  useEffect(()=>{
    setDiscussionSubtaskId(null)
    if(taskId!==null) setLegacyTab(new URLSearchParams(window.location.search).get('discussion')==='1'?'discussion':'overview')
  },[taskId])
  const groupQuery=useTaskGroups(query.data?.capabilities.role==='OWNER' &&
    query.data.task.kpiInstanceId===null && query.data.task.meetingActionItem===null
      ? query.data.task.listId : null)
  const groupActions=useTaskGroupActions()
  const [groupDraft,setGroupDraft]=useState<{taskId:number;groupId:number|null}|null>(null)
  const completeMutation = useCompleteSubtask()
  const statusMutation = useChangeTaskStatus()
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

  const capabilities = query.data?.capabilities
  const collaborationActive = Boolean(query.data?.collaborationActive)
  const isMeetingViewer = capabilities?.role === 'VIEWER' && !capabilities.canEditDetails
  // isReadOnly on shared task projections protects metadata edits; use specific
  // server capabilities for executor operations instead of disabling all controls.
  const readOnly = isMeetingViewer || Boolean(query.data?.task.kpiInstanceId && query.data.task.isReadOnly)
  const isGeneralTask = Boolean(query.data && !query.data.actionItem && query.data.task.kpiInstanceId === null)
  const supportsSubtaskAssignment = !collaborationActive && Boolean(query.data && (isGeneralTask || query.data.actionItem))
  const isOwner = capabilities?.role === 'OWNER'
  const mainAssigneeId = query.data?.generalAssignment?.assigneeUserId ?? null
  const ownerId = query.data?.generalAssignment?.ownerUserId ?? query.data?.actionItem?.organizerUserId ?? actorId
  const effectiveMainAssignee = query.data?.actionItem?.assigneeUserId ?? mainAssigneeId ?? ownerId
  const mainAssigneeLookup = useEligibleTaskUser(mainAssigneeId)
  const canEditSummary = !collaborationActive && !readOnly && Boolean(
    query.data?.actionItem ? actorId === query.data.actionItem.assigneeUserId :
      query.data?.generalAssignment ? actorId === effectiveMainAssignee : capabilities?.role === 'OWNER'
  )
  const canManageSubtasks = !readOnly && (capabilities?.canManageSubtasks ?? true)
  const canCreateSubtasks = canManageSubtasks && !query.data?.sharedPermission
  const canCompleteSubtasks = !collaborationActive && !readOnly && (capabilities?.canCompleteSubtasks ?? true)
  const canUploadAttachments = (!collaborationActive || isOwner || query.data?.sharedPermission==='EDIT') && !readOnly && (capabilities?.canUploadAttachments ?? true)
  const canDeleteAttachment = (item: TaskAttachment) => {
    if (collaborationActive && !isOwner) return false
    if (readOnly || !capabilities) return !readOnly
    if (capabilities.canDeleteAnyAttachment) return true
    return capabilities.role === 'ASSIGNEE' && item.uploadedByUserId === actorId
  }
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
    if (!canCompleteSubtasks) return
    completeMutation.mutate(
      { subtaskId: item.id, isCompleted: !item.isCompleted },
      { onError: () => toast.error(t('tasks.details.errors.subtask')) },
    )
  }

  function changeDrawerStatus(next: TaskStatus) {
    if (!taskId || !query.data || next === query.data.task.status) return
    if (next === 'CANCELLED') { setCancelOpen(true); return }
    if (next === 'DONE' && query.data.progress.total > query.data.progress.completed) {
      toast.error(t('tasks.assignment.incompleteToast', {
        count: query.data.progress.total - query.data.progress.completed,
        total: query.data.progress.total,
      }))
      return
    }
    statusMutation.mutate({taskId, status:next}, {
      onSuccess: () => toast.success(t('tasks.statusUpdated')),
      onError: error => toast.error(t(taskStatusErrorKey(error)), { id: taskStatusToastId(taskId) }),
    })
  }

  function upload(file: File, subtaskId?: number) {
    if (!canUploadAttachments || !taskId) return
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
    if (!canDeleteAttachment(item)) return
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
            <div className="mx-auto w-[94vw] max-w-[90rem] px-5 py-12 sm:px-8 lg:px-10">
              <LoadingState />
            </div>
          ) : query.isError ? (
            <div className="mx-auto w-[94vw] max-w-[90rem] px-5 py-12 sm:px-8 lg:px-10">
              <ErrorState onRetry={() => void query.refetch()} />
            </div>
          ) : (
            query.data && (
              <div className="mx-auto min-h-full w-[94vw] max-w-[90rem] px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-8">
                <header className={cn('bg-background/90 border-border/80 sticky top-0 z-10 mb-5 rounded-2xl border shadow-sm backdrop-blur-md', collaborationActive ? 'p-4 sm:p-5' : 'p-5 sm:p-6')}>
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
                      {collaborationActive && query.data.task.dueDate ? (
                        <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium">
                          <CalendarDays className="size-3.5" />
                          {formatDate(query.data.task.dueDate, i18n.language)}
                        </span>
                      ) : null}
                      {query.data.task.kpiName ? (
                        <span className="bg-primary/8 text-primary inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 font-medium">
                          <Gauge className="size-3.5 shrink-0" />
                          <span className="truncate">{query.data.task.kpiName}</span>
                        </span>
                      ) : null}
                    </div>

                    <DialogTitle className={cn('mt-3 font-bold tracking-tight', collaborationActive ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl')}>
                      {query.data.task.title}
                    </DialogTitle>
                    <DialogDescription className={cn('text-muted-foreground mt-2 max-w-4xl text-sm leading-6', collaborationActive && 'sr-only')}>
                      {collaborationActive ? t('tasks.workspace.description') : query.data.task.description || t('tasks.details.noDescription')}
                    </DialogDescription>
                    {query.data.task.kpiInstanceId === null ? <div className="mt-3 flex flex-wrap items-center gap-3">
                      <TaskTags tags={query.data.task.tags ?? []}/>
                      {query.data.actionItem && isOwner && capabilities?.canEditDetails && !readOnly && query.data.task.listId !== null ? (
                        <Button type="button" size="sm" variant="outline"
                          onClick={() => {
                            const meetingId = query.data?.actionItem?.meetingId
                            if (!meetingId || !query.data) return
                            onOpenChange(false)
                            navigate(`/meetings/${meetingId}?tab=follow-up&editTask=${query.data.task.id}`)
                          }}>
                          <Pencil className="size-4" />{t('tasks.editTitle')}
                        </Button>
                      ) : null}
                      {capabilities?.role==='OWNER'?<Button type="button" size="sm" variant="outline" onClick={()=>setShareOpen(true)}>
                        <Share2 className="size-4"/>{t('taskSharing.share')}
                      </Button>:null}
                      {capabilities?.canEditDetails ? <Button variant="outline" size="sm" type="button"
                        onClick={()=>{setTagDraft(query.data?.task.tags?.map(x=>x.id)??[]);setTagEditorOpen(true)}}>{t('tags.editTaskTags')}</Button>:null}
                    </div>:null}
                    {query.data.task.kpiInstanceId === null && (query.data.task.teamRoster?.length || query.data.task.teamTask) ? (
                      <TaskTeamIndicator summary={query.data.task} compact className="mt-3" />
                    ) : null}
                  </div>
                </header>

                {isMeetingViewer ? (
                  <div className="border-primary/20 bg-primary/5 mb-5 rounded-xl border p-4 text-sm">
                    <p className="font-semibold">{t('tasks.actionItem.readOnly')}</p>
                    <p className="text-muted-foreground mt-1 leading-6">
                      {t('tasks.actionItem.viewerDescription', {
                        name: query.data.actionItem?.assigneeName ?? '',
                      })}
                    </p>
                  </div>
                ) : readOnly ? (
                  <div className="border-warning/30 bg-warning/10 text-warning-foreground mb-5 rounded-xl border p-4 text-sm">
                    {t('workCycles.readOnlyDescription')}
                  </div>
                ) : null}

                {query.data.actionItem ? (
                  <div className={cn('border-primary/20 bg-primary/5 mb-5 rounded-xl border text-sm', collaborationActive ? 'px-4 py-3' : 'p-4')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{t('tasks.actionItem.badge')}</p>
                        <button
                          type="button"
                          className="text-primary mt-1 inline-flex items-center gap-1.5 rounded-md font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          onClick={() => {
                            onOpenChange(false)
                            navigate(`/meetings/${query.data.actionItem!.meetingId}`)
                          }}
                        >
                          <CalendarDays className="size-4 shrink-0" />
                          <span>{query.data.actionItem.meetingTitle}</span>
                        </button>
                        {!collaborationActive && <p className="text-muted-foreground mt-1">
                          {capabilities?.role === 'ASSIGNEE'
                            ? t('tasks.actionItem.assignedBy', { name: query.data.actionItem.organizerName })
                            : t('tasks.actionItem.assignedTo', { name: query.data.actionItem.assigneeName })}
                        </p>}
                      </div>

                    </div>
                  </div>
                ) : null}

                {query.data.task.kpiInstanceId === null &&
                  (isOwner || (collaborationActive && capabilities?.role === 'ASSIGNEE')) ? (
                  <CollaborativeAssignmentsPanel
                    key={query.data.task.id}
                    taskId={query.data.task.id}
                    actorId={actorId}
                    ownerId={ownerId}
                    meetingId={query.data.actionItem?.meetingId ?? null}
                    children={query.data.subtasks.map(item => ({
                      id: item.id, title: item.title, description: item.description,
                      priority: item.priority, dueDate: item.dueDate, isCompleted: item.isCompleted,
                    }))}
                    enabled={collaborationActive}
                    description={query.data.task.description}
                    focusSubtaskId={focusSubtaskId}
                    canManageSubtasks={canManageSubtasks}
                    onAddSubtask={() => {
                      setEditingSubtask(null)
                      setSubtaskEditorSession(current => current + 1)
                      setSubtaskEditorOpen(true)
                    }}
                    onEditSubtask={childId => {
                      const child = query.data.subtasks.find(item => item.id === childId)
                      if (!child) return
                      setEditingSubtask(child)
                      setSubtaskEditorSession(current => current + 1)
                      setSubtaskEditorOpen(true)
                    }}
                    onDeleteSubtask={childId => deleteMutation.mutate(childId, {
                      onError: () => toast.error(t('tasks.details.errors.subtask')),
                    })}
                    reorderPending={reorderMutation.isPending}
                    onReorderSubtasks={subtaskIds => reorderMutation.mutate({taskId:query.data.task.id,subtaskIds}, {
                      onError: () => toast.error(t('tasks.details.errors.reorder')),
                    })}
                    subtaskContent={childId => {
                      const attachments = subtaskAttachments.get(childId) ?? []
                      if (!attachments.length) return null
                      return <div className="space-y-2 border-t pt-3">
                        <p className="text-sm font-semibold">{t('tasks.details.subtaskFiles')}</p>
                        <TaskAttachmentList compact attachments={attachments} readOnly={false}
                          canDelete={canDeleteAttachment} onOpen={setPreviewAttachment}
                          onDownload={item => void download(item)} onDelete={removeAttachment} />
                      </div>
                    }}
                    discussionContent={<TaskDiscussions taskId={query.data.task.id} actorId={actorId} initialSubtaskId={focusSubtaskId} />}
                    discussionUnread={unreadDiscussions}
                    activityContent={<TaskActivityTimeline activity={query.data.activity} subtasks={query.data.subtasks} />}
                    overviewContent={<Card>
                      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
                        <CardTitle>{t('tasks.details.taskFiles')}</CardTitle>
                        <input ref={taskFileRef} type="file" className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                          onChange={event => {
                            const file = event.target.files?.[0]
                            if (file) upload(file)
                            event.target.value = ''
                          }} />
                        {isOwner && <Button size="sm" variant="outline" disabled={!canUploadAttachments}
                          onClick={() => taskFileRef.current?.click()}>
                          <Paperclip className="size-4" />{t('tasks.details.addFile')}
                        </Button>}
                      </CardHeader>
                      <CardContent>
                        <TaskAttachmentList attachments={taskAttachments}
                          emptyLabel={t('tasks.details.noTaskFiles')} readOnly={false}
                          canDelete={canDeleteAttachment} onOpen={setPreviewAttachment}
                          onDownload={item => void download(item)} onDelete={removeAttachment} />
                      </CardContent>
                    </Card>}
                  />
                ) : null}

                {(!collaborationActive || (!isOwner && capabilities?.role !== 'ASSIGNEE')) && <>
                  {query.data.task.kpiInstanceId===null && <div className="bg-card mb-4 flex items-center gap-2 rounded-xl border p-2" role="tablist" aria-label={t('tasks.workspace.navigation')}>
                    <Button type="button" variant={legacyTab==='overview'?'default':'ghost'} size="sm" role="tab" aria-selected={legacyTab==='overview'} onClick={()=>setLegacyTab('overview')}>{t('tasks.workspace.overview')}</Button>
                    <Button type="button" variant={legacyTab==='discussion'?'default':'ghost'} size="sm" role="tab" aria-selected={legacyTab==='discussion'} onClick={()=>setLegacyTab('discussion')}>{t('discussions.title')}{unreadDiscussions>0?` (${unreadDiscussions})`:''}</Button>
                  </div>}
                  {legacyTab==='discussion'&&query.data.task.kpiInstanceId===null?<TaskDiscussions taskId={query.data.task.id} actorId={actorId} initialSubtaskId={discussionSubtaskId??focusSubtaskId} />:
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.75fr)]">
                  <main className="min-w-0 space-y-5">
                    {!collaborationActive && (canEditSummary || query.data.task.completionSummary || query.data.completionSummaryEntries.length > 0) ? <Card>
                      <CardHeader className="pb-3"><CardTitle>{t('tasks.assignment.completionSummary')}</CardTitle></CardHeader>
                      <CardContent>
                        <CompletionSummaryHistory key={`summary-${query.data.task.id}`}
                          legacy={query.data.task.completionSummary ?? null}
                          entries={query.data.completionSummaryEntries} canAdd={canEditSummary}
                          pending={saveSummary.isPending}
                          onAdd={(value, onSuccess) => saveSummary.mutate({taskId: query.data.task.id, completionSummary:value}, {
                            onSuccess: () => { onSuccess(); toast.success(t('tasks.assignment.notesSaved')) },
                            onError: () => toast.error(t('tasks.assignment.saveFailed')),
                          })} />
                      </CardContent>
                    </Card> : null}
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
                          disabled={!canCreateSubtasks}
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

                              if (!canManageSubtasks || event.canceled) {
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
                                    {query.data.progress.total > 0 ? t('tasks.assignment.noAssignedSubtasks') : t('tasks.details.noSubtasks')}
                                  </motion.li>
                                ) : null}

                                {displayedSubtasks.map((item, index) => (
                                  <SortableSubtaskRow
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    attachments={subtaskAttachments.get(item.id) ?? []}
                                    dragDisabled={!canCreateSubtasks || reorderMutation.isPending}
                                    canComplete={!collaborationActive && canCompleteSubtasks && (
                                      actorId === (item.assigneeUserId ?? effectiveMainAssignee))}
                                    canEditNotes={!collaborationActive && canCompleteSubtasks && (
                                      actorId === (item.assigneeUserId ?? effectiveMainAssignee))}
                                    canManage={canCreateSubtasks}
                                    canEditMetadata={canManageSubtasks}
                                    canAssign={supportsSubtaskAssignment && isOwner && canManageSubtasks}
                                    meetingId={query.data.actionItem?.meetingId ?? null}
                                    excludedAssigneeIds={!query.data.actionItem && mainAssigneeId !== null &&
                                      mainAssigneeId !== ownerId && ownerId !== null ? [ownerId] : []}
                                    assigneePending={assignChild.isPending}
                                    notesPending={saveNotes.isPending}
                                    onAssign={value => assignChild.mutate({subtaskId:item.id,assigneeUserId:value}, {
                                      onSuccess: () => toast.success(t('tasks.assignment.assignmentSaved')),
                                      onError: error => toast.error(toApiClientError(error).code === 'SUBTASK_CREATOR_SELF_ASSIGNMENT'
                                        ? t('tasks.assignment.creatorSelfBlocked') : t('tasks.assignment.saveFailed')),
                                    })}
                                    onSaveNotes={(value, onSuccess) => saveNotes.mutate({subtaskId:item.id,workNotes:value}, {
                                      onSuccess: () => {onSuccess();toast.success(t('tasks.assignment.notesSaved'))},
                                      onError: () => toast.error(t('tasks.assignment.saveFailed')),
                                    })}
                                    canUpload={canUploadAttachments && !collaborationActive}
                                    canDeleteAttachment={canDeleteAttachment}
                                    justMoved={recentlyMovedSubtaskId === item.id}
                                    focused={focusSubtaskId === item.id}
                                    onToggle={() => toggle(item)}
                                    onUpload={(file) => upload(file, item.id)}
                                    onOpenAttachment={setPreviewAttachment}
                                    onDownloadAttachment={(attachment) => void download(attachment)}
                                    onDeleteAttachment={removeAttachment}
                                    discussionAvailable={Boolean(discussionCounts.data?.some(scope => scope.subtaskId === item.id)) &&
                                      (item.assigneeUserId ?? effectiveMainAssignee) !== ownerId}
                                    discussionUnread={discussionCounts.data?.find(scope => scope.subtaskId === item.id)?.unread ?? 0}
                                    onDiscussion={()=>{setDiscussionSubtaskId(item.id);setLegacyTab('discussion')}}
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
                            disabled={!canUploadAttachments || Boolean((query.data.generalAssignment || query.data.actionItem) && actorId !== ownerId && effectiveMainAssignee !== actorId)}
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
                          readOnly={false}
                          canDelete={canDeleteAttachment}
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
                        {query.data.createdBy ? <InfoRow
                          icon={UserRound}
                          label={t('tasks.details.createdBy')}
                          value={<span>{query.data.createdBy.userName}{query.data.createdBy.userCode ? ` (${query.data.createdBy.userCode})` : ''}</span>}
                        /> : null}
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
                          value={(!collaborationActive && !readOnly && (capabilities?.canCompleteTask || capabilities?.canChangeNonCompletionStatus)) ? (
                            <Select value={query.data.task.status} onValueChange={value => changeDrawerStatus(value as TaskStatus)}
                              disabled={statusMutation.isPending}>
                              <SelectTrigger aria-label={t('tasks.assignment.changeStatus')} className="h-9 w-full">
                                <SelectValue><TaskStatusIndicator status={query.data.task.status} /></SelectValue>
                              </SelectTrigger>
                              <SelectContent>{TASK_STATUSES.filter(value => (
                                (value === query.data.task.status || permittedTransitions[query.data.task.status].includes(value)) && (
                                value === 'DONE' ? capabilities?.canCompleteTask :
                                value === 'CANCELLED' ? (capabilities?.role === 'OWNER' && capabilities.canChangeNonCompletionStatus) :
                                capabilities?.canChangeNonCompletionStatus)
                              )).map(value => <SelectItem key={value} value={value}>
                                <TaskStatusIndicator status={value} />
                              </SelectItem>)}</SelectContent>
                            </Select>
                          ) : <TaskStatusIndicator status={query.data.task.status} pill />}
                        />
                        {isGeneralTask && !collaborationActive ? <InfoRow icon={UserRound} label={t('tasks.assignment.assignTo')} value={
                          isOwner && !readOnly ? <TaskAssigneePicker value={mainAssigneeId} disabled={assignMain.isPending}
                            onChange={value => assignMain.mutate({taskId:query.data.task.id, assigneeUserId:value}, {
                              onSuccess: () => toast.success(t('tasks.assignment.assignmentSaved')),
                              onError: error => toast.error(toApiClientError(error).code === 'SUBTASK_OWNER_OVERRIDE_EXISTS'
                                ? t('tasks.assignment.clearCreatorSubtasksFirst') : t('tasks.assignment.saveFailed')),
                            })} /> : <span>{mainAssigneeId === null ? t('tasks.assignment.unassigned') :
                              (mainAssigneeLookup.data?.userName ?? t('tasks.assignment.userCode', {code:mainAssigneeId}))}</span>
                        } /> : null}
                        {groupQuery.data?.groups.length && query.data.task.listId!==null &&
                          capabilities?.role==='OWNER' && query.data.task.meetingActionItem===null ? (
                          <div className="space-y-2 py-2">
                            <label className="text-muted-foreground text-xs font-medium">{t('taskGroups.select')}</label>
                            <TaskGroupSelect groups={groupQuery.data.groups}
                              value={groupDraft?.taskId===query.data.task.id?groupDraft.groupId:query.data.task.groupId??null}
                              onChange={groupId=>setGroupDraft({taskId:query.data.task.id,groupId})}/>
                            <Button type="button" variant="outline" size="sm"
                              disabled={groupActions.moveTask.isPending || groupDraft?.taskId!==query.data.task.id ||
                                groupDraft.groupId===(query.data.task.groupId??null)}
                              onClick={()=>groupActions.moveTask.mutate({taskId:query.data.task.id,groupId:groupDraft?.groupId??null},{
                                onSuccess:()=>setGroupDraft(null),
                                onError:()=>toast.error(t('taskGroups.saveError')),
                              })}>{t('taskGroups.moveTask')}</Button>
                          </div>
                        ) : null}
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

                    <TaskActivityTimeline activity={query.data.activity} subtasks={query.data.subtasks} />
                  </aside>
                </div>}</>}
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

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent variant="modal" closeLabel={t('common.close')}>
          <DialogTitle>{t('tasks.cancelTitle')}</DialogTitle>
          <DialogDescription>{t('tasks.cancelDescription')}</DialogDescription>
          <label className="mt-4 block text-sm font-medium" htmlFor="drawer-cancel-reason">{t('tasks.cancellationReason')}</label>
          <Textarea id="drawer-cancel-reason" value={cancelReason} maxLength={1000}
            onChange={event => setCancelReason(event.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={!cancelReason.trim() || statusMutation.isPending} onClick={() => {
              if (!taskId) return
              statusMutation.mutate({taskId,status:'CANCELLED',cancellationReason:cancelReason.trim()}, {
                onSuccess: () => { setCancelOpen(false); setCancelReason(''); toast.success(t('tasks.statusUpdated')) },
                onError: error => toast.error(t(taskStatusErrorKey(error)), { id: taskStatusToastId(taskId) }),
              })
            }}>{t('tasks.cancelTask')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={tagEditorOpen} onOpenChange={open=>!savingTags&&setTagEditorOpen(open)}>
        <DialogContent variant="modal" closeLabel={t('common.close')}>
          <DialogTitle>{t('tags.editTaskTags')}</DialogTitle>
          <DialogDescription>{t('tags.chooseDescription')}</DialogDescription>
          <div className="mt-4 space-y-4">
            <TagPicker value={tagDraft} onChange={setTagDraft} disabled={savingTags}/>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setTagEditorOpen(false)} disabled={savingTags}>{t('common.cancel')}</Button>
              <Button disabled={savingTags || !taskId} onClick={async()=>{
                if(!taskId)return
                setSavingTags(true)
                try {await setTaskTags(taskId,tagDraft);await tagQueryClient.invalidateQueries({queryKey:['tasks']});
                  await tagQueryClient.invalidateQueries({queryKey:['assigned-action-items']});
                  await tagQueryClient.invalidateQueries({queryKey:['general-assignments']});
                  await tagQueryClient.invalidateQueries({queryKey:['meetings','action-items']});
                  setTagEditorOpen(false);toast.success(t('tags.saved'))}
                catch {toast.error(t('tags.saveFailed'))}
                finally {setSavingTags(false)}
              }}>{t('common.save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {taskId && shareOpen ? <ShareTaskDialog taskId={taskId} open onOpenChange={setShareOpen}/> : null}
      {taskId && canCreateSubtasks ? (
        <SubtaskEditorDialog
          key={subtaskEditorSession}
          open={subtaskEditorOpen}
          onOpenChange={setSubtaskEditorOpen}
          taskId={taskId}
          subtask={editingSubtask}
          parentPriority={query.data?.task.priority ?? 'MEDIUM'}
          collaborationActive={collaborationActive}
          dueDateRequired={subtaskDueDateRequired}
          generalAssignmentEnabled={supportsSubtaskAssignment}
          meetingId={query.data?.actionItem?.meetingId ?? null}
          excludedAssigneeIds={!query.data?.actionItem && mainAssigneeId !== null &&
            mainAssigneeId !== ownerId && ownerId !== null ? [ownerId] : []}
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




