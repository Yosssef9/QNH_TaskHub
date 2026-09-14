import {
  CalendarDays,
  Check,
  Circle,
  Clock3,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ComponentProps } from 'react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import {
  AnimatedFetching,
  AnimatedState,
  taskHubEase,
  taskHubItemMotion,
} from '@/components/shared/TaskHubMotion'
import { TablePagination } from '@/components/shared/TablePagination'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { PersonalList } from '@/features/lists/types/list.types'
import { KpiSelectIndicator } from '@/features/kpis/components/KpiSelectIndicator'
import { KpiTaskPill } from '@/features/kpis/components/KpiTaskPill'
import type { KpiInstance, WorkCycle } from '@/features/work-cycles/types/work-cycle.types'
import { parseDateOnly } from '@/lib/date-only'
import { cn } from '@/lib/cn'

import {
  useChangeTaskStatus,
  useDeleteTask,
  useRestoreTask,
  useTaskSummary,
  useTasks,
} from '../hooks/use-tasks'
import { TASK_DUE_FILTERS, TASK_PRIORITIES, TASK_STATUSES } from '../types/task.types'
import type {
  PersonalTask,
  TaskDueFilter,
  TaskPriority,
  TaskSortField,
  TaskStatus,
} from '../types/task.types'
import { TaskEditorDialog } from './TaskEditorDialog'
import { TaskDetailsDrawer } from './TaskDetailsDrawer'
import { TaskCollectionToolbar } from './TaskCollectionToolbar'
import { TaskListSummary } from './TaskListSummary'
import { TaskStatusIndicator } from './TaskStatusIndicator'
import { TaskDueIndicator, TaskPriorityIndicator } from './TaskSelectIndicators'

type Props =
  | {
      listId: number
      lists: PersonalList[]
      instance?: never
      cycle?: never
      cycles?: never
    }
  | { instance: KpiInstance; listId?: never; lists?: never; cycle?: never; cycles?: never }
  | { cycle: WorkCycle; listId?: never; lists?: never; instance?: never; cycles?: never }
  | { cycles: WorkCycle[]; instance?: never; cycle?: never; listId?: never; lists?: never }

type TaskListGroupBy = 'NONE' | 'STATUS' | 'PRIORITY' | 'DUE_DATE' | 'KPI' | 'CYCLE'

function taskGroupKey(task: PersonalTask, groupBy: TaskListGroupBy): string {
  if (groupBy === 'STATUS') return `status:${task.status}`
  if (groupBy === 'PRIORITY') return `priority:${task.priority}`
  if (groupBy === 'DUE_DATE') return `due:${task.dueDate ?? 'none'}`
  if (groupBy === 'KPI') return `kpi:${task.kpiInstanceId ?? 'none'}`
  if (groupBy === 'CYCLE') return `cycle:${task.cycleId ?? 'none'}`
  return 'all'
}

function TaskGroupHeading({ task, groupBy }: { task: PersonalTask; groupBy: TaskListGroupBy }) {
  const { i18n, t } = useTranslation()
  if (groupBy === 'NONE') return null

  let label = ''
  if (groupBy === 'STATUS') label = t(`tasks.statuses.${task.status}`)
  if (groupBy === 'PRIORITY') label = t(`tasks.priorities.${task.priority}`)
  if (groupBy === 'KPI') label = task.kpiName ?? t('tasks.toolbar.groupValues.KPI')
  if (groupBy === 'CYCLE') label = task.cycleTitle ?? t('tasks.toolbar.groupValues.CYCLE')
  if (groupBy === 'DUE_DATE') {
    const date = task.dueDate ? parseDateOnly(task.dueDate) : null
    label = date
      ? date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })
      : t('tasks.noDueDate')
  }

  return (
    <li className="text-muted-foreground flex items-center gap-3 pt-2 text-xs font-semibold uppercase tracking-wide">
      <span className="truncate">{label}</span>
      <span className="bg-border h-px flex-1" />
    </li>
  )
}

function TaskActionButton({
  label,
  className,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          className={`size-9 transition-colors ${className ?? ''}`}
          {...props}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function TaskDate({ task }: { task: PersonalTask }) {
  const { i18n, t } = useTranslation()
  if (!task.dueDate) return <span className="text-muted-foreground">{t('tasks.noDueDate')}</span>
  const date = parseDateOnly(task.dueDate)
  return (
    <span className={task.isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}>
      {task.isOverdue ? t('tasks.overdue') : t('tasks.due')} ·{' '}
      {date?.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })}
    </span>
  )
}

export function TaskList({ listId, lists, instance, cycle, cycles }: Props) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const shouldReduceMotion = useReducedMotion()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TaskStatus | undefined>()
  const [priority, setPriority] = useState<TaskPriority | undefined>()
  const [selectedCycleId, setSelectedCycleId] = useState<number | undefined>(cycle?.id)
  const [selectedKpiId, setSelectedKpiId] = useState<number | undefined>()
  const [due, setDue] = useState<TaskDueFilter>('ALL')
  const [sortBy, setSortBy] = useState<TaskSortField>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [groupBy, setGroupBy] = useState<TaskListGroupBy>('NONE')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<PersonalTask | null>(null)
  const [deleting, setDeleting] = useState<PersonalTask | null>(null)
  const [cancelling, setCancelling] = useState<PersonalTask | null>(null)
  const [reason, setReason] = useState('')
  const [detailsTaskId, setDetailsTaskId] = useState<number | null>(null)
  const focusedSubtaskId = (() => {
    const rawSubtaskId = searchParams.get('subtaskId')
    if (!rawSubtaskId) return null
    const subtaskId = Number(rawSubtaskId)
    return Number.isSafeInteger(subtaskId) && subtaskId > 0 ? subtaskId : null
  })()
  const isKpiAggregate = Boolean(cycles || cycle)
  const isKpiMode = Boolean(instance || cycle || cycles)
  const availableCycles = cycles ?? (cycle ? [cycle] : [])
  const selectedCycle = cycle ?? availableCycles.find((item) => item.id === selectedCycleId)
  const taskKpis = (selectedCycle?.instances ?? []).filter((item) => item.taskPolicy.allowsTasks)
  const creatableInstances = availableCycles
    .filter((item) => !item.closedAtUtc)
    .flatMap((item) => item.instances)
    .filter((item) => item.isActive && item.taskPolicy.allowsTasks)
  const selectedKpi = selectedKpiId
    ? taskKpis.find((item) => item.templateId === selectedKpiId)
    : undefined
  const instancesById = new Map(
    availableCycles.flatMap((item) => item.instances).map((item) => [item.id, item] as const),
  )
  if (instance) instancesById.set(instance.id, instance)
  const createDisabled = instance
    ? !instance.isActive
    : cycle
      ? Boolean(cycle.closedAtUtc) || creatableInstances.length === 0
      : cycles
        ? creatableInstances.length === 0
        : false
  const container = isKpiAggregate
    ? { allKpis: true as const }
    : instance
      ? { kpiInstanceId: instance.id }
      : { listId: listId! }
  const query = useTasks(container, {
    search,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    due,
    sortBy,
    sortDirection,
    page,
    pageSize,
    ...(isKpiAggregate && selectedCycle ? { cycleId: selectedCycle.id } : {}),
    ...(isKpiAggregate && selectedKpi ? { kpiId: selectedKpi.templateId } : {}),
  })
  const summaryQuery = useTaskSummary(listId ?? null)
  const statusMutation = useChangeTaskStatus()
  const deleteMutation = useDeleteTask()
  const restoreMutation = useRestoreTask()
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const displayedItems = useMemo(() => {
    const items = query.data?.items ?? []
    if (groupBy === 'NONE') return items

    const grouped = new Map<string, PersonalTask[]>()
    for (const task of items) {
      const key = taskGroupKey(task, groupBy)
      const existing = grouped.get(key)
      if (existing) existing.push(task)
      else grouped.set(key, [task])
    }

    return Array.from(grouped.values()).flat()
  }, [groupBy, query.data?.items])

  const structuredFilterCount =
    Number(Boolean(status)) +
    Number(Boolean(priority)) +
    Number(due !== 'ALL') +
    Number(Boolean(cycles && selectedCycleId)) +
    Number(Boolean(isKpiAggregate && selectedKpiId))

  function clearStructuredFilters() {
    setPage(1)
    setStatus(undefined)
    setPriority(undefined)
    setDue('ALL')
    if (cycles) setSelectedCycleId(undefined)
    if (isKpiAggregate) setSelectedKpiId(undefined)
  }

  const activeFilterChips = [
    ...(cycles && selectedCycle
      ? [{
          key: 'cycle',
          label: `${t('tasks.filterByCycle')}: ${selectedCycle.title}`,
          onRemove: () => resetPageAnd(() => {
            setSelectedCycleId(undefined)
            setSelectedKpiId(undefined)
          }),
          removeLabel: t('tasks.toolbar.removeFilter', {
            filter: `${t('tasks.filterByCycle')}: ${selectedCycle.title}`,
          }),
        }]
      : []),
    ...(isKpiAggregate && selectedKpi
      ? [{
          key: 'kpi',
          label: `${t('tasks.filterByKpi')}: ${selectedKpi.name}`,
          onRemove: () => resetPageAnd(() => setSelectedKpiId(undefined)),
          removeLabel: t('tasks.toolbar.removeFilter', {
            filter: `${t('tasks.filterByKpi')}: ${selectedKpi.name}`,
          }),
        }]
      : []),
    ...(status
      ? [{
          key: 'status',
          label: `${t('tasks.allStatuses')}: ${t(`tasks.statuses.${status}`)}`,
          onRemove: () => resetPageAnd(() => setStatus(undefined)),
          removeLabel: t('tasks.toolbar.removeFilter', {
            filter: `${t('tasks.allStatuses')}: ${t(`tasks.statuses.${status}`)}`,
          }),
        }]
      : []),
    ...(priority
      ? [{
          key: 'priority',
          label: `${t('tasks.priority')}: ${t(`tasks.priorities.${priority}`)}`,
          onRemove: () => resetPageAnd(() => setPriority(undefined)),
          removeLabel: t('tasks.toolbar.removeFilter', {
            filter: `${t('tasks.priority')}: ${t(`tasks.priorities.${priority}`)}`,
          }),
        }]
      : []),
    ...(due !== 'ALL'
      ? [{
          key: 'due',
          label: `${t('tasks.dueDate')}: ${t(`tasks.dueFilters.${due}`)}`,
          onRemove: () => resetPageAnd(() => setDue('ALL')),
          removeLabel: t('tasks.toolbar.removeFilter', {
            filter: `${t('tasks.dueDate')}: ${t(`tasks.dueFilters.${due}`)}`,
          }),
        }]
      : []),
  ]

  const filterFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      {cycles ? (
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-muted-foreground text-xs font-medium">{t('tasks.filterByCycle')}</label>
          <Select
            value={selectedCycleId ? String(selectedCycleId) : 'ALL'}
            onValueChange={(value) =>
              resetPageAnd(() => {
                setSelectedCycleId(value === 'ALL' ? undefined : Number(value))
                setSelectedKpiId(undefined)
              })
            }
          >
            <SelectTrigger className="h-10 min-w-0">
              <SelectValue>
                <span className="block min-w-0 truncate">
                  {selectedCycle?.title ?? t('tasks.toolbar.all')}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('tasks.toolbar.all')}</SelectItem>
              {availableCycles.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  <span className="block max-w-[28rem] truncate">{item.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {isKpiAggregate ? (
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-muted-foreground text-xs font-medium">{t('tasks.filterByKpi')}</label>
          <Select
            value={selectedKpiId ? String(selectedKpiId) : 'ALL'}
            disabled={Boolean(cycles && !selectedCycle)}
            onValueChange={(value) =>
              resetPageAnd(() => setSelectedKpiId(value === 'ALL' ? undefined : Number(value)))
            }
          >
            <SelectTrigger className="h-10 min-w-0">
              <SelectValue>
                {selectedKpi ? (
                  <KpiSelectIndicator kpi={selectedKpi} />
                ) : (
                  <span>{t('tasks.toolbar.all')}</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('tasks.toolbar.all')}</SelectItem>
              {taskKpis.map((item) => (
                <SelectItem key={item.id} value={String(item.templateId)}>
                  <KpiSelectIndicator kpi={item} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">{t('tasks.allStatuses')}</label>
        <Select
          value={status ?? 'ALL'}
          onValueChange={(value) =>
            resetPageAnd(() => setStatus(value === 'ALL' ? undefined : (value as TaskStatus)))
          }
        >
          <SelectTrigger className="h-10 min-w-0">
            <SelectValue>
              {status ? <TaskStatusIndicator status={status} pill /> : <span>{t('tasks.toolbar.all')}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('tasks.toolbar.all')}</SelectItem>
            {TASK_STATUSES.map((value) => (
              <SelectItem value={value} key={value}>
                <TaskStatusIndicator status={value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">{t('tasks.priority')}</label>
        <Select
          value={priority ?? 'ALL'}
          onValueChange={(value) =>
            resetPageAnd(() => setPriority(value === 'ALL' ? undefined : (value as TaskPriority)))
          }
        >
          <SelectTrigger className="h-10 min-w-0">
            <SelectValue>
              {priority ? <TaskPriorityIndicator priority={priority} pill /> : <span>{t('tasks.toolbar.all')}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('tasks.toolbar.all')}</SelectItem>
            {TASK_PRIORITIES.map((value) => (
              <SelectItem value={value} key={value}>
                <TaskPriorityIndicator priority={value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-muted-foreground text-xs font-medium">{t('tasks.dueDate')}</label>
        <Select
          value={due}
          onValueChange={(value) => resetPageAnd(() => setDue(value as TaskDueFilter))}
        >
          <SelectTrigger className="h-10 min-w-0">
            <SelectValue>
              {due === 'ALL' ? <span>{t('tasks.toolbar.all')}</span> : <TaskDueIndicator due={due} pill />}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('tasks.toolbar.all')}</SelectItem>
            {TASK_DUE_FILTERS.filter((value) => value !== 'ALL').map((value) => (
              <SelectItem value={value} key={value}>
                <TaskDueIndicator due={value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  useEffect(() => {
    const rawTaskId = searchParams.get('taskId')
    if (!rawTaskId) return

    const taskId = Number(rawTaskId)
    if (!Number.isSafeInteger(taskId) || taskId <= 0) return

    setDetailsTaskId(taskId)
  }, [searchParams])

  function closeTaskDetails() {
    setDetailsTaskId(null)

    if (!searchParams.has('taskId')) return
    const next = new URLSearchParams(searchParams)
    next.delete('taskId')
    next.delete('subtaskId')
    setSearchParams(next, { replace: true })
  }

  function resetPageAnd(action: () => void) {
    setPage(1)
    action()
  }
  function applySummaryStatus(nextStatus: TaskStatus) {
    const shouldClear = status === nextStatus && !search && !priority && due === 'ALL'

    setPage(1)
    setSearch('')
    setPriority(undefined)
    setDue('ALL')
    setStatus(shouldClear ? undefined : nextStatus)
  }

  function applySummaryOverdue() {
    const shouldClear = due === 'OVERDUE' && !search && !status && !priority

    setPage(1)
    setSearch('')
    setStatus(undefined)
    setPriority(undefined)
    setDue(shouldClear ? 'ALL' : 'OVERDUE')
  }

  function changeStatus(task: PersonalTask, next: TaskStatus, cancellationReason?: string) {
    statusMutation.mutate(
      { taskId: task.id, status: next, ...(cancellationReason ? { cancellationReason } : {}) },
      {
        onSuccess: () => {
          toast.success(t('tasks.statusUpdated'))
          setCancelling(null)
          setReason('')
        },
        onError: () => toast.error(t('tasks.errors.status')),
      },
    )
  }

  function confirmDelete() {
    if (!deleting) return
    const task = deleting
    deleteMutation.mutate(task.id, {
      onSuccess: () => {
        setDeleting(null)
        toast.custom(
          (toastItem) => (
            <div className="bg-popover text-popover-foreground flex items-center gap-4 rounded-lg border px-4 py-3 shadow-lg">
              <span>{t('tasks.deleted')}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  restoreMutation.mutate(task.id, {
                    onSuccess: () => toast.success(t('tasks.restored')),
                    onError: () => toast.error(t('tasks.errors.restore')),
                  })
                  toast.dismiss(toastItem.id)
                }}
              >
                {t('tasks.undo')}
              </Button>
            </div>
          ),
          { duration: 6000 },
        )
      },
      onError: () => toast.error(t('tasks.errors.delete')),
    })
  }

  const resultsState = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : query.data.items.length === 0
        ? 'empty'
        : 'content'

  return (
    <div className="space-y-4">
      {listId && summaryQuery.data ? (
        <TaskListSummary
          summary={summaryQuery.data}
          {...(status ? { activeStatus: status } : {})}
          overdueActive={due === 'OVERDUE'}
          onStatusClick={applySummaryStatus}
          onOverdueClick={applySummaryOverdue}
        />
      ) : null}

      <TaskCollectionToolbar
        searchValue={search}
        onSearchChange={(value) => resetPageAnd(() => setSearch(value))}
        searchAriaLabel={t('tasks.searchLabel')}
        searchPlaceholder={t('tasks.searchPlaceholder')}
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
        groupOptions={[
          { value: 'NONE', label: t('tasks.toolbar.groupValues.NONE') },
          { value: 'STATUS', label: t('tasks.toolbar.groupValues.STATUS') },
          { value: 'PRIORITY', label: t('tasks.toolbar.groupValues.PRIORITY') },
          { value: 'DUE_DATE', label: t('tasks.toolbar.groupValues.DUE_DATE') },
          ...(isKpiAggregate
            ? [{ value: 'KPI', label: t('tasks.toolbar.groupValues.KPI') }]
            : []),
          ...(cycles
            ? [{ value: 'CYCLE', label: t('tasks.toolbar.groupValues.CYCLE') }]
            : []),
        ]}
        onGroupChange={(value) => setGroupBy(value as TaskListGroupBy)}
        sortValue={sortBy}
        sortLabel={t('tasks.toolbar.sort')}
        sortOptions={(['createdAt', 'dueDate', 'priority', 'title', 'status'] as const).map((value) => ({
          value,
          label: t(`tasks.sortFields.${value}`),
        }))}
        onSortChange={(value) =>
          resetPageAnd(() => setSortBy(value as TaskSortField))
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
        trailingAction={
          <Button
            disabled={createDisabled}
            onClick={() => {
              setEditing(null)
              setEditorOpen(true)
            }}
          >
            <Plus className="size-4" />
            {t(isKpiMode ? 'tasks.createKpiTask' : 'tasks.create')}
          </Button>
        }
      />

      <AnimatedState stateKey={resultsState}>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={Circle}
            title={t(isKpiMode ? 'kpiTasks.emptyTitle' : 'tasks.emptyTitle')}
            description={t(
              search || status || priority || due !== 'ALL' || selectedCycleId || selectedKpiId
                ? isKpiMode
                  ? 'kpiTasks.emptyFilteredDescription'
                  : 'tasks.emptyFilteredDescription'
                : isKpiMode
                  ? 'kpiTasks.emptyDescription'
                  : 'tasks.emptyDescription',
            )}
          />
        ) : (
          <AnimatedFetching busy={query.isPlaceholderData}>
            <TooltipProvider>
                      <div className="space-y-4">
                        <ul className="relative space-y-3">
                          <AnimatePresence initial={false} mode="popLayout">
                            {displayedItems.map((task, index) => (
                              <Fragment key={task.id}>
                                {groupBy !== 'NONE' &&
                                (index === 0 ||
                                  taskGroupKey(task, groupBy) !==
                                    taskGroupKey(displayedItems[index - 1]!, groupBy)) ? (
                                  <TaskGroupHeading task={task} groupBy={groupBy} />
                                ) : null}
                              <motion.li
                              key={task.id}
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
                              role="button"
                              tabIndex={0}
                              aria-label={t('tasks.details.open', { title: task.title })}
                              onClick={() => setDetailsTaskId(task.id)}
                              onKeyDown={(event) => {
                                if (
                                  event.target === event.currentTarget &&
                                  (event.key === 'Enter' || event.key === ' ')
                                ) {
                                  event.preventDefault()
                                  setDetailsTaskId(task.id)
                                }
                              }}
                              className={cn(
                                'group focus-visible:ring-ring relative flex cursor-pointer flex-col gap-4 rounded-xl border border-s-[3px] border-s-transparent p-4 shadow-sm transition-[border-color,background-color,box-shadow] duration-300 ease-out focus-visible:ring-2 focus-visible:outline-none sm:flex-row sm:items-center sm:p-5',
                                task.status === 'DONE'
                                  ? 'border-success/25 border-s-success/65 bg-success/[0.035] hover:border-success/40 hover:border-s-success/80 hover:bg-success/[0.055] hover:shadow-md'
                                  : 'bg-card hover:border-primary/25 hover:shadow-md',
                              )}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className={cn(
                                      'focus-visible:ring-ring grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,color,box-shadow,transform] duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none active:scale-95',
                                      task.status === 'DONE'
                                        ? 'bg-success text-success-foreground shadow-sm hover:bg-success/90 hover:text-success-foreground'
                                        : task.status === 'CANCELLED'
                                          ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                                          : 'text-muted-foreground hover:bg-success/10 hover:text-success',
                                    )}
                                    disabled={
                                      task.isReadOnly ||
                                      (task.meetingActionItem !== null &&
                                        task.status !== 'DONE' &&
                                        task.status !== 'CANCELLED')
                                    }
                                    aria-label={
                                      task.meetingActionItem !== null &&
                                      task.status !== 'DONE' &&
                                      task.status !== 'CANCELLED'
                                        ? t('tasks.actionItem.assigneeCompletes')
                                        : task.status === 'DONE'
                                          ? t('tasks.reopenTask', { title: task.title })
                                          : t('tasks.completeTask', { title: task.title })
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      changeStatus(
                                        task,
                                        task.status === 'DONE' || task.status === 'CANCELLED' ? 'TODO' : 'DONE',
                                      )
                                    }}
                                  >
                                    <AnimatePresence initial={false} mode="wait">
                                      <motion.span
                                        key={task.status}
                                        initial={
                                          shouldReduceMotion
                                            ? false
                                            : { opacity: 0, scale: 0.72 }
                                        }
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={
                                          shouldReduceMotion
                                            ? { opacity: 0 }
                                            : { opacity: 0, scale: 0.82 }
                                        }
                                        transition={
                                          shouldReduceMotion
                                            ? { duration: 0 }
                                            : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                                        }
                                        className="grid place-items-center"
                                      >
                                        {task.status === 'DONE' ? (
                                          <Check className="size-5" strokeWidth={2.75} />
                                        ) : task.status === 'CANCELLED' ? (
                                          <XCircle className="text-destructive size-6" />
                                        ) : (
                                          <Circle className="size-6" />
                                        )}
                                      </motion.span>
                                    </AnimatePresence>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {task.meetingActionItem !== null &&
                                  task.status !== 'DONE' &&
                                  task.status !== 'CANCELLED'
                                    ? t('tasks.actionItem.assigneeCompletes')
                                    : task.status === 'DONE'
                                      ? t('tasks.reopenTask', { title: task.title })
                                      : t('tasks.completeTask', { title: task.title })}
                                </TooltipContent>
                              </Tooltip>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    'text-start text-base font-semibold transition-colors duration-200',
                                    task.status === 'DONE' && 'text-foreground/85',
                                  )}
                                >
                                  {task.title}
                                </p>

                                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                                  {task.kpiInstanceId && instancesById.has(task.kpiInstanceId) ? (
                                    <KpiTaskPill
                                      kpi={instancesById.get(task.kpiInstanceId)!}
                                      cycleId={task.cycleId ?? undefined}
                                      instanceId={task.kpiInstanceId}
                                    />
                                  ) : null}

                                  <button
                                    type="button"
                                    disabled={task.isReadOnly}
                                    className="focus-visible:ring-ring rounded-full transition-[opacity,box-shadow] hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    aria-label={
                                      task.status === 'TODO'
                                        ? t('tasks.start')
                                        : task.status === 'IN_PROGRESS'
                                          ? t('tasks.backToTodo')
                                          : t('tasks.reopenTask', { title: task.title })
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation()

                                      if (task.status === 'TODO') {
                                        changeStatus(task, 'IN_PROGRESS')
                                        return
                                      }

                                      if (task.status === 'IN_PROGRESS') {
                                        changeStatus(task, 'TODO')
                                        return
                                      }

                                      if (task.status === 'DONE' || task.status === 'CANCELLED') {
                                        changeStatus(task, 'TODO')
                                      }
                                    }}
                                  >
                                    <TaskStatusIndicator status={task.status} pill />
                                  </button>

                                  <TaskPriorityIndicator
                                    priority={task.priority}
                                    className="text-muted-foreground"
                                  />

                                  <span aria-hidden="true" className="bg-border hidden h-4 w-px sm:block" />

                                  <div className="text-muted-foreground flex items-center gap-1.5">
                                    <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                                    <TaskDate task={task} />
                                  </div>
                                </div>

                                {task.subtaskTotal > 0 ? (
                                  <div className="mt-4 max-w-md">
                                    <div className="text-muted-foreground mb-1.5 flex items-center justify-between gap-3 text-xs">
                                      <span>{t('tasks.subtaskProgress')}</span>
                                      <span className="font-medium tabular-nums">
                                        {task.subtaskCompleted}/{task.subtaskTotal} ·{' '}
                                        {Math.round((task.subtaskCompleted / task.subtaskTotal) * 100)}%
                                      </span>
                                    </div>
                                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                                      <div
                                        className="bg-success h-full rounded-full transition-[width] duration-300"
                                        style={{
                                          width: `${Math.round((task.subtaskCompleted / task.subtaskTotal) * 100)}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              {!task.isReadOnly ? (
                                <div className="flex items-center gap-1 self-end opacity-75 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:self-center">
                                  {task.status === 'TODO' && (
                                  <TaskActionButton
                                    label={t('tasks.start')}
                                    className="text-info hover:bg-info/10 hover:text-info"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      changeStatus(task, 'IN_PROGRESS')
                                    }}
                                  >
                                    <Clock3 className="size-4" />
                                  </TaskActionButton>
                                )}
                                {task.status === 'IN_PROGRESS' && (
                                  <TaskActionButton
                                    label={t('tasks.backToTodo')}
                                    className="text-warning-foreground hover:bg-warning/15 hover:text-warning-foreground"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      changeStatus(task, 'TODO')
                                    }}
                                  >
                                    <RotateCcw className="size-4" />
                                  </TaskActionButton>
                                )}
                                {task.status !== 'DONE' && task.status !== 'CANCELLED' && (
                                  <TaskActionButton
                                    label={t('tasks.cancelTask')}
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setCancelling(task)
                                      setReason('')
                                    }}
                                  >
                                    <XCircle className="size-4" />
                                  </TaskActionButton>
                                )}
                                <TaskActionButton
                                  label={t('tasks.editTask', { title: task.title })}
                                  className="text-primary hover:bg-primary/10 hover:text-primary"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setEditing(task)
                                    setEditorOpen(true)
                                  }}
                                >
                                  <Pencil className="size-4" />
                                </TaskActionButton>
                                <TaskActionButton
                                  label={t('tasks.deleteTask', { title: task.title })}
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setDeleting(task)
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                  </TaskActionButton>
                                </div>
                              ) : null}
                            </motion.li>
                              </Fragment>
                            ))}
                          </AnimatePresence>
                        </ul>
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

      {editorOpen ? (
        isKpiMode ? (
          <TaskEditorDialog
            key={editing?.id ?? 'create-kpi-task'}
            open
            onOpenChange={setEditorOpen}
            {...(instance ? { instance } : cycle ? { cycle } : { cycles: cycles! })}
            task={editing}
          />
        ) : (
          <TaskEditorDialog
            key={editing?.id ?? 'create'}
            open
            onOpenChange={setEditorOpen}
            listId={listId!}
            lists={lists!}
            task={editing}
          />
        )
      ) : null}
      <TaskDetailsDrawer
        taskId={detailsTaskId}
        focusSubtaskId={focusedSubtaskId}
        onOpenChange={(open) => !open && closeTaskDetails()}
      />
      <ConfirmModal
        open={Boolean(deleting)}
        title={t('tasks.deleteTitle')}
        message={t('tasks.deleteDescription', { title: deleting?.title })}
        confirmText={t('tasks.delete')}
        cancelText={t('common.cancel')}
        danger
        loading={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
      <Dialog open={Boolean(cancelling)} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent variant="modal" closeLabel={t('common.close')}>
          <DialogTitle>{t('tasks.cancelTitle')}</DialogTitle>
          <DialogDescription>{t('tasks.cancelDescription')}</DialogDescription>
          <div className="mt-4 space-y-2">
            <label htmlFor="cancel-reason" className="text-sm font-medium">
              {t('tasks.cancellationReason')}
            </label>
            <Textarea
              id="cancel-reason"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelling(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || statusMutation.isPending}
              onClick={() => cancelling && changeStatus(cancelling, 'CANCELLED', reason.trim())}
            >
              {t('tasks.cancelTask')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

