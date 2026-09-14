import {
  CalendarPlus2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Ellipsis,
  FileCheck2,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Plus,
  UserRound,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { taskHubEase, taskHubItemMotion } from '@/components/shared/TaskHubMotion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import {
  MeetingDecisionsWorkspace,
  MeetingNotesWorkspace,
} from '@/features/meetings/follow-up/MeetingFollowUpOutcomeSections'
import type {
  MeetingFollowUpLaunchRequest,
  MeetingFollowUpSectionKey,
} from '@/features/meetings/follow-up/meeting-follow-up.types'
import { useMeetingFollowUp } from '@/features/meetings/follow-up/use-meeting-follow-up'
import {
  MeetingRelatedMeetingsWorkspace,
  ScheduleFollowUpMeetingDialog,
  useFollowUpMeetingScheduling,
} from '@/features/meetings/follow-up/MeetingFollowUpRelatedSections'
import {
  FollowUpDetailHeader,
  FollowUpMetricCard,
  FollowUpWorkspaceCard,
} from '@/features/meetings/follow-up/MeetingFollowUpWorkspace'
import type { MeetingDetail } from '@/features/meetings/types/meeting.types'
import { TaskCollectionToolbar } from '@/features/tasks/components/TaskCollectionToolbar'
import { TaskDetailsDrawer } from '@/features/tasks/components/TaskDetailsDrawer'
import {
  TaskDueIndicator,
  TaskPriorityIndicator,
} from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import { useChangeTaskStatus } from '@/features/tasks/hooks/use-tasks'
import {
  TASK_DUE_FILTERS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/features/tasks/types/task.types'
import type { TaskPriority, TaskStatus } from '@/features/tasks/types/task.types'
import { parseDateOnly } from '@/lib/date-only'
import { APP_TIME_ZONE } from '@/lib/date-time'
import { cn } from '@/lib/cn'

import type {
  AssignedActionItemDueFilter,
  MeetingActionItem,
} from './meeting-action-items.types'
import { MeetingActionTaskCard } from './MeetingActionTaskCard'
import {
  useCreateMeetingActionItem,
  useMeetingActionItemAssignees,
  useMeetingActionItems,
  useReassignMeetingActionItem,
} from './use-meeting-action-items'

const ALL = 'ALL'

type FollowUpSortField = 'assignedAt' | 'dueDate' | 'priority' | 'title' | 'status' | 'assignee'
type FollowUpGroupBy = 'NONE' | 'ASSIGNEE' | 'STATUS' | 'PRIORITY' | 'AGENDA' | 'DUE_DATE'

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

function SummaryButton({
  active,
  value,
  label,
  onClick,
}: {
  active: boolean
  value: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'bg-card focus-visible:ring-ring min-w-0 px-3 py-2.5 text-start transition-colors hover:bg-muted/45 focus-visible:z-10 focus-visible:ring-2 focus-visible:outline-none sm:px-4',
        active && 'bg-primary/[0.055] text-primary',
      )}
    >
      <span className="text-muted-foreground block truncate text-[11px] font-medium">{label}</span>
      <span className="mt-0.5 block text-xl font-bold tabular-nums">{value}</span>
    </button>
  )
}

function groupKey(item: MeetingActionItem, groupBy: FollowUpGroupBy) {
  if (groupBy === 'ASSIGNEE') return `assignee:${item.assigneeUserId}`
  if (groupBy === 'STATUS') return `status:${item.status}`
  if (groupBy === 'PRIORITY') return `priority:${item.priority}`
  if (groupBy === 'AGENDA') return `agenda:${item.agendaItemId ?? 'none'}`
  if (groupBy === 'DUE_DATE') return `due:${item.dueDate ?? 'none'}`
  return 'all'
}

function GroupHeading({ item, groupBy }: { item: MeetingActionItem; groupBy: FollowUpGroupBy }) {
  const { i18n, t } = useTranslation()
  if (groupBy === 'NONE') return null

  let label = ''
  if (groupBy === 'ASSIGNEE') label = item.assigneeName
  if (groupBy === 'STATUS') label = t(`tasks.statuses.${item.status}`)
  if (groupBy === 'PRIORITY') label = t(`tasks.priorities.${item.priority}`)
  if (groupBy === 'AGENDA') label = item.agendaTitle ?? t('meetings.followUp.noAgendaGroup')
  if (groupBy === 'DUE_DATE') {
    const date = item.dueDate ? parseDateOnly(item.dueDate) : null
    label = date
      ? date.toLocaleDateString(i18n.language, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : t('tasks.noDueDate')
  }

  return (
    <div className="text-muted-foreground flex items-center gap-3 pt-2 text-xs font-semibold uppercase tracking-wide">
      <span>{label}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}

function ActionItemPreviewRow({
  item,
  showAssignee,
  onOpen,
}: {
  item: MeetingActionItem
  showAssignee: boolean
  onOpen: () => void
}) {
  const { i18n, t } = useTranslation()
  const dueDate = item.dueDate ? parseDateOnly(item.dueDate) : null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:border-primary/25 hover:bg-muted/10 focus-visible:ring-ring flex w-full min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5 text-start shadow-sm transition-[border-color,background-color,box-shadow] hover:shadow-md focus-visible:ring-2 focus-visible:outline-none sm:p-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          {item.description ? (
            <p className="text-muted-foreground mt-1 line-clamp-1 text-xs leading-5">
              {item.description}
            </p>
          ) : null}
        </div>
        <TaskStatusIndicator status={item.status} pill />
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <TaskPriorityIndicator priority={item.priority} />
        {showAssignee ? (
          <span className="inline-flex items-center gap-1.5">
            <UserRound aria-hidden="true" className="size-3.5" />
            {item.assigneeName}
          </span>
        ) : null}
        <span className={cn('inline-flex items-center gap-1.5', item.isOverdue && 'text-destructive font-medium')}>
          <Clock3 aria-hidden="true" className="size-3.5" />
          {dueDate
            ? dueDate.toLocaleDateString(i18n.language, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : t('tasks.noDueDate')}
        </span>
        {item.agendaTitle ? (
          <span className="inline-flex max-w-full items-center gap-1.5">
            <ListChecks aria-hidden="true" className="size-3.5" />
            <span className="truncate">{item.agendaTitle}</span>
          </span>
        ) : null}
      </div>
    </button>
  )
}

function compareItems(left: MeetingActionItem, right: MeetingActionItem, sortBy: FollowUpSortField) {
  if (sortBy === 'assignedAt') return left.assignedAtUtc.localeCompare(right.assignedAtUtc)

  if (sortBy === 'dueDate') {
    if (!left.dueDate && !right.dueDate) return 0
    if (!left.dueDate) return 1
    if (!right.dueDate) return -1
    return left.dueDate.localeCompare(right.dueDate)
  }

  if (sortBy === 'priority') {
    const rank: Record<TaskPriority, number> = { HIGH: 1, MEDIUM: 2, LOW: 3 }
    return rank[left.priority] - rank[right.priority]
  }

  if (sortBy === 'status') {
    const rank: Record<TaskStatus, number> = {
      TODO: 1,
      IN_PROGRESS: 2,
      DONE: 3,
      CANCELLED: 4,
    }
    return rank[left.status] - rank[right.status]
  }

  if (sortBy === 'assignee') return left.assigneeName.localeCompare(right.assigneeName)

  return left.title.localeCompare(right.title)
}

export function MeetingFollowUpPanel({
  detail,
  launchRequest,
  onLaunchRequestHandled,
  section = null,
  onSectionChange,
}: {
  detail: MeetingDetail
  launchRequest?: MeetingFollowUpLaunchRequest | null
  onLaunchRequestHandled?: () => void
  section?: MeetingFollowUpSectionKey | null
  onSectionChange?: (section: MeetingFollowUpSectionKey | null) => void
}) {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const shouldReduceMotion = useReducedMotion()
  const meeting = detail.meeting
  const currentUserId = currentUser.data?.user.userId ?? null
  const isOrganizer = currentUserId === meeting.organizer.userId
  const followUp = useMeetingFollowUp(meeting.id)
  const actionItems = useMeetingActionItems(meeting.id)
  const canCreate = actionItems.data?.canCreate === true
  const assignees = useMeetingActionItemAssignees(meeting.id, isOrganizer)
  const createMutation = useCreateMeetingActionItem(meeting.id)
  const statusMutation = useChangeTaskStatus()
  const scheduling = useFollowUpMeetingScheduling(detail)

  const [createOpen, setCreateOpen] = useState(false)
  const [localDecisionLaunch, setLocalDecisionLaunch] = useState<MeetingFollowUpLaunchRequest | null>(null)
  const [taskId, setTaskId] = useState<number | null>(null)
  const [reassignItem, setReassignItem] = useState<MeetingActionItem | null>(null)
  const [reassignAssignee, setReassignAssignee] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>()
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | undefined>()
  const [dueFilter, setDueFilter] = useState<AssignedActionItemDueFilter>('ALL')
  const [assigneeFilter, setAssigneeFilter] = useState<number | undefined>()
  const [agendaFilter, setAgendaFilter] = useState<number | 'NONE' | undefined>()
  const [sortBy, setSortBy] = useState<FollowUpSortField>('assignedAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [groupBy, setGroupBy] = useState<FollowUpGroupBy>('NONE')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [agenda, setAgenda] = useState('NONE')

  useEffect(() => {
    if (!launchRequest || launchRequest.kind !== 'ACTION_ITEM') return
    setAgenda(String(launchRequest.agendaItemId))
    setCreateOpen(true)
    onLaunchRequestHandled?.()
  }, [launchRequest, onLaunchRequestHandled])

  const eligibleAssignees = useMemo(
    () => assignees.data?.filter((item) => item.eligible) ?? [],
    [assignees.data],
  )
  const selectedAssignee = useMemo(
    () => assignees.data?.find((item) => String(item.userId) === assignee) ?? null,
    [assignee, assignees.data],
  )
  const selectedReassignAssignee = useMemo(
    () => assignees.data?.find((item) => String(item.userId) === reassignAssignee) ?? null,
    [assignees.data, reassignAssignee],
  )
  const hasNoEligibleAssignees =
    !assignees.isPending && assignees.data !== undefined && eligibleAssignees.length === 0
  const reassignMutation = useReassignMeetingActionItem(meeting.id, reassignItem?.taskId ?? 0)

  const allItems = actionItems.data?.items ?? []
  const today = getCurrentDateOnlyInAppTimeZone()
  const summary = useMemo(
    () => ({
      total: allItems.length,
      todo: allItems.filter((item) => item.status === 'TODO').length,
      inProgress: allItems.filter((item) => item.status === 'IN_PROGRESS').length,
      done: allItems.filter((item) => item.status === 'DONE').length,
      overdue: allItems.filter((item) => item.isOverdue).length,
    }),
    [allItems],
  )
  const overviewItems = useMemo(
    () =>
      [...allItems]
        .sort((left, right) => {
          if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1
          if (left.status === 'DONE' && right.status !== 'DONE') return 1
          if (right.status === 'DONE' && left.status !== 'DONE') return -1
          if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) {
            return left.dueDate.localeCompare(right.dueDate)
          }
          if (left.dueDate && !right.dueDate) return -1
          if (!left.dueDate && right.dueDate) return 1
          return right.assignedAtUtc.localeCompare(left.assignedAtUtc)
        })
        .slice(0, 3),
    [allItems],
  )

  const hasFilters = Boolean(
    search.trim() ||
      statusFilter ||
      priorityFilter ||
      dueFilter !== 'ALL' ||
      assigneeFilter ||
      agendaFilter !== undefined,
  )

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()

    return allItems
      .filter((item) => {
        if (normalizedSearch) {
          const searchable = [item.title, item.description ?? '', item.assigneeName, item.agendaTitle ?? '']
            .join(' ')
            .toLocaleLowerCase()
          if (!searchable.includes(normalizedSearch)) return false
        }

        if (statusFilter && item.status !== statusFilter) return false
        if (priorityFilter && item.priority !== priorityFilter) return false
        if (assigneeFilter && item.assigneeUserId !== assigneeFilter) return false

        if (agendaFilter !== undefined) {
          if (agendaFilter === 'NONE' && item.agendaItemId !== null) return false
          if (agendaFilter !== 'NONE' && item.agendaItemId !== agendaFilter) return false
        }

        if (dueFilter === 'OVERDUE' && !item.isOverdue) return false
        if (dueFilter === 'TODAY' && item.dueDate !== today) return false
        if (dueFilter === 'UPCOMING' && (!item.dueDate || item.dueDate <= today)) return false
        if (dueFilter === 'NO_DATE' && item.dueDate !== null) return false

        return true
      })
      .sort((left, right) => {
        const result = compareItems(left, right, sortBy)
        return sortDirection === 'asc' ? result : -result
      })
  }, [
    agendaFilter,
    allItems,
    assigneeFilter,
    dueFilter,
    priorityFilter,
    search,
    sortBy,
    sortDirection,
    statusFilter,
    today,
  ])

  const groups = useMemo(() => {
    if (groupBy === 'NONE') return [{ key: 'all', items: filteredItems }]

    const grouped = new Map<string, MeetingActionItem[]>()
    for (const item of filteredItems) {
      const key = groupKey(item, groupBy)
      const existing = grouped.get(key)
      if (existing) existing.push(item)
      else grouped.set(key, [item])
    }

    return Array.from(grouped, ([key, items]) => ({ key, items }))
  }, [filteredItems, groupBy])

  const filterAssignees = useMemo(() => {
    const byId = new Map<number, string>()
    for (const item of allItems) byId.set(item.assigneeUserId, item.assigneeName)
    return Array.from(byId, ([userId, name]) => ({ userId, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [allItems])

  const structuredFilterCount =
    Number(Boolean(statusFilter)) +
    Number(Boolean(priorityFilter)) +
    Number(dueFilter !== 'ALL') +
    Number(Boolean(assigneeFilter)) +
    Number(agendaFilter !== undefined)

  const selectedAssigneeFilterName = assigneeFilter
    ? filterAssignees.find((item) => item.userId === assigneeFilter)?.name ?? ''
    : ''

  const selectedAgendaFilterName =
    agendaFilter === undefined
      ? ''
      : agendaFilter === 'NONE'
        ? t('meetings.followUp.noAgendaGroup')
        : detail.agendaItems.find((item) => item.id === agendaFilter)?.topic ?? ''

  function resetCreateForm() {
    setTitle('')
    setDescription('')
    setAssignee('')
    setPriority('MEDIUM')
    setDueDate('')
    setAgenda('NONE')
  }

  function clearStructuredFilters() {
    setStatusFilter(undefined)
    setPriorityFilter(undefined)
    setDueFilter('ALL')
    setAssigneeFilter(undefined)
    setAgendaFilter(undefined)
  }

  function clearFilters() {
    setSearch('')
    clearStructuredFilters()
  }

  function applyStatusSummary(nextStatus: TaskStatus) {
    const shouldClear =
      statusFilter === nextStatus &&
      !search &&
      !priorityFilter &&
      dueFilter === 'ALL' &&
      !assigneeFilter &&
      agendaFilter === undefined
    clearFilters()
    setStatusFilter(shouldClear ? undefined : nextStatus)
  }

  function applyOverdueSummary() {
    const shouldClear =
      dueFilter === 'OVERDUE' &&
      !search &&
      !statusFilter &&
      !priorityFilter &&
      !assigneeFilter &&
      agendaFilter === undefined
    clearFilters()
    setDueFilter(shouldClear ? 'ALL' : 'OVERDUE')
  }

  function openActionItems(status?: TaskStatus, due?: AssignedActionItemDueFilter) {
    clearFilters()
    if (status) setStatusFilter(status)
    if (due && due !== 'ALL') setDueFilter(due)
    onSectionChange?.('action-items')
  }

  function openActionItemsOverview() {
    clearFilters()
    onSectionChange?.('action-items')
  }

  function openDecisionCreate() {
    setLocalDecisionLaunch((current) => ({
      kind: 'DECISION',
      agendaItemId: null,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }

  function changeStatus(item: MeetingActionItem, nextStatus: TaskStatus) {
    statusMutation.mutate(
      { taskId: item.taskId, status: nextStatus },
      {
        onSuccess: () => {
          toast.success(t('tasks.statusUpdated'))
          void actionItems.refetch()
        },
        onError: () => toast.error(t('tasks.errors.status')),
      },
    )
  }

  function submitCreate() {
    if (!title.trim() || !assignee) return
    createMutation.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate || null,
        assigneeUserId: Number(assignee),
        agendaItemId: agenda === 'NONE' ? null : Number(agenda),
      },
      {
        onSuccess: () => {
          toast.success(t('meetings.followUp.actionCreated'))
          setCreateOpen(false)
          resetCreateForm()
        },
        onError: () => toast.error(t('meetings.followUp.actionCreateError')),
      },
    )
  }

  function openReassign(item: MeetingActionItem) {
    setReassignItem(item)
    setReassignAssignee(String(item.assigneeUserId))
  }

  function submitReassign() {
    if (!reassignItem || !reassignAssignee) return
    reassignMutation.mutate(
      {
        assigneeUserId: Number(reassignAssignee),
        rowVersion: reassignItem.rowVersion,
      },
      {
        onSuccess: () => {
          toast.success(t('meetings.followUp.reassigned'))
          setReassignItem(null)
          setReassignAssignee('')
        },
        onError: () => toast.error(t('meetings.followUp.reassignError')),
      },
    )
  }

  const activeFilterChips: Array<{ key: string; label: string; onRemove: () => void }> = []

  if (statusFilter) {
    activeFilterChips.push({
      key: 'status',
      label: `${t('meetings.followUp.filters.status')}: ${t(`tasks.statuses.${statusFilter}`)}`,
      onRemove: () => setStatusFilter(undefined),
    })
  }

  if (priorityFilter) {
    activeFilterChips.push({
      key: 'priority',
      label: `${t('meetings.followUp.filters.priority')}: ${t(`tasks.priorities.${priorityFilter}`)}`,
      onRemove: () => setPriorityFilter(undefined),
    })
  }

  if (assigneeFilter) {
    activeFilterChips.push({
      key: 'assignee',
      label: `${t('meetings.followUp.filters.assignee')}: ${selectedAssigneeFilterName}`,
      onRemove: () => setAssigneeFilter(undefined),
    })
  }

  if (dueFilter !== 'ALL') {
    activeFilterChips.push({
      key: 'due',
      label: `${t('meetings.followUp.filters.due')}: ${t(`tasks.dueFilters.${dueFilter}`)}`,
      onRemove: () => setDueFilter('ALL'),
    })
  }

  if (agendaFilter !== undefined) {
    activeFilterChips.push({
      key: 'agenda',
      label: `${t('meetings.followUp.filters.agenda')}: ${selectedAgendaFilterName}`,
      onRemove: () => setAgendaFilter(undefined),
    })
  }

  const filterFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {t('meetings.followUp.filters.status')}
        </label>
        <Select
          value={statusFilter ?? ALL}
          onValueChange={(value) =>
            setStatusFilter(value === ALL ? undefined : (value as TaskStatus))
          }
        >
          <SelectTrigger className="h-10 min-w-0" aria-label={t('meetings.followUp.filters.status')}>
            <SelectValue>
              {statusFilter ? (
                <TaskStatusIndicator status={statusFilter} pill />
              ) : (
                <span className="truncate">{t('meetings.followUp.filters.allShort')}</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('meetings.followUp.filters.allShort')}</SelectItem>
            {TASK_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                <TaskStatusIndicator status={value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {t('meetings.followUp.filters.priority')}
        </label>
        <Select
          value={priorityFilter ?? ALL}
          onValueChange={(value) =>
            setPriorityFilter(value === ALL ? undefined : (value as TaskPriority))
          }
        >
          <SelectTrigger className="h-10 min-w-0" aria-label={t('meetings.followUp.filters.priority')}>
            <SelectValue>
              {priorityFilter ? (
                <TaskPriorityIndicator priority={priorityFilter} pill />
              ) : (
                <span className="truncate">{t('meetings.followUp.filters.allShort')}</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('meetings.followUp.filters.allShort')}</SelectItem>
            {TASK_PRIORITIES.map((value) => (
              <SelectItem key={value} value={value}>
                <TaskPriorityIndicator priority={value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isOrganizer ? (
        <div className="space-y-1.5">
          <label className="text-muted-foreground text-xs font-medium">
            {t('meetings.followUp.filters.assignee')}
          </label>
          <Select
            value={assigneeFilter ? String(assigneeFilter) : ALL}
            onValueChange={(value) =>
              setAssigneeFilter(value === ALL ? undefined : Number(value))
            }
          >
            <SelectTrigger className="h-10 min-w-0" aria-label={t('meetings.followUp.filters.assignee')}>
              <SelectValue>
                <span className="block min-w-0 truncate">
                  {selectedAssigneeFilterName || t('meetings.followUp.filters.allShort')}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('meetings.followUp.filters.allShort')}</SelectItem>
              {filterAssignees.map((item) => (
                <SelectItem key={item.userId} value={String(item.userId)}>
                  <span className="flex min-w-0 items-center gap-2">
                    <UserRound className="size-4 shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {t('meetings.followUp.filters.due')}
        </label>
        <Select
          value={dueFilter}
          onValueChange={(value) => setDueFilter(value as AssignedActionItemDueFilter)}
        >
          <SelectTrigger className="h-10 min-w-0" aria-label={t('meetings.followUp.filters.due')}>
            <SelectValue>
              {dueFilter === 'ALL' ? (
                <span className="truncate">{t('meetings.followUp.filters.allShort')}</span>
              ) : (
                <TaskDueIndicator due={dueFilter} pill />
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('meetings.followUp.filters.allShort')}</SelectItem>
            {TASK_DUE_FILTERS.filter((value) => value !== 'ALL').map((value) => (
              <SelectItem key={value} value={value}>
                <TaskDueIndicator due={value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-muted-foreground text-xs font-medium">
          {t('meetings.followUp.filters.agenda')}
        </label>
        <Select
          value={
            agendaFilter === undefined
              ? ALL
              : agendaFilter === 'NONE'
                ? 'NONE'
                : String(agendaFilter)
          }
          onValueChange={(value) =>
            setAgendaFilter(value === ALL ? undefined : value === 'NONE' ? 'NONE' : Number(value))
          }
        >
          <SelectTrigger className="h-10 min-w-0" aria-label={t('meetings.followUp.filters.agenda')}>
            <SelectValue>
              <span className="block min-w-0 truncate">
                {selectedAgendaFilterName || t('meetings.followUp.filters.allShort')}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('meetings.followUp.filters.allShort')}</SelectItem>
            <SelectItem value="NONE">{t('meetings.followUp.noAgendaGroup')}</SelectItem>
            {detail.agendaItems.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                <span className="flex min-w-0 items-center gap-2">
                  <ListChecks className="size-4 shrink-0" />
                  <span className="truncate">{item.topic}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  const decisionLaunchRequest =
    launchRequest?.kind === 'DECISION' ? launchRequest : localDecisionLaunch
  const roomName = i18n.language.startsWith('ar') ? meeting.room.nameAr : meeting.room.nameEn

  function handleDecisionLaunchHandled() {
    if (launchRequest?.kind === 'DECISION') onLaunchRequestHandled?.()
    else setLocalDecisionLaunch(null)
  }

  return (
    <div className="space-y-5">
      {section === null ? (
        <>
          <Card className="overflow-hidden border-border/70 p-0 shadow-sm">
            <div className="grid gap-5 bg-gradient-to-br from-primary/[0.045] via-background to-background p-5 sm:p-6 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.9fr)_minmax(14rem,0.75fr)] xl:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <span className="bg-primary/10 text-primary grid size-12 shrink-0 place-items-center rounded-2xl">
                  <LayoutDashboard aria-hidden="true" className="size-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                    {t('meetings.followUp.workspace.eyebrow')}
                  </p>
                  <h2 className="mt-1 truncate text-lg font-bold">{meeting.title}</h2>
                  <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                    <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{roomName}</span>
                  </p>
                </div>
              </div>

              {followUp.isPending ? (
                <LoadingState />
              ) : followUp.isError || !followUp.data ? (
                <ErrorState onRetry={() => void followUp.refetch()} />
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <FollowUpMetricCard
                    icon={ClipboardCheck}
                    label={t('meetings.followUp.summarySection.actionItems')}
                    value={followUp.data.summary.actionItems}
                    tone="blue"
                    onClick={openActionItemsOverview}
                  />
                  <FollowUpMetricCard
                    icon={CheckCircle2}
                    label={t('meetings.followUp.summarySection.completed')}
                    value={followUp.data.summary.completed}
                    tone="green"
                    onClick={() => openActionItems('DONE')}
                  />
                  <FollowUpMetricCard
                    icon={Clock3}
                    label={t('meetings.followUp.summarySection.overdue')}
                    value={followUp.data.summary.overdue}
                    tone="red"
                    onClick={() => openActionItems(undefined, 'OVERDUE')}
                  />
                  <FollowUpMetricCard
                    icon={FileCheck2}
                    label={t('meetings.followUp.summarySection.decisions')}
                    value={followUp.data.summary.decisions}
                    tone="violet"
                    onClick={() => onSectionChange?.('decisions')}
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                {isOrganizer && canCreate ? (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus aria-hidden="true" className="size-4" />
                    {t('meetings.followUp.addAction')}
                  </Button>
                ) : null}
                {followUp.data?.canManageContent ? (
                  <Button variant="outline" onClick={openDecisionCreate}>
                    <Plus aria-hidden="true" className="size-4" />
                    {t('meetings.followUp.decisions.add')}
                  </Button>
                ) : null}
                {scheduling.canSchedule ? (
                  <Button variant="outline" onClick={() => scheduling.setOpen(true)}>
                    <CalendarPlus2 aria-hidden="true" className="size-4" />
                    {t('meetings.followUp.nextMeeting.schedule')}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
            <FollowUpWorkspaceCard
              icon={ClipboardCheck}
              title={t('meetings.followUp.actionItems')}
              description={t('meetings.followUp.workspace.actionItemsPreview')}
              className="flex h-full flex-col"
              bodyClassName="flex flex-1 flex-col"
              action={
                <Button variant="outline" size="sm" onClick={openActionItemsOverview}>
                  {t('meetings.followUp.workspace.viewAll')}
                </Button>
              }
            >
              {!canCreate && isOrganizer ? (
                <p className="text-muted-foreground mb-4 rounded-xl border border-dashed p-3 text-xs leading-5">
                  {t('meetings.followUp.startsAtMeeting')}
                </p>
              ) : null}

              {actionItems.isPending ? (
                <LoadingState />
              ) : actionItems.isError ? (
                <ErrorState onRetry={() => void actionItems.refetch()} />
              ) : allItems.length === 0 ? (
                <EmptyState
                  compact
                  icon={ClipboardCheck}
                  title={t('meetings.followUp.emptyTitle')}
                  description={t('meetings.followUp.noActions')}
                />
              ) : (
                <div className="flex flex-1 flex-col">
                  <div className="space-y-2.5">
                    {overviewItems.map((item) => (
                      <ActionItemPreviewRow
                        key={item.taskId}
                        item={item}
                        showAssignee={isOrganizer}
                        onOpen={() => setTaskId(item.taskId)}
                      />
                    ))}
                  </div>
                  {allItems.length > overviewItems.length ? (
                    <Button
                      variant="ghost"
                      className="mt-auto w-full pt-4"
                      onClick={openActionItemsOverview}
                    >
                      {t('meetings.followUp.workspace.viewMoreItems', {
                        count: allItems.length - overviewItems.length,
                      })}
                    </Button>
                  ) : null}
                </div>
              )}
            </FollowUpWorkspaceCard>

            <div className="space-y-5">
              <MeetingDecisionsWorkspace
                detail={detail}
                isOrganizer={isOrganizer}
                launchRequest={decisionLaunchRequest}
                onLaunchRequestHandled={handleDecisionLaunchHandled}
                data={followUp.data}
                isPending={followUp.isPending}
                isError={followUp.isError}
                onRetry={() => void followUp.refetch()}
                mode="preview"
                onViewAll={() => onSectionChange?.('decisions')}
              />

              <MeetingNotesWorkspace
                detail={detail}
                isOrganizer={isOrganizer}
                data={followUp.data}
                isPending={followUp.isPending}
                isError={followUp.isError}
                onRetry={() => void followUp.refetch()}
                mode="preview"
                onViewAll={() => onSectionChange?.('notes')}
              />
            </div>
          </div>

          <MeetingRelatedMeetingsWorkspace
            detail={detail}
            mode="preview"
            onViewAll={() => onSectionChange?.('related-meetings')}
          />
        </>
      ) : section === 'action-items' ? (
        <div className="space-y-5">
          <FollowUpDetailHeader
            icon={ClipboardCheck}
            title={t('meetings.followUp.actionItems')}
            description={t('meetings.followUp.workspace.actionItemsDetail')}
            backLabel={t('meetings.followUp.workspace.backToOverview')}
            onBack={() => onSectionChange?.(null)}
            action={
              isOrganizer && canCreate ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden="true" className="size-4" />
                  {t('meetings.followUp.addAction')}
                </Button>
              ) : null
            }
          />

          {!canCreate && isOrganizer ? (
            <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
              {t('meetings.followUp.startsAtMeeting')}
            </p>
          ) : null}

          {actionItems.data && allItems.length > 0 ? (
            <Card className="space-y-4 border-border/70 p-4 shadow-sm sm:p-5">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
                <SummaryButton
                  active={!hasFilters}
                  value={summary.total}
                  label={t('meetings.followUp.summary.all')}
                  onClick={clearFilters}
                />
                <SummaryButton
                  active={
                    statusFilter === 'TODO' &&
                    !search &&
                    !priorityFilter &&
                    dueFilter === 'ALL' &&
                    !assigneeFilter &&
                    agendaFilter === undefined
                  }
                  value={summary.todo}
                  label={t('tasks.statuses.TODO')}
                  onClick={() => applyStatusSummary('TODO')}
                />
                <SummaryButton
                  active={
                    statusFilter === 'IN_PROGRESS' &&
                    !search &&
                    !priorityFilter &&
                    dueFilter === 'ALL' &&
                    !assigneeFilter &&
                    agendaFilter === undefined
                  }
                  value={summary.inProgress}
                  label={t('tasks.statuses.IN_PROGRESS')}
                  onClick={() => applyStatusSummary('IN_PROGRESS')}
                />
                <SummaryButton
                  active={
                    statusFilter === 'DONE' &&
                    !search &&
                    !priorityFilter &&
                    dueFilter === 'ALL' &&
                    !assigneeFilter &&
                    agendaFilter === undefined
                  }
                  value={summary.done}
                  label={t('tasks.statuses.DONE')}
                  onClick={() => applyStatusSummary('DONE')}
                />
                <SummaryButton
                  active={
                    dueFilter === 'OVERDUE' &&
                    !search &&
                    !statusFilter &&
                    !priorityFilter &&
                    !assigneeFilter &&
                    agendaFilter === undefined
                  }
                  value={summary.overdue}
                  label={t('tasks.overdue')}
                  onClick={applyOverdueSummary}
                />
              </div>

              <TaskCollectionToolbar
                searchValue={search}
                onSearchChange={setSearch}
                searchAriaLabel={t('meetings.followUp.searchLabel')}
                searchPlaceholder={t('meetings.followUp.searchPlaceholder')}
                filterButtonLabel={t('tasks.toolbar.filters')}
                filterTitle={t('meetings.followUp.filters.title')}
                filterDescription={t('meetings.followUp.filters.description')}
                filterCount={structuredFilterCount}
                filterContent={filterFields}
                clearFiltersLabel={t('tasks.toolbar.clear')}
                onClearFilters={clearStructuredFilters}
                closeLabel={t('common.close')}
                groupValue={groupBy}
                groupLabel={t('tasks.toolbar.group')}
                groupOptions={(
                  ['NONE', 'ASSIGNEE', 'STATUS', 'PRIORITY', 'AGENDA', 'DUE_DATE'] as const
                ).map((value) => ({
                  value,
                  label: t(`meetings.followUp.group.${value}`),
                }))}
                onGroupChange={(value) => setGroupBy(value as FollowUpGroupBy)}
                sortValue={sortBy}
                sortLabel={t('tasks.toolbar.sort')}
                sortOptions={(
                  ['assignedAt', 'dueDate', 'priority', 'title', 'status', 'assignee'] as const
                ).map((value) => ({
                  value,
                  label: t(`meetings.followUp.sort.${value}`),
                }))}
                onSortChange={(value) => setSortBy(value as FollowUpSortField)}
                sortDirection={sortDirection}
                onSortDirectionChange={setSortDirection}
                sortDirectionLabel={t('tasks.toolbar.sortDirection')}
                ascendingLabel={t('tasks.toolbar.ascending')}
                descendingLabel={t('tasks.toolbar.descending')}
                activeFilters={activeFilterChips}
                activeFiltersLabel={t('tasks.toolbar.active')}
              />
            </Card>
          ) : null}

          <div>
            {actionItems.isPending ? (
              <LoadingState />
            ) : actionItems.isError ? (
              <ErrorState onRetry={() => void actionItems.refetch()} />
            ) : allItems.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title={t('meetings.followUp.emptyTitle')}
                description={t('meetings.followUp.noActions')}
                {...(isOrganizer && canCreate
                  ? {
                      action: (
                        <Button onClick={() => setCreateOpen(true)}>
                          <Plus className="size-4" />
                          {t('meetings.followUp.addAction')}
                        </Button>
                      ),
                    }
                  : {})}
              />
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title={t('meetings.followUp.emptyFilteredTitle')}
                description={t('meetings.followUp.emptyFilteredDescription')}
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    {t('meetings.followUp.clearFilters')}
                  </Button>
                }
              />
            ) : (
              <TooltipProvider>
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div key={group.key} className="space-y-3">
                      <GroupHeading item={group.items[0]!} groupBy={groupBy} />
                      <ul className="space-y-3">
                        <AnimatePresence initial={false} mode="popLayout">
                          {group.items.map((item) => (
                            <motion.li
                              key={item.taskId}
                              initial={taskHubItemMotion.initial}
                              animate={taskHubItemMotion.animate}
                              exit={taskHubItemMotion.exit}
                              layout={shouldReduceMotion ? false : 'position'}
                              transition={{
                                duration: shouldReduceMotion
                                  ? 0
                                  : taskHubItemMotion.transition.duration,
                                ease: taskHubEase,
                                layout: shouldReduceMotion
                                  ? { duration: 0 }
                                  : { duration: 0.22, ease: taskHubEase },
                              }}
                            >
                              <MeetingActionTaskCard
                                item={item}
                                onOpen={() => setTaskId(item.taskId)}
                                canChangeStatus={currentUserId === item.assigneeUserId}
                                completionBlockedMessage={
                                  isOrganizer && currentUserId !== item.assigneeUserId
                                    ? t('meetings.followUp.onlyAssigneeCanComplete', {
                                        name: item.assigneeName,
                                      })
                                    : undefined
                                }
                                statusPending={statusMutation.isPending}
                                onStatusChange={(nextStatus) => changeStatus(item, nextStatus)}
                                showAssignee={isOrganizer}
                                actionMenu={
                                  isOrganizer && item.status !== 'CANCELLED' ? (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          aria-label={t('meetings.followUp.moreActions')}
                                        >
                                          <Ellipsis className="size-4" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent align="end" className="w-48 p-1">
                                        <button
                                          type="button"
                                          className="hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm outline-none"
                                          onClick={() => openReassign(item)}
                                        >
                                          <UserRound className="size-4" />
                                          {t('meetings.followUp.reassign')}
                                        </button>
                                        <button
                                          type="button"
                                          className="hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm outline-none"
                                          onClick={() => setTaskId(item.taskId)}
                                        >
                                          <ClipboardCheck className="size-4" />
                                          {t('meetings.followUp.openDetails')}
                                        </button>
                                      </PopoverContent>
                                    </Popover>
                                  ) : null
                                }
                              />
                            </motion.li>
                          ))}
                        </AnimatePresence>
                      </ul>
                    </div>
                  ))}
                </div>
              </TooltipProvider>
            )}
          </div>
        </div>
      ) : section === 'decisions' ? (
        <MeetingDecisionsWorkspace
          detail={detail}
          isOrganizer={isOrganizer}
          launchRequest={decisionLaunchRequest}
          onLaunchRequestHandled={handleDecisionLaunchHandled}
          data={followUp.data}
          isPending={followUp.isPending}
          isError={followUp.isError}
          onRetry={() => void followUp.refetch()}
          mode="detail"
          onBack={() => onSectionChange?.(null)}
        />
      ) : section === 'notes' ? (
        <MeetingNotesWorkspace
          detail={detail}
          isOrganizer={isOrganizer}
          data={followUp.data}
          isPending={followUp.isPending}
          isError={followUp.isError}
          onRetry={() => void followUp.refetch()}
          mode="detail"
          onBack={() => onSectionChange?.(null)}
        />
      ) : (
        <MeetingRelatedMeetingsWorkspace
          detail={detail}
          mode="detail"
          onBack={() => onSectionChange?.(null)}
        />
      )}

      <ScheduleFollowUpMeetingDialog
        detail={detail}
        open={scheduling.open}
        onOpenChange={scheduling.setOpen}
        mode={scheduling.mode}
        initialValues={scheduling.initialValues}
      />

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!createMutation.isPending) {
            setCreateOpen(open)
            if (!open) resetCreateForm()
          }
        }}
      >
        <DialogContent
          variant="modal"
          closeLabel={t('common.close')}
          className="w-[min(38rem,calc(100vw-2rem))] max-w-none"
        >
          <div className="flex items-start gap-3 pe-10">
            <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
              <Plus className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle>{t('meetings.followUp.newAction')}</DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1 max-w-lg text-sm leading-6">
                {t('meetings.followUp.newActionDescription')}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="meeting-action-title" className="text-sm font-medium">
                {t('meetings.followUp.taskTitle')}
                <span className="text-destructive ms-1" aria-hidden="true">
                  *
                </span>
              </label>
              <Input
                id="meeting-action-title"
                autoFocus
                maxLength={1000}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t('meetings.followUp.assignTo')}
                <span className="text-destructive ms-1" aria-hidden="true">
                  *
                </span>
              </label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder={t('meetings.followUp.assignTo')}>
                    {selectedAssignee ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-full">
                          <UserRound aria-hidden="true" className="size-3.5" />
                        </span>
                        <span className="truncate">{selectedAssignee.userName}</span>
                      </span>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {assignees.isPending ? (
                    <SelectItem value="__LOADING__" disabled>
                      {t('common.loading')}
                    </SelectItem>
                  ) : assignees.data?.length ? (
                    assignees.data.map((option) => (
                      <SelectItem
                        key={option.userId}
                        value={String(option.userId)}
                        textValue={option.userName}
                        disabled={!option.eligible}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-full">
                            <UserRound aria-hidden="true" className="size-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{option.userName}</span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {option.userCode}
                              {!option.eligible
                                ? ` · ${t('meetings.followUp.noTaskHubAccess')}`
                                : ''}
                            </span>
                          </span>
                        </span>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__EMPTY__" disabled>
                      {t('meetings.followUp.noEligibleAssignees')}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {hasNoEligibleAssignees ? (
                <p className="border-warning/25 bg-warning/10 text-warning-foreground rounded-lg border px-3 py-2 text-xs leading-5">
                  {t('meetings.followUp.noEligibleAssigneesDescription')}
                </p>
              ) : null}
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('tasks.priority')}</label>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value as typeof priority)}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue>
                      <TaskPriorityIndicator priority={priority} pill />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW" textValue={t('tasks.priorities.LOW')}>
                      <TaskPriorityIndicator priority="LOW" />
                    </SelectItem>
                    <SelectItem value="MEDIUM" textValue={t('tasks.priorities.MEDIUM')}>
                      <TaskPriorityIndicator priority="MEDIUM" />
                    </SelectItem>
                    <SelectItem value="HIGH" textValue={t('tasks.priorities.HIGH')}>
                      <TaskPriorityIndicator priority="HIGH" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t('tasks.dueDate')}
                  <span className="text-muted-foreground ms-1 text-xs font-normal">
                    · {t('meetings.followUp.optional')}
                  </span>
                </label>
                <DatePicker value={dueDate} onChange={setDueDate} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t('meetings.followUp.relatedAgenda')}
                <span className="text-muted-foreground ms-1 text-xs font-normal">
                  · {t('meetings.followUp.optional')}
                </span>
              </label>
              <Select value={agenda} onValueChange={setAgenda}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder={t('meetings.followUp.relatedAgenda')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{t('common.none')}</SelectItem>
                  {detail.agendaItems.length === 0 ? (
                    <SelectItem value="__NO_AGENDA__" disabled>
                      {t('meetings.followUp.noAgendaTopics')}
                    </SelectItem>
                  ) : (
                    detail.agendaItems.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.topic}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="meeting-action-description" className="text-sm font-medium">
                {t('meetings.followUp.description')}
                <span className="text-muted-foreground ms-1 text-xs font-normal">
                  · {t('meetings.followUp.optional')}
                </span>
              </label>
              <Textarea
                id="meeting-action-description"
                rows={3}
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                disabled={createMutation.isPending}
                onClick={() => {
                  setCreateOpen(false)
                  resetCreateForm()
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                disabled={
                  createMutation.isPending ||
                  !title.trim() ||
                  !assignee ||
                  eligibleAssignees.length === 0
                }
                onClick={submitCreate}
              >
                {t('meetings.followUp.createAction')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reassignItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReassignItem(null)
            setReassignAssignee('')
          }
        }}
      >
        <DialogContent variant="modal" closeLabel={t('common.close')}>
          <DialogTitle>{t('meetings.followUp.reassignTitle')}</DialogTitle>
          <DialogDescription className="mt-1">
            {t('meetings.followUp.reassignDescription')}
          </DialogDescription>
          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('meetings.followUp.assignTo')}</label>
              <Select value={reassignAssignee} onValueChange={setReassignAssignee}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder={t('meetings.followUp.assignTo')}>
                    {selectedReassignAssignee ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-full">
                          <UserRound aria-hidden="true" className="size-3.5" />
                        </span>
                        <span className="truncate">{selectedReassignAssignee.userName}</span>
                      </span>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {assignees.isPending ? (
                    <SelectItem value="__LOADING__" disabled>
                      {t('common.loading')}
                    </SelectItem>
                  ) : assignees.data?.length ? (
                    assignees.data.map((option) => (
                      <SelectItem
                        key={option.userId}
                        value={String(option.userId)}
                        textValue={option.userName}
                        disabled={!option.eligible}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-full">
                            <UserRound aria-hidden="true" className="size-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{option.userName}</span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {option.userCode}
                              {!option.eligible
                                ? ` · ${t('meetings.followUp.noTaskHubAccess')}`
                                : ''}
                            </span>
                          </span>
                        </span>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__EMPTY__" disabled>
                      {t('meetings.followUp.noEligibleAssignees')}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {hasNoEligibleAssignees ? (
                <p className="border-warning/25 bg-warning/10 text-warning-foreground rounded-lg border px-3 py-2 text-xs leading-5">
                  {t('meetings.followUp.noEligibleAssigneesDescription')}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReassignItem(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={
                  reassignMutation.isPending ||
                  !reassignAssignee ||
                  Number(reassignAssignee) === reassignItem?.assigneeUserId
                }
                onClick={submitReassign}
              >
                {t('meetings.followUp.reassign')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TaskDetailsDrawer taskId={taskId} onOpenChange={(open) => !open && setTaskId(null)} />
    </div>
  )
}





