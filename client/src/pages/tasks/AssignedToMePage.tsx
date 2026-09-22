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
import { cn } from '@/lib/cn'

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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const shouldReduceMotion = useReducedMotion()
  const [search, setSearch] = useState('')
  const [meetingId, setMeetingId] = useState<number | undefined>()
  const [status, setStatus] = useState<TaskStatus | undefined>()
  const [priority, setPriority] = useState<TaskPriority | undefined>()
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
    sortBy,
    sortDirection,
    groupBy,
  })
  const statusMutation = useChangeTaskStatus()
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasFilters = Boolean(search || meetingId || status || priority || due !== 'ALL')

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
    setPage(1)
    action()
  }

  function clearStructuredFilters() {
    setPage(1)
    setMeetingId(undefined)
    setStatus(undefined)
    setPriority(undefined)
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
    setSearchParams(next, { replace: true })
  }

  function changeStatus(task: MeetingActionItem, nextStatus: TaskStatus) {
    statusMutation.mutate(
      { taskId: task.taskId, status: nextStatus },
      {
        onSuccess: () => toast.success(t('tasks.statusUpdated')),
        onError: () => toast.error(t('tasks.errors.status')),
      },
    )
  }

  const structuredFilterCount =
    Number(Boolean(meetingId)) +
    Number(Boolean(status)) +
    Number(Boolean(priority)) +
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
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-muted-foreground text-xs font-medium">
          {t('tasks.assignedToMe.filters.meeting')}
        </label>
        <Select
          value={meetingId ? String(meetingId) : ALL}
          onValueChange={(value) =>
            resetPageAnd(() => setMeetingId(value === ALL ? undefined : Number(value)))
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

      {query.data ? (
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
        groupOptions={(['NONE', 'MEETING', 'DUE_DATE', 'PRIORITY', 'STATUS'] as const).map((value) => ({
          value,
          label: t(`tasks.assignedToMe.group.${value}`),
        }))}
        onGroupChange={(value) =>
          resetPageAnd(() => setGroupBy(value as AssignedActionItemGroupBy))
        }
        sortValue={sortBy}
        sortLabel={t('tasks.toolbar.sort')}
        sortOptions={(['assignedAt', 'dueDate', 'priority', 'title', 'status', 'meeting'] as const).map((value) => ({
          value,
          label: t(`tasks.assignedToMe.sort.${value}`),
        }))}
        onSortChange={(value) =>
          resetPageAnd(() => setSortBy(value as AssignedActionItemSortField))
        }
        sortDirection={sortDirection}
        onSortDirectionChange={(direction) => {
          setPage(1)
          setSortDirection(direction)
        }}
        sortDirectionLabel={t('tasks.toolbar.sortDirection')}
        ascendingLabel={t('tasks.toolbar.ascending')}
        descendingLabel={t('tasks.toolbar.descending')}
        activeFilters={activeFilterChips}
        activeFiltersLabel={t('tasks.toolbar.active')}
      />

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
                              canChangeStatus
                              statusPending={statusMutation.isPending}
                              onStatusChange={(nextStatus) => changeStatus(item, nextStatus)}
                              showMeeting
                              onOpenMeeting={() => navigate(`/meetings/${item.meetingId}`)}
                              showAssignedBy
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
                    }}
                  />
                </Card>
              </div>
            </TooltipProvider>
          </AnimatedFetching>
        )}
      </AnimatedState>

      <TaskDetailsDrawer taskId={taskId} onOpenChange={(open) => !open && closeTask()} />
    </div>
  )
}
