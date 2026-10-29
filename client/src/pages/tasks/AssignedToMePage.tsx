import { useQuery } from '@tanstack/react-query'
import { Circle } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { TablePagination } from '@/components/shared/TablePagination'
import {
  AnimatedFetching,
  AnimatedState,
  taskHubEase,
  taskHubItemMotion,
} from '@/components/shared/TaskHubMotion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useGeneralAssignedTasks } from '@/features/tasks/assignment/use-general-assignment'
import type { GeneralAssignedTask } from '@/features/tasks/assignment/general-assignment.api'
import { MeetingActionTaskCard } from '@/features/meetings/action-items/MeetingActionTaskCard'
import {
  useAssignedMeetingActionItems,
} from '@/features/meetings/action-items/use-meeting-action-items'
import type {
  AssignedActionItemDueFilter,
  AssignedActionItemGroupBy,
  AssignedActionItemSortField,
  MeetingActionItem,
} from '@/features/meetings/action-items/meeting-action-items.types'
import { TaskCollectionToolbar } from '@/features/tasks/components/TaskCollectionToolbar'
import { TaskTypeFilterSelect } from '@/features/tasks/components/TaskTypeFilterSelect'
import { TaskDetailsDrawer } from '@/features/tasks/components/TaskDetailsDrawer'
import { discussionApi } from '@/features/tasks/discussions/discussions.api'
import { DiscussionShortcut } from '@/features/tasks/discussions/DiscussionShortcut'
import {
  TaskDueIndicator,
  TaskPriorityIndicator,
} from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import { TaskTags } from '@/features/tasks/tags/TaskTags'
import { TaskTagFilter } from '@/features/tasks/tags/TaskTagFilter'
import { TaskTeamIndicator } from '@/features/tasks/components/TaskTeamIndicator'
import { TaskCardLayout } from '@/features/tasks/components/TaskCardLayout'
import { useChangeTaskStatus } from '@/features/tasks/hooks/use-tasks'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import {
  TASK_DUE_FILTERS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/features/tasks/types/task.types'
import type { TaskPriority, TaskStatus, TaskTypeFilter } from '@/features/tasks/types/task.types'
import { parseDateOnly } from '@/lib/date-only'
import { cn } from '@/lib/cn'
import { taskStatusErrorKey, taskStatusToastId } from '@/features/tasks/status/task-status-error'

const ALL = 'ALL'


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

function groupKey(item: MeetingActionItem, groupBy: AssignedActionItemGroupBy) {
  if (groupBy === 'MEETING') return `meeting:${item.meetingId}`
  if (groupBy === 'DUE_DATE') return `due:${item.dueDate ?? 'none'}`
  if (groupBy === 'PRIORITY') return `priority:${item.priority}`
  if (groupBy === 'STATUS') return `status:${item.status}`
  return 'all'
}

function GroupHeading({ item, groupBy }: { item: MeetingActionItem; groupBy: AssignedActionItemGroupBy }) {
  const { i18n, t } = useTranslation()
  if (groupBy === 'NONE') return null

  let label = ''
  if (groupBy === 'MEETING') label = item.meetingTitle
  if (groupBy === 'PRIORITY') label = t(`tasks.priorities.${item.priority}`)
  if (groupBy === 'STATUS') label = t(`tasks.statuses.${item.status}`)
  if (groupBy === 'DUE_DATE') {
    const date = item.dueDate ? parseDateOnly(item.dueDate) : null
    label = date
      ? date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })
      : t('tasks.noDueDate')
  }

  return (
    <div className="text-muted-foreground flex items-center gap-3 pt-2 text-xs font-semibold uppercase tracking-wide">
      <span>{label}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}

export function AssignedToMePage() {
  const { t, i18n } = useTranslation()
  const currentUser = useCurrentUser()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const shouldReduceMotion = useReducedMotion()
  const [source, setSource] = useState<'ALL' | 'MEETING' | 'GENERAL'>('ALL')
  const [generalPage, setGeneralPage] = useState(1)
  const [search, setSearch] = useState('')
  const [meetingId, setMeetingId] = useState<number | undefined>()
  const [status, setStatus] = useState<TaskStatus | undefined>()
  const [priority, setPriority] = useState<TaskPriority | undefined>()
  const [taskType, setTaskType] = useState<TaskTypeFilter>('ALL')
  const [tagIds,setTagIds]=useState<number[]>([])
  const [tagMatch,setTagMatch]=useState<'ANY'|'ALL'|'UNTAGGED'>('ANY')
  const [due, setDue] = useState<AssignedActionItemDueFilter>('ALL')
  const [sortBy, setSortBy] = useState<AssignedActionItemSortField>('assignedAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [groupBy, setGroupBy] = useState<AssignedActionItemGroupBy>('NONE')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [taskId, setTaskId] = useState<number | null>(null)

  const query = useAssignedMeetingActionItems({
    page,
    pageSize,
    search,
    ...(meetingId ? { meetingId } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    due,
    taskType,...(tagIds.length ? {tagIds:tagIds.join(',')} : {}),tagMatch,
    sortBy,
    sortDirection,
    groupBy,
  })
  const generalQuery = useGeneralAssignedTasks({
    page: generalPage, pageSize, search,
    ...(status ? {status} : {}), ...(priority ? {priority} : {}),
    due, taskType,...(tagIds.length ? {tagIds:tagIds.join(',')} : {}),tagMatch, sortBy: sortBy === 'meeting' ? 'assignedAt' : sortBy,
    sortDirection,
  }, source !== 'MEETING')
  const unreadIds = [...new Set([...(query.data?.items??[]).map(item=>item.taskId),
    ...(generalQuery.data?.items??[]).map(item=>item.taskId)])].slice(0,75)
  const unreadIdsKey=unreadIds.join(',')
  const unreadQuery=useQuery({queryKey:['discussions','assigned-cards',unreadIdsKey],
    queryFn:()=>discussionApi.unread(unreadIds),enabled:unreadIds.length>0,
    refetchInterval:15000,staleTime:5000})
  function openTaskDiscussion(id: number, subtaskId?: number) {
    setTaskId(id)
    const next = new URLSearchParams(searchParams)
    next.set('taskId', String(id))
    next.set('discussion', '1')
    if (subtaskId) next.set('subtaskId', String(subtaskId))
    else next.delete('subtaskId')
    setSearchParams(next, { replace: true })
  }
  const statusMutation = useChangeTaskStatus()
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasFilters = Boolean(search || meetingId || status || priority || due !== 'ALL' || taskType !== 'ALL' || tagIds.length>0 || tagMatch==='UNTAGGED')

  const groups = useMemo(() => {
    const items = query.data?.items ?? []
    if (groupBy === 'NONE') return [{ key: 'all', items }]
    const result: Array<{ key: string; items: MeetingActionItem[] }> = []
    for (const item of items) {
      const key = groupKey(item, groupBy)
      const current = result[result.length - 1]
      if (!current || current.key !== key) result.push({ key, items: [item] })
      else current.items.push(item)
    }
    return result
  }, [groupBy, query.data?.items])

  useEffect(() => {
    const raw = Number(searchParams.get('taskId'))
    if (Number.isSafeInteger(raw) && raw > 0) setTaskId(raw)
  }, [searchParams])

  function resetPageAnd(action: () => void) {
    setGeneralPage(1)
    setPage(1)
    action()
  }

  function clearStructuredFilters() {
    setPage(1)
    setGeneralPage(1)
    setMeetingId(undefined)
    setStatus(undefined)
    setPriority(undefined)
    setTaskType('ALL')
    setTagIds([])
    setTagMatch('ANY')
    setDue('ALL')
  }

  function clearFilters() {
    setSearch('')
    clearStructuredFilters()
  }

  function applyStatusSummary(nextStatus: TaskStatus) {
    const shouldClear = status === nextStatus && !search && !meetingId && !priority && due === 'ALL'
    clearFilters()
    setStatus(shouldClear ? undefined : nextStatus)
  }

  function applyOverdueSummary() {
    const shouldClear = due === 'OVERDUE' && !search && !meetingId && !priority && !status
    clearFilters()
    setDue(shouldClear ? 'ALL' : 'OVERDUE')
  }

  function openTask(id: number) {
    setTaskId(id)
    const next = new URLSearchParams(searchParams)
    next.set('taskId', String(id))
    setSearchParams(next, { replace: true })
  }

  function closeTask() {
    setTaskId(null)
    const next = new URLSearchParams(searchParams)
    next.delete('taskId')
    next.delete('subtaskId')
    next.delete('discussion')
    setSearchParams(next, { replace: true })
  }

  function changeStatus(task: MeetingActionItem, nextStatus: TaskStatus) {
    statusMutation.mutate(
      { taskId: task.taskId, status: nextStatus },
      {
        onSuccess: () => toast.success(t('tasks.statusUpdated')),
        onError: error => toast.error(t(taskStatusErrorKey(error)), { id: taskStatusToastId(task.taskId) }),
      },
    )
  }

  const structuredFilterCount =
    Number(Boolean(meetingId)) +
    Number(Boolean(status)) +
    Number(Boolean(priority)) +
    Number(taskType !== 'ALL') +
    Number(tagIds.length>0 || tagMatch==='UNTAGGED') +
    Number(due !== 'ALL')

  const selectedMeetingTitle = meetingId
    ? query.data?.meetings.find((item) => item.meetingId === meetingId)?.meetingTitle ?? ''
    : ''

  const activeFilterChips = [
    ...(meetingId
      ? [{
          key: 'meeting',
          label: `${t('tasks.assignedToMe.filters.meeting')}: ${selectedMeetingTitle}`,
          onRemove: () => resetPageAnd(() => setMeetingId(undefined)),
          removeLabel: t('tasks.toolbar.removeFilter', {
            filter: `${t('tasks.assignedToMe.filters.meeting')}: ${selectedMeetingTitle}`,
          }),
        }]
      : []),
    ...(status
      ? [{
          key: 'status',
          label: `${t('tasks.assignedToMe.filters.status')}: ${t(`tasks.statuses.${status}`)}`,
          onRemove: () => resetPageAnd(() => setStatus(undefined)),
          removeLabel: t('tasks.toolbar.removeFilter', {
            filter: `${t('tasks.assignedToMe.filters.status')}: ${t(`tasks.statuses.${status}`)}`,
          }),
        }]
      : []),
    ...(taskType !== 'ALL'
      ? [{
          key: 'taskType',
          label: `${t('tasks.taskTypeFilter.label')}: ${t(`tasks.taskTypeFilter.${taskType}`)}`,
          onRemove: () => resetPageAnd(() => setTaskType('ALL')),
          removeLabel: t('tasks.toolbar.removeFilter', { filter: t(`tasks.taskTypeFilter.${taskType}`) }),
        }]
      : []),
    ...(tagIds.length>0 || tagMatch==='UNTAGGED'
      ? [{key:'tags',label:`${t('tags.filter')}: ${tagMatch==='UNTAGGED'?t('tags.untagged'):`${tagIds.length} (${tagMatch})`}`,
          onRemove:()=>resetPageAnd(()=>{setTagIds([]);setTagMatch('ANY')}),
          removeLabel:t('tasks.toolbar.removeFilter',{filter:t('tags.filter')})}]
      : []),
    ...(priority
      ? [{
          key: 'priority',
          label: `${t('tasks.assignedToMe.filters.priority')}: ${t(`tasks.priorities.${priority}`)}`,
          onRemove: () => resetPageAnd(() => setPriority(undefined)),
          removeLabel: t('tasks.toolbar.removeFilter', {
            filter: `${t('tasks.assignedToMe.filters.priority')}: ${t(`tasks.priorities.${priority}`)}`,
          }),
        }]
      : []),
    ...(due !== 'ALL'
      ? [{
          key: 'due',
          label: `${t('tasks.assignedToMe.filters.due')}: ${t(`tasks.dueFilters.${due}`)}`,
          onRemove: () => resetPageAnd(() => setDue('ALL')),
          removeLabel: t('tasks.toolbar.removeFilter', {
            filter: `${t('tasks.assignedToMe.filters.due')}: ${t(`tasks.dueFilters.${due}`)}`,
          }),
        }]
      : []),
  ]

  const filterFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      {source !== 'GENERAL' ? <div className="space-y-1.5 sm:col-span-2">
        <label className="text-muted-foreground text-xs font-medium">
          {t('tasks.assignedToMe.filters.meeting')}
        </label>
        <Select
          value={meetingId ? String(meetingId) : ALL}
          onValueChange={(value) =>
            resetPageAnd(() => { setMeetingId(value === ALL ? undefined : Number(value)); if (value !== ALL) setSource('MEETING') })
          }
        >
          <SelectTrigger className="h-10 min-w-0" aria-label={t('tasks.assignedToMe.filters.meeting')}>
            <SelectValue>
              <span className="block min-w-0 truncate">
                {selectedMeetingTitle || t('tasks.toolbar.all')}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('tasks.toolbar.all')}</SelectItem>
            {query.data?.meetings.map((meeting) => (
              <SelectItem key={meeting.meetingId} value={String(meeting.meetingId)}>
                <span className="block max-w-[28rem] truncate">{meeting.meetingTitle}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div> : null}

      <div className="min-w-0 space-y-1.5">
        <label className="block text-muted-foreground text-xs font-medium">{t('tasks.taskTypeFilter.label')}</label>
        <TaskTypeFilterSelect value={taskType} onChange={value => resetPageAnd(() => setTaskType(value))} />
      </div>


      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {t('tasks.assignedToMe.filters.priority')}
        </label>
        <Select
          value={priority ?? ALL}
          onValueChange={(value) =>
            resetPageAnd(() => setPriority(value === ALL ? undefined : (value as TaskPriority)))
          }
        >
          <SelectTrigger className="h-10 min-w-0">
            <SelectValue>
              {priority ? <TaskPriorityIndicator priority={priority} pill /> : <span>{t('tasks.toolbar.all')}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('tasks.toolbar.all')}</SelectItem>
            {TASK_PRIORITIES.map((value) => (
              <SelectItem key={value} value={value}>
                <TaskPriorityIndicator priority={value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {t('tasks.assignedToMe.filters.status')}
        </label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) =>
            resetPageAnd(() => setStatus(value === ALL ? undefined : (value as TaskStatus)))
          }
        >
          <SelectTrigger className="h-10 min-w-0">
            <SelectValue>
              {status ? <TaskStatusIndicator status={status} pill /> : <span>{t('tasks.toolbar.all')}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('tasks.toolbar.all')}</SelectItem>
            {TASK_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                <TaskStatusIndicator status={value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>


      <div className="min-w-0 space-y-1.5">
        <label className="block text-muted-foreground text-xs font-medium">{t('tags.filter')}</label>
        <TaskTagFilter value={tagIds} onChange={ids => resetPageAnd(() => setTagIds(ids))}
          match={tagMatch} onMatchChange={value => resetPageAnd(() => setTagMatch(value))} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-muted-foreground text-xs font-medium">
          {t('tasks.assignedToMe.filters.due')}
        </label>
        <Select
          value={due}
          onValueChange={(value) =>
            resetPageAnd(() => setDue(value as AssignedActionItemDueFilter))
          }
        >
          <SelectTrigger className="h-10 min-w-0">
            <SelectValue>
              {due === 'ALL' ? <span>{t('tasks.toolbar.all')}</span> : <TaskDueIndicator due={due} pill />}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('tasks.toolbar.all')}</SelectItem>
            {TASK_DUE_FILTERS.filter((value) => value !== 'ALL').map((value) => (
              <SelectItem key={value} value={value}>
                <TaskDueIndicator due={value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  const groupedGeneral = useMemo(() => {
    const rows = generalQuery.data?.items ?? []
    if (groupBy === 'NONE' || groupBy === 'MEETING') return [{ key: 'all', rows }]
    const groups = new Map<string, GeneralAssignedTask[]>()
    for (const row of rows) {
      const key = groupBy === 'STATUS' ? row.status
        : groupBy === 'PRIORITY' ? row.priority : row.dueDate ?? 'NO_DATE'
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return Array.from(groups, ([key, grouped]) => ({key,rows:grouped}))
  }, [generalQuery.data?.items, groupBy])

  const resultsState = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : query.data.items.length === 0
        ? 'empty'
        : 'content'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('tasks.assignedToMe.eyebrow')}
        title={t('tasks.assignedToMe.title')}
        description={t('tasks.assignedToMe.description')}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('tasks.assignment.source')}>
        {(['ALL','MEETING','GENERAL'] as const).map(value => <Button key={value}
          variant={source === value ? 'default' : 'outline'}
          aria-pressed={source === value}
          onClick={() => { setSource(value); setPage(1); setGeneralPage(1); setMeetingId(undefined); setGroupBy('NONE'); setSortBy('assignedAt') }}>
          {t(`tasks.assignment.source${value}`)}
        </Button>)}
      </div>

      {source === 'MEETING' && query.data ? (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-5">
          <SummaryButton
            active={!hasFilters}
            value={query.data.summary.total}
            label={t('tasks.assignedToMe.summary.all')}
            onClick={clearFilters}
          />
          <SummaryButton
            active={status === 'TODO' && !search && !meetingId && !priority && due === 'ALL'}
            value={query.data.summary.todo}
            label={t('tasks.statuses.TODO')}
            onClick={() => applyStatusSummary('TODO')}
          />
          <SummaryButton
            active={status === 'IN_PROGRESS' && !search && !meetingId && !priority && due === 'ALL'}
            value={query.data.summary.inProgress}
            label={t('tasks.statuses.IN_PROGRESS')}
            onClick={() => applyStatusSummary('IN_PROGRESS')}
          />
          <SummaryButton
            active={status === 'DONE' && !search && !meetingId && !priority && due === 'ALL'}
            value={query.data.summary.done}
            label={t('tasks.statuses.DONE')}
            onClick={() => applyStatusSummary('DONE')}
          />
          <SummaryButton
            active={due === 'OVERDUE' && !search && !meetingId && !priority && !status}
            value={query.data.summary.overdue}
            label={t('tasks.overdue')}
            onClick={applyOverdueSummary}
          />
        </div>
      ) : null}

      <TaskCollectionToolbar
        searchValue={search}
        onSearchChange={(value) => resetPageAnd(() => setSearch(value))}
        searchAriaLabel={t('tasks.assignedToMe.searchLabel')}
        searchPlaceholder={t('tasks.assignedToMe.searchPlaceholder')}
        filterButtonLabel={t('tasks.toolbar.filters')}
        filterTitle={t('tasks.toolbar.filterTitle')}
        filterDescription={t('tasks.toolbar.filterDescription')}
        filterCount={structuredFilterCount}
        filterContent={filterFields}
        clearFiltersLabel={t('tasks.toolbar.clear')}
        onClearFilters={clearStructuredFilters}
        closeLabel={t('common.close')}
        groupValue={groupBy}
        groupLabel={t('tasks.toolbar.group')}
        groupOptions={(['NONE', ...(source === 'GENERAL' ? [] : ['MEETING']), 'DUE_DATE', 'PRIORITY', 'STATUS'] as const).map((value) => ({
          value,
          label: t(`tasks.assignedToMe.group.${value}`),
        }))}
        onGroupChange={(value) =>
          resetPageAnd(() => setGroupBy(value as AssignedActionItemGroupBy))
        }
        sortValue={sortBy}
        sortLabel={t('tasks.toolbar.sort')}
        sortOptions={(['assignedAt', 'dueDate', 'priority', 'title', 'status', ...(source === 'GENERAL' ? [] : ['meeting'])] as const).map((value) => ({
          value,
          label: t(`tasks.assignedToMe.sort.${value}`),
        }))}
        onSortChange={(value) =>
          resetPageAnd(() => setSortBy(value as AssignedActionItemSortField))
        }
        sortDirection={sortDirection}
        onSortDirectionChange={(direction) => {
          setPage(1)
          setGeneralPage(1)
          setSortDirection(direction)
        }}
        sortDirectionLabel={t('tasks.toolbar.sortDirection')}
        ascendingLabel={t('tasks.toolbar.ascending')}
        descendingLabel={t('tasks.toolbar.descending')}
        activeFilters={activeFilterChips}
        activeFiltersLabel={t('tasks.toolbar.active')}
      />

      {source !== 'GENERAL' ? <>
        {source === 'ALL' ? <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('tasks.assignment.sourceMEETING')}</h2>
          <span className="text-muted-foreground text-xs">{query.data?.total ?? 0}</span>
        </div> : null}
      <AnimatedState stateKey={resultsState}>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={Circle}
            title={t(hasFilters ? 'tasks.assignedToMe.emptyFilteredTitle' : 'tasks.assignedToMe.emptyTitle')}
            description={t(hasFilters ? 'tasks.assignedToMe.emptyFilteredDescription' : 'tasks.assignedToMe.emptyDescription')}
            {...(hasFilters
              ? { action: <Button variant="outline" onClick={clearFilters}>{t('tasks.assignedToMe.clearFilters')}</Button> }
              : {})}
          />
        ) : (
          <AnimatedFetching busy={query.isPlaceholderData}>
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
                              duration: shouldReduceMotion ? 0 : taskHubItemMotion.transition.duration,
                              ease: taskHubEase,
                              layout: shouldReduceMotion
                                ? { duration: 0 }
                                : { duration: 0.22, ease: taskHubEase },
                            }}
                          >
                            <MeetingActionTaskCard
                              item={item}
                              onOpen={() => openTask(item.taskId)}
                              canChangeStatus={item.assigneeUserId === currentUser.data?.user.userId}
                              statusPending={statusMutation.isPending}
                              onStatusChange={(nextStatus) => changeStatus(item, nextStatus)}
                              showMeeting
                              onOpenMeeting={() => navigate(`/meetings/${item.meetingId}`)}
                              showAssignedBy
                              actionMenu={<DiscussionShortcut
                                available={item.assigneeUserId === currentUser.data?.user.userId ||
                                  item.teamRoster?.some(member => member.userId === currentUser.data?.user.userId) === true ||
                                  Object.hasOwn(unreadQuery.data ?? {}, item.taskId)}
                                unread={unreadQuery.data?.[item.taskId] ?? 0}
                                onOpen={() => openTaskDiscussion(item.taskId)} />}
                            />
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </div>
                ))}

                <Card className="overflow-hidden p-0">
                  <TablePagination
                    page={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    startRow={total === 0 ? 0 : (page - 1) * pageSize + 1}
                    endRow={Math.min(page * pageSize, total)}
                    totalRows={total}
                    pageSizes={[10, 20, 50]}
                    onPageChange={setPage}
                    onPageSizeChange={(value) => {
                      setPageSize(value)
                      setPage(1)
                      setGeneralPage(1)
                    }}
                  />
                </Card>
              </div>
            </TooltipProvider>
          </AnimatedFetching>
        )}
      </AnimatedState>
      </> : null}

      {source !== 'MEETING' ? <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('tasks.assignment.sourceGENERAL')}</h2>
          <span className="text-muted-foreground text-xs">{generalQuery.data?.total ?? 0}</span>
        </div>
        {generalQuery.isPending ? <LoadingState /> : generalQuery.isError ? (
          <ErrorState onRetry={() => void generalQuery.refetch()} />
        ) : generalQuery.data?.items.length === 0 ? (
          <EmptyState icon={Circle}
            title={t('tasks.assignment.noGeneralTasks')}
            description={t('tasks.assignment.noGeneralTasksHelp')} />
        ) : <>
          <div className="space-y-4">
            {groupedGeneral.map(group => <div key={group.key} className="space-y-3">
              {groupBy !== 'NONE' && groupBy !== 'MEETING' ? <h3 className="text-muted-foreground text-xs font-semibold uppercase">
                {groupBy === 'STATUS' ? t(`tasks.statuses.${group.key}`) :
                 groupBy === 'PRIORITY' ? t(`tasks.priorities.${group.key}`) :
                group.key === 'NO_DATE' ? t('tasks.noDueDate') :
                (parseDateOnly(group.key)?.toLocaleDateString(i18n.language, {day:'numeric',month:'short',year:'numeric'}) ?? group.key)}
              </h3> : null}
              <ul className="space-y-3">
            {group.rows.map((item: GeneralAssignedTask) => (
              <li key={item.taskId}>
                <div role="button" tabIndex={0}
                  className={cn('hover:border-primary/35 focus-visible:ring-primary relative w-full cursor-pointer rounded-xl border border-s-[3px] p-4 text-start shadow-sm focus-visible:ring-2 focus-visible:outline-none sm:p-5',
                    item.teamTask ? 'border-primary/25 border-s-primary/70 bg-primary/[0.025]' : item.teamRoster?.length ? 'border-s-muted-foreground/35 bg-card' : 'border-s-transparent bg-card')}
                  onClick={() => openTask(item.taskId)}
                  onKeyDown={event => {if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault();openTask(item.taskId) }}}>
                  <TaskCardLayout
                    title={<div className="min-w-0 space-y-1">
                      <strong className="block break-words text-base">{item.title}</strong>
                      <p className="text-muted-foreground text-xs">{t('tasks.assignment.createdBy', { name: item.creatorName })}</p>
                    </div>}
                    tags={item.tags?.length ? <TaskTags tags={item.tags} /> : null}
                    details={<>
                  {(item.teamRoster?.length || item.teamTask) ? <TaskTeamIndicator
                    summary={item} subtaskTotal={item.subtaskTotal} subtaskCompleted={item.subtaskCompleted}
                    className="" /> : null}
                  {item.teamTask ? <p className="text-muted-foreground text-xs">{t('tasks.teamCards.myPart')}</p> : null}
                  {item.assignedSubtasks.length ? <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-semibold">{t('tasks.assignment.yourSubtasks')}</p>
                    {item.assignedSubtasks.map(child => <div className="flex items-start gap-2 text-sm" key={child.id}>
                      {child.isCompleted ? <span className="text-success">✓</span> : <Circle className="text-muted-foreground mt-0.5 size-3.5" />}
                      <span className="min-w-0 break-words">{child.title}</span>
                    </div>)}
                  </div> : null}
                    </>}
                    metadata={<>
                      <TaskStatusIndicator status={item.status} pill />
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>{item.isProxy ? t('tasks.proxy.badge') : item.isMainAssignee ? t('tasks.assignment.mainAssignee') : t('tasks.assignment.subtaskAssignee')}</span>
                    <span>{t('tasks.assignment.progressCounts', {completed:item.subtaskCompleted,total:item.subtaskTotal})}</span>
                  </div>                    </>}
                    actions={<DiscussionShortcut
                      available={item.isMainAssignee || item.assignedSubtasks.length > 0 || item.teamTask === true}
                      unread={unreadQuery.data?.[item.taskId] ?? 0}
                      onOpen={() => openTaskDiscussion(item.taskId,
                        !item.isMainAssignee ? item.assignedSubtasks[0]?.id : undefined)}
                    />}
                  />
                </div>
              </li>
            ))}
              </ul>
            </div>)}
          </div>
          <Card className="overflow-hidden p-0">
            <TablePagination page={generalPage}
              totalPages={Math.max(1,Math.ceil((generalQuery.data?.total ?? 0)/pageSize))}
              pageSize={pageSize} totalRows={generalQuery.data?.total ?? 0}
              startRow={(generalPage-1)*pageSize+1}
              endRow={Math.min(generalPage*pageSize,generalQuery.data?.total ?? 0)}
              pageSizes={[10,20,50]} onPageChange={setGeneralPage}
              onPageSizeChange={value => {setPageSize(value);setGeneralPage(1);setPage(1)}} />
          </Card>
        </>}
      </div> : null}

      <TaskDetailsDrawer taskId={taskId}
        focusSubtaskId={Number(searchParams.get('subtaskId')) > 0 ? Number(searchParams.get('subtaskId')) : null}
        onOpenChange={(open) => !open && closeTask()} />
    </div>
  )
}





