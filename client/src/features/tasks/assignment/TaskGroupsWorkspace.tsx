import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowDown, ArrowUp, CalendarDays, Check, ChevronRight,
  Ellipsis, Folder, FolderOpen, FolderPlus, GripVertical, Inbox, ListTree,
  Loader2, Move, Pencil, Plus, SquarePen, Trash2, UnfoldVertical, FoldVertical,
  ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { cn } from '@/lib/cn'
import { getTasks } from '../api/tasks.api'
import { useChangeTaskStatus } from '../hooks/use-tasks'
import { TaskPriorityIndicator } from '../components/TaskSelectIndicators'
import type { PersonalTask, TaskListFilters } from '../types/task.types'
import { useTaskGroupActions, useTaskGroups } from './use-task-groups'
import { TaskGroupSelect } from './TaskGroupSelect'
import { buildGroupTree } from './task-groups.tree'
import { activeGroupFilters, filteredGroupIds, filterKey } from './task-groups.filtered-view'
import type { GroupTreeRow } from './task-groups.tree'
import type { TaskGroup } from './task-groups.api'

const BATCH_SIZE = 20

const ACCORDION_DURATION = 0.28
const ACCORDION_EASE = [0.22, 1, 0.36, 1] as const

/** Keep closing content mounted until its height has animated to zero. */
function AccordionPanel({ open, reduceMotion, className, children }: {
  open: boolean
  reduceMotion: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="content"
          data-task-group-panel
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : ACCORDION_DURATION, ease: ACCORDION_EASE }}
          className={cn('overflow-hidden', className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function AccordionChevron({ open, reduceMotion }: { open: boolean; reduceMotion: boolean }) {
  return (
    <motion.span
      aria-hidden="true"
      className="text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center"
      initial={false}
      animate={{ rotate: open ? 90 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: ACCORDION_EASE }}
    >
      <ChevronRight className="size-4" />
    </motion.span>
  )
}

type Props = {
  listId: number
  filters: TaskListFilters
  onOpenTask: (id: number) => void
  onEditTask: (task: PersonalTask) => void
  onNewTask: (groupId: number | null) => void
}

function ActionMenuItem({ icon: Icon, children, onClick, destructive = false, disabled = false }: {
  icon: typeof Plus
  children: ReactNode
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick}
      className={cn(
        'focus-visible:bg-accent hover:bg-accent flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-start text-sm outline-none disabled:cursor-not-allowed disabled:opacity-40',
        destructive && 'text-destructive hover:bg-destructive/10',
      )}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{children}</span>
    </button>
  )
}

function TaskActions({ task, onOpen, onEdit, onMove, onToggleStatus }: {
  task: PersonalTask
  onOpen: () => void
  onEdit: () => void
  onMove: () => void
  onToggleStatus: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const closeThen = (fn: () => void) => { setOpen(false); fn() }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={t('taskGroups.taskActions')}>
          <Ellipsis className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-48 p-1" role="menu">
        <ActionMenuItem icon={ExternalLink} onClick={() => closeThen(onOpen)}>{t('taskGroups.openTask')}</ActionMenuItem>
        {!task.isReadOnly && !task.collaborationEnabled && task.meetingActionItem === null && task.status !== 'CANCELLED' &&
          <ActionMenuItem icon={task.status === 'DONE' ? ArrowUp : Check} onClick={() => closeThen(onToggleStatus)}>
            {t(task.status === 'DONE' ? 'taskGroups.reopenTask' : 'taskGroups.markComplete')}
          </ActionMenuItem>}
        {!task.isReadOnly && <ActionMenuItem icon={SquarePen} onClick={() => closeThen(onEdit)}>{t('common.edit')}</ActionMenuItem>}
        {!task.isReadOnly && task.meetingActionItem === null &&
          <ActionMenuItem icon={Move} onClick={() => closeThen(onMove)}>{t('taskGroups.moveTask')}</ActionMenuItem>}
      </PopoverContent>
    </Popover>
  )
}

function Progress({ total, completed }: { total: number; completed: number }) {
  const { t } = useTranslation()
  const percent = total > 0 ? Math.min(100, (completed / total) * 100) : 0
  return (
    <div className="hidden min-w-0 items-center gap-2 sm:flex" title={t('taskGroups.completedOfTotal', { done: completed, total })}>
      <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full lg:w-24" role="progressbar"
        aria-label={t('taskGroups.completedOfTotal', { done: completed, total })} aria-valuenow={completed}
        aria-valuemin={0} aria-valuemax={total || 1}>
        <div className="bg-success h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-muted-foreground hidden whitespace-nowrap text-[11px] tabular-nums lg:inline">{completed}/{total}</span>
    </div>
  )
}

function GroupTasks({ listId, groupId, filters, onOpenTask, onEditTask, onMoveTask, onNewTask, selectedIds, onToggle, emptyIsGroup, hasChildren = false, knownCount }: {
  listId: number
  groupId: number | null
  filters: TaskListFilters
  onOpenTask: (id: number) => void
  onEditTask: (task: PersonalTask) => void
  onMoveTask: (task: PersonalTask) => void
  onNewTask: (groupId: number | null) => void
  selectedIds: number[]
  onToggle: (id: number) => void
  emptyIsGroup: boolean
  hasChildren?: boolean
  knownCount?: number
}) {
  const { t, i18n } = useTranslation()
  const statusMutation = useChangeTaskStatus()
  const groupFilter = groupId === null ? 'UNGROUPED' : groupId
  const emptyFromCounts = knownCount === 0
  const nextPageAnchor = useRef<HTMLDivElement | null>(null)
  const query = useInfiniteQuery({
    enabled: !emptyFromCounts,
    queryKey: ['tasks', 'groups', listId, groupFilter, filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getTasks(listId, { ...filters, groupId: groupFilter, page: pageParam, pageSize: BATCH_SIZE }),
    getNextPageParam: (last, pages) => pages.reduce((count, page) => count + page.items.length, 0) < last.total ? pages.length + 1 : undefined,
  })
  const tasks = query.data?.pages.flatMap(page => page.items) ?? []
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    const element = nextPageAnchor.current
    if (!element || !hasNextPage || isFetchingNextPage || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    }, { rootMargin: '160px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, tasks.length])

  return (
    <div className="space-y-1 px-2 pb-2 sm:px-3">
      {query.isPending && !emptyFromCounts && <div className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-xs">
        <Loader2 className="size-4 animate-spin" /> {t('common.loading')}
      </div>}
      {query.isError && <Button variant="outline" size="sm" onClick={() => void query.refetch()}>{t('common.retry')}</Button>}
      {(emptyFromCounts || !query.isPending) && !query.isError && tasks.length === 0 && !hasChildren && (
        <div className="border-border/70 bg-muted/20 flex flex-col items-center gap-2 rounded-lg border border-dashed px-3 py-5 text-center">
          <FolderOpen className="text-muted-foreground/50 size-8" aria-hidden="true" />
          <p className="text-sm font-medium">{emptyIsGroup ? t('taskGroups.emptyGroupTitle') : t('taskGroups.ungroupedHint')}</p>
          <p className="text-muted-foreground text-xs">{t('taskGroups.emptyGroupHint')}</p>
          <Button size="sm" variant="outline" onClick={() => onNewTask(groupId)}><Plus className="size-4" />{t('taskGroups.addTask')}</Button>
        </div>
      )}
      {tasks.length > 0 && <div className="border-border/70 divide-border/70 overflow-hidden rounded-lg border bg-card">
        {tasks.map(task => (
          <div key={task.id} className="hover:bg-muted/30 group/task flex min-w-0 items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-3">
            {task.meetingActionItem === null && <input type="checkbox" checked={selectedIds.includes(task.id)}
              onChange={() => onToggle(task.id)} aria-label={t('taskGroups.selectTask', { title: task.title })}
              className="accent-primary size-4 shrink-0 cursor-pointer" />}
            <button type="button" onClick={() => onOpenTask(task.id)}
              className="focus-visible:ring-ring min-w-0 flex-1 rounded text-start focus-visible:ring-2 focus-visible:outline-none">
              <div className={cn('truncate text-sm font-medium', task.status === 'DONE' && 'text-muted-foreground')}>{task.title}</div>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span className={cn('rounded-full px-1.5 py-0.5', task.status === 'DONE' ? 'bg-success/10 text-success-foreground' : 'bg-muted')}>
                  {t(`tasks.statuses.${task.status}`)}
                </span>
                <TaskPriorityIndicator priority={task.priority} className="gap-1 text-[11px]" />
                {task.dueDate && <span className="inline-flex items-center gap-1" title={t('tasks.dueDate')}>
                  <CalendarDays className="size-3" aria-hidden="true" />
                  {new Intl.DateTimeFormat(i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB',
                    { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${task.dueDate}T00:00:00Z`))}
                </span>}
              </div>
            </button>
            <TaskActions task={task} onOpen={() => onOpenTask(task.id)} onEdit={() => onEditTask(task)}
              onMove={() => onMoveTask(task)} onToggleStatus={() => {
                statusMutation.mutate({ taskId: task.id, status: task.status === 'DONE' ? 'TODO' : 'DONE' }, {
                  onSuccess: () => toast.success(t('tasks.statusUpdated')),
                  onError: () => toast.error(t('tasks.errors.status')),
                })
              }} />
          </div>
        ))}
      </div>}
      {hasNextPage && <div ref={nextPageAnchor} className="flex justify-center py-1">
        <Button size="sm" variant="ghost" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" />}
          {isFetchingNextPage ? t('common.loading') : t('taskGroups.loadMore')}
        </Button>
      </div>}
      {tasks.length > 0 && <Button size="sm" variant="ghost" className="text-primary mt-1 h-8 text-xs"
        onClick={() => onNewTask(groupId)}><Plus className="size-3.5" />{t('taskGroups.addTask')}</Button>}
    </div>
  )
}

function GroupMenu({ canUp, canDown, onCreate, onNewTask, onRename, onMove, onReorder, onDelete }: {
  canUp: boolean
  canDown: boolean
  onCreate: () => void
  onNewTask: () => void
  onRename: () => void
  onMove: () => void
  onReorder: (direction: -1 | 1) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const act = (fn: () => void) => { setOpen(false); fn() }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={t('taskGroups.groupActions')}
        title={t('taskGroups.groupActions')}><Ellipsis className="size-4" /></Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-52 p-1" sideOffset={6} role="menu" aria-label={t('taskGroups.groupActions')}>
      <ActionMenuItem icon={FolderPlus} onClick={() => act(onCreate)}>{t('taskGroups.addSubgroup')}</ActionMenuItem>
      <ActionMenuItem icon={Plus} onClick={() => act(onNewTask)}>{t('taskGroups.addTask')}</ActionMenuItem>
      <div className="border-border my-1 border-t" />
      <ActionMenuItem icon={Pencil} onClick={() => act(onRename)}>{t('taskGroups.rename')}</ActionMenuItem>
      <ActionMenuItem icon={Move} onClick={() => act(onMove)}>{t('taskGroups.moveGroup')}</ActionMenuItem>
      <ActionMenuItem icon={ArrowUp} disabled={!canUp} onClick={() => act(() => onReorder(-1))}>{t('taskGroups.moveUp')}</ActionMenuItem>
      <ActionMenuItem icon={ArrowDown} disabled={!canDown} onClick={() => act(() => onReorder(1))}>{t('taskGroups.moveDown')}</ActionMenuItem>
      <div className="border-border my-1 border-t" />
      <ActionMenuItem icon={Trash2} destructive onClick={() => act(onDelete)}>{t('taskGroups.delete')}</ActionMenuItem>
    </PopoverContent>
  </Popover>
}

export function TaskGroupsWorkspace({ listId, filters, onOpenTask, onEditTask, onNewTask }: Props) {
  const { t } = useTranslation()
  const reduceMotion = Boolean(useReducedMotion())
  const query = useTaskGroups(listId, filters)
  const actions = useTaskGroupActions()
  const groups = query.data?.groups ?? []
  const rows = useMemo(() => buildGroupTree(groups), [query.data?.groups])
  const siblingsByParent = useMemo(() => {
    const map = new Map<number | null, GroupTreeRow[]>()
    for (const group of rows) {
      const siblings = map.get(group.parentGroupId) ?? []
      siblings.push(group)
      map.set(group.parentGroupId, siblings)
    }
    return map
  }, [rows])
  const [expanded, setExpanded] = useState<number[]>([])
  const [initializedList, setInitializedList] = useState<number | null>(null)
  const [ungroupedOpen, setUngroupedOpen] = useState(true)

  useEffect(() => {
    if (!query.isSuccess) return
    try {
      const stored = window.localStorage.getItem(`taskhub:expanded-task-groups:${listId}`)
      const saved = stored === null ? null : JSON.parse(stored)
      setExpanded(Array.isArray(saved)
        ? saved.filter((id): id is number => Number.isSafeInteger(id) && id > 0)
        : rows.filter(group => group.parentGroupId === null).map(group => group.id))
      setUngroupedOpen(window.localStorage.getItem(`taskhub:ungrouped-open:${listId}`) !== 'false')
    } catch {
      setExpanded(rows.filter(group => group.parentGroupId === null).map(group => group.id))
      setUngroupedOpen(true)
    }
    setInitializedList(listId)
  }, [listId, query.isSuccess])
  useEffect(() => {
    if (initializedList !== listId) return
    try {
      window.localStorage.setItem(`taskhub:expanded-task-groups:${listId}`, JSON.stringify(expanded))
      window.localStorage.setItem(`taskhub:ungrouped-open:${listId}`, String(ungroupedOpen))
    } catch { /* Storage disabled. Accordion still works. */ }
  }, [listId, initializedList, expanded, ungroupedOpen])
  const [dialog, setDialog] = useState<'new' | 'rename' | 'move' | null>(null)
  const [selected, setSelected] = useState<GroupTreeRow | null>(null)
  const [parent, setParent] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<GroupTreeRow | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkTarget, setBulkTarget] = useState<number | null>(null)
  const [movingTask, setMovingTask] = useState<PersonalTask | null>(null)
  const [moveTarget, setMoveTarget] = useState<number | null>(null)
  const filtering = activeGroupFilters(filters)
  const matchingIds = useMemo(() => filteredGroupIds(rows, filtering), [rows, filtering])
  const currentFilterKey = filterKey(filters)
  // Filter-driven expansion is temporary: do not overwrite the user's saved accordion state.
  const [filteredCollapsed, setFilteredCollapsed] = useState<{ key: string; ids: number[] }>({ key: '', ids: [] })
  const [filteredUngrouped, setFilteredUngrouped] = useState<{ key: string; open: boolean }>({ key: '', open: true })
  const collapsedIds = filteredCollapsed.key === currentFilterKey ? filteredCollapsed.ids : []
  const opened = (id: number) => filtering ? !collapsedIds.includes(id) : expanded.includes(id)
  const visible = (row: GroupTreeRow) => matchingIds.has(row.id) && row.ancestorIds.every(opened)
  const toggle = (id: number) => {
    if (!filtering) {
      setExpanded(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
    } else {
      setFilteredCollapsed(current => {
        const ids = current.key === currentFilterKey ? current.ids : []
        return { key: currentFilterKey, ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] }
      })
    }
  }
  const effectiveUngroupedOpen = filtering
    ? filteredUngrouped.key === currentFilterKey ? filteredUngrouped.open : true
    : ungroupedOpen
  const toggleUngrouped = () => {
    if (!filtering) setUngroupedOpen(current => !current)
    else setFilteredUngrouped({ key: currentFilterKey, open: !effectiveUngroupedOpen })
  }
  const showUngrouped = !filtering || (query.data?.ungroupedCount ?? 0) > 0
  const noMatches = filtering && !rows.some(row => matchingIds.has(row.id)) && !showUngrouped
  const toggleTask = (id: number) => setSelectedIds(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  const startCreate = (parentGroupId: number | null) => { setSelected(null); setParent(parentGroupId); setName(''); setDialog('new') }
  const startRename = (group: GroupTreeRow) => { setSelected(group); setName(group.name); setDialog('rename') }
  const startMove = (group: GroupTreeRow) => { setSelected(group); setParent(group.parentGroupId); setDialog('move') }
  const beginMoveTask = (task: PersonalTask) => { setMovingTask(task); setMoveTarget(task.groupId ?? null) }
  const failed = () => toast.error(t('taskGroups.saveError'))
  function submit() {
    if (dialog === 'new') actions.create.mutate({ listId, name: name.trim(), parentGroupId: parent }, {
      onSuccess: () => { setDialog(null); if (parent !== null) setExpanded(current => [...new Set([...current, parent])]) }, onError: failed,
    })
    if (dialog === 'rename' && selected) actions.update.mutate({ listId, id: selected.id, name: name.trim() }, { onSuccess: () => setDialog(null), onError: failed })
    if (dialog === 'move' && selected) actions.update.mutate({ listId, id: selected.id, parentGroupId: parent }, { onSuccess: () => setDialog(null), onError: failed })
  }
  function swap(row: GroupTreeRow, direction: -1 | 1) {
    const siblings = siblingsByParent.get(row.parentGroupId) ?? []
    const i = siblings.findIndex(group => group.id === row.id)
    if (i + direction < 0 || i + direction >= siblings.length) return
    const ids = siblings.map(group => group.id)
    ;[ids[i], ids[i + direction]] = [ids[i + direction]!, ids[i]!]
    actions.reorder.mutate({ listId, parentGroupId: row.parentGroupId, groupIds: ids }, { onError: failed })
  }
  const busy = actions.create.isPending || actions.update.isPending || actions.remove.isPending
  if (query.isPending) return <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm"><Loader2 className="size-4 animate-spin" />{t('common.loading')}</div>
  if (query.isError) return <Button variant="outline" onClick={() => void query.refetch()}>{t('common.retry')}</Button>

  return <section className="space-y-3" aria-label={t('taskGroups.title')}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ListTree className="text-primary size-4" />{t('taskGroups.title')}
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs tabular-nums">{filtering ? matchingIds.size : groups.length}</span>
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">{t('taskGroups.description')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {selectedIds.length > 0 && <Button size="sm" variant="outline" onClick={() => { setBulkTarget(null); setBulkOpen(true) }}>
          {t('taskGroups.bulkMove', { count: selectedIds.length })}</Button>}
        <Button size="sm" variant="outline" onClick={() => filtering ? setFilteredCollapsed({ key: currentFilterKey, ids: [] }) : setExpanded(rows.map(group => group.id))} disabled={!rows.length}>
          <UnfoldVertical className="size-3.5" />{t('taskGroups.expandAll')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => filtering ? setFilteredCollapsed({ key: currentFilterKey, ids: rows.filter(group => matchingIds.has(group.id)).map(group => group.id) }) : setExpanded([])} disabled={!rows.length}>
          <FoldVertical className="size-3.5" />{t('taskGroups.collapseAll')}
        </Button>
        <Button size="sm" onClick={() => startCreate(null)}><FolderPlus className="size-4" />{t('taskGroups.addGroup')}</Button>
      </div>
    </div>
    {rows.length === 0 && !filtering && <div className="border-primary/15 bg-primary/[0.025] flex flex-col items-center gap-2 rounded-xl border border-dashed p-7 text-center">
      <FolderPlus className="text-primary/60 size-9" />
      <p className="text-sm font-semibold">{t('taskGroups.noGroupsTitle')}</p>
      <p className="text-muted-foreground text-xs">{t('taskGroups.noGroupsHint')}</p>
      <Button size="sm" variant="outline" onClick={() => startCreate(null)}><Plus className="size-4" />{t('taskGroups.addGroup')}</Button>
    </div>}
    {noMatches && <div role="status" className="border-border/70 bg-muted/20 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {t('taskGroups.noMatchingTasks')}
    </div>}
    <div className="space-y-2">
      {rows.map(row => {
        const isVisible = visible(row)
        const isOpen = opened(row.id)
        const siblings = siblingsByParent.get(row.parentGroupId) ?? []
        const i = siblings.findIndex(group => group.id === row.id)
        const depth = Math.min(row.depth, 5)
        return <AnimatePresence key={row.id} initial={false}>
          {isVisible && <motion.div
            key={row.id}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : ACCORDION_DURATION, ease: ACCORDION_EASE }}
            className="overflow-hidden"
          >
          <div className="relative space-y-1" style={{ paddingInlineStart: depth ? depth * 16 : undefined }}>
          {depth > 0 && <span aria-hidden="true" className="border-border absolute top-0 bottom-0 border-s"
            style={{ insetInlineStart: (depth - 1) * 16 + 6 }} />}
          <div className={cn('group bg-card flex items-center gap-1 rounded-xl border p-1.5 shadow-xs sm:gap-2',
            row.depth === 0 ? 'border-primary/10 bg-primary/[0.035]' : 'border-border/75',
            dragging === row.id && 'opacity-50')}
            onDragOver={event => { if (!filtering && dragging !== null) event.preventDefault() }}
            onDrop={event => {
              event.preventDefault()
              if (filtering || dragging === null || dragging === row.id) { setDragging(null); return }
              const source = rows.find(group => group.id === dragging)
              if (!source || source.parentGroupId !== row.parentGroupId) { setDragging(null); return }
              const order = siblings.map(group => group.id).filter(id => id !== dragging)
              order.splice(order.indexOf(row.id), 0, dragging)
              actions.reorder.mutate({ listId, parentGroupId: row.parentGroupId, groupIds: order }, { onError: failed })
              setDragging(null)
            }}>
            <button type="button" className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-start outline-none focus-visible:ring-2"
              aria-label={t('taskGroups.toggle', { name: row.name })} aria-expanded={isOpen} onClick={() => toggle(row.id)}
              title={row.path}>
              <AccordionChevron open={isOpen} reduceMotion={reduceMotion} />
              {isOpen ? <FolderOpen className="text-amber-500 size-5 shrink-0" /> : <Folder className="text-amber-500 size-5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs tabular-nums">{row.totalTaskCount}</span>
              <Progress total={row.totalTaskCount} completed={row.totalDoneCount} />
            </button>
            <span draggable={!filtering} onDragStart={event => { if (filtering) { event.preventDefault(); return } event.dataTransfer.effectAllowed = 'move'; setDragging(row.id) }}
              onDragEnd={() => setDragging(null)} className={cn('text-muted-foreground hidden cursor-grab rounded p-1.5 hover:bg-muted sm:inline-flex', filtering && 'pointer-events-none opacity-30')}
              role="button" tabIndex={0} title={t('taskGroups.dragToReorder')} aria-label={t('taskGroups.dragToReorder')}
              onKeyDown={event => {
                if (!filtering && event.key === 'ArrowUp' && i > 0) { event.preventDefault(); swap(row, -1) }
                if (!filtering && event.key === 'ArrowDown' && i < siblings.length - 1) { event.preventDefault(); swap(row, 1) }
              }}>
              <GripVertical className="size-4" />
            </span>
            <GroupMenu canUp={!filtering && i>0} canDown={!filtering && i<siblings.length-1}
              onCreate={() => startCreate(row.id)} onNewTask={() => onNewTask(row.id)}
              onRename={() => startRename(row)} onMove={() => startMove(row)}
              onReorder={direction => swap(row, direction)} onDelete={() => setDeleting(row)} />
          </div>
          <AccordionPanel open={isOpen} reduceMotion={reduceMotion}
            className={cn('border-border/60 ms-4 border-s ps-2', row.depth === 0 && 'sm:ms-5 sm:ps-3')}>
            <GroupTasks listId={listId} groupId={row.id} filters={filters} onOpenTask={onOpenTask}
              onEditTask={onEditTask} onMoveTask={beginMoveTask} onNewTask={onNewTask}
              selectedIds={selectedIds} onToggle={toggleTask} emptyIsGroup={true}
              hasChildren={Boolean(siblingsByParent.get(row.id)?.length)} knownCount={row.directTaskCount} />
          </AccordionPanel>
        </div>
        </motion.div>}
        </AnimatePresence>
      })}
      {showUngrouped && <div className="overflow-hidden rounded-xl border bg-card">
        <div className="bg-muted/30 flex items-center gap-2 p-1.5">
          <button type="button" onClick={toggleUngrouped}
            aria-expanded={effectiveUngroupedOpen} aria-label={t('taskGroups.toggle', { name: t('taskGroups.ungrouped') })}
            className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-start outline-none focus-visible:ring-2">
            <AccordionChevron open={effectiveUngroupedOpen} reduceMotion={reduceMotion} />
            <Inbox className="text-primary size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t('taskGroups.ungrouped')}</span>
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs tabular-nums">{query.data?.ungroupedCount ?? 0}</span>
            <Progress total={query.data?.ungroupedCount ?? 0} completed={query.data?.ungroupedDoneCount ?? 0} />
          </button>
          <Button size="icon" variant="ghost" className="size-8" onClick={() => onNewTask(null)} title={t('taskGroups.addTask')} aria-label={t('taskGroups.addTask')}>
            <Plus className="size-4" />
          </Button>
        </div>
        <AccordionPanel open={effectiveUngroupedOpen} reduceMotion={reduceMotion}>
          <GroupTasks listId={listId} groupId={null} filters={filters} onOpenTask={onOpenTask}
            onEditTask={onEditTask} onMoveTask={beginMoveTask} onNewTask={onNewTask}
            selectedIds={selectedIds} onToggle={toggleTask} emptyIsGroup={false} knownCount={query.data?.ungroupedCount ?? 0} />
        </AccordionPanel>
      </div>}
    </div>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null) }}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <DialogTitle>{t(dialog === 'new' ? 'taskGroups.addGroup' : dialog === 'rename' ? 'taskGroups.rename' : 'taskGroups.moveGroup')}</DialogTitle>
        <DialogDescription>{t('taskGroups.formHint')}</DialogDescription>
        {dialog !== 'move' && <div className="mt-4 space-y-2">
          <label className="text-sm font-medium" htmlFor="task-group-name">{t('taskGroups.name')}</label>
          <Input id="task-group-name" maxLength={150} value={name} autoFocus onChange={event => setName(event.target.value)} />
        </div>}
        {(dialog === 'new' || dialog === 'move') && <div className="mt-4 space-y-2">
          <label className="text-sm font-medium">{t('taskGroups.parent')}</label>
          <TaskGroupSelect groups={groups} value={parent} onChange={setParent}
            rootLabel={t('taskGroups.rootGroup')}
            excludeIds={dialog === 'move' && selected
              ? [selected.id, ...rows.filter(group => group.ancestorIds.includes(selected.id)).map(group => group.id)] : []} />
        </div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          <Button disabled={busy || ((dialog === 'new' || dialog === 'rename') && !name.trim())} onClick={submit}>{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={movingTask !== null} onOpenChange={open => { if (!open) setMovingTask(null) }}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <DialogTitle>{t('taskGroups.moveTask')}</DialogTitle>
        <DialogDescription>{t('taskGroups.moveTaskHint')}</DialogDescription>
        <div className="mt-4"><TaskGroupSelect groups={groups} value={moveTarget} onChange={setMoveTarget} /></div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMovingTask(null)}>{t('common.cancel')}</Button>
          <Button disabled={actions.moveTask.isPending} onClick={() => {
            if (!movingTask) return
            actions.moveTask.mutate({ taskId: movingTask.id, groupId: moveTarget },
              { onSuccess: () => setMovingTask(null), onError: failed })
          }}>{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
      <DialogContent variant="modal" closeLabel={t('common.close')}>
        <DialogTitle>{t('taskGroups.bulkMove', { count: selectedIds.length })}</DialogTitle>
        <DialogDescription>{t('taskGroups.moveTaskHint')}</DialogDescription>
        <div className="mt-4"><TaskGroupSelect groups={groups} value={bulkTarget} onChange={setBulkTarget} /></div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(false)}>{t('common.cancel')}</Button>
          <Button disabled={actions.bulkMove.isPending || !selectedIds.length} onClick={() =>
            actions.bulkMove.mutate({ listId, taskIds: selectedIds, groupId: bulkTarget },
              { onSuccess: () => { setSelectedIds([]); setBulkOpen(false) }, onError: failed })
          }>{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmModal open={deleting !== null} danger loading={actions.remove.isPending}
      title={t('taskGroups.deleteTitle')} message={t('taskGroups.deleteDescription', { name: deleting?.name })}
      confirmText={t('common.delete')} cancelText={t('common.cancel')}
      onCancel={() => setDeleting(null)} onConfirm={() => {
        if (!deleting) return
        actions.remove.mutate({ listId, id: deleting.id },
          { onSuccess: () => setDeleting(null), onError: () => toast.error(t('taskGroups.deleteError')) })
      }} />
  </section>
}
