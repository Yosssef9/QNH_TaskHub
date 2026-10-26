import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Loader2, Pencil, Share2, UsersRound } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'

import { TablePagination } from '@/components/shared/TablePagination'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskCollectionToolbar, type TaskCollectionToolbarFilterChip } from '@/features/tasks/components/TaskCollectionToolbar'
import { TaskCardLayout } from '@/features/tasks/components/TaskCardLayout'
import { TaskDetailsDrawer } from '@/features/tasks/components/TaskDetailsDrawer'
import { discussionApi } from '@/features/tasks/discussions/discussions.api'
import { DiscussionShortcut } from '@/features/tasks/discussions/DiscussionShortcut'
import { TaskPriorityIndicator, TaskDueIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import { TaskTypeFilterSelect } from '@/features/tasks/components/TaskTypeFilterSelect'
import { TaskTagFilter } from '@/features/tasks/tags/TaskTagFilter'
import { TaskTags } from '@/features/tasks/tags/TaskTags'
import { TASK_DUE_FILTERS, TASK_PRIORITIES, TASK_STATUSES } from '@/features/tasks/types/task.types'
import type { TaskDueFilter, TaskSortField, TaskTypeFilter } from '@/features/tasks/types/task.types'
import { EditSharedTaskDialog } from '@/features/task-shares/EditSharedTaskDialog'
import { SharePeopleFilter } from '@/features/task-shares/SharePeopleFilter'
import { ShareTaskDialog } from '@/features/task-shares/ShareTaskDialog'
import { listSharedTasks, listSharePeople } from '@/features/task-shares/task-shares.api'
import type { SharePermission, SharedTask } from '@/features/task-shares/task-shares.api'
import { parseDateOnly } from '@/lib/date-only'

type Tab = 'with' | 'by'
type GroupBy = 'NONE' | 'STATUS' | 'PRIORITY' | 'DUE_DATE'

function groupKey(task: SharedTask, groupBy: GroupBy): string {
  if (groupBy === 'STATUS') return `status:${task.status}`
  if (groupBy === 'PRIORITY') return `priority:${task.priority}`
  if (groupBy === 'DUE_DATE') return `due:${task.dueDate ?? 'none'}`
  return 'all'
}

export function SharedTasksPage() {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'by' ? 'by' : 'with'
  const taskId = Number(params.get('taskId'))

  const [search, setSearch] = useState('')
  const [personId, setPersonId] = useState<number | null>(null)
  const [permission, setPermission] = useState<'ALL' | SharePermission>('ALL')
  const [status, setStatus] = useState<SharedTask['status'] | 'ALL'>('ALL')
  const [priority, setPriority] = useState<SharedTask['priority'] | 'ALL'>('ALL')
  const [taskType, setTaskType] = useState<TaskTypeFilter>('ALL')
  const [due, setDue] = useState<TaskDueFilter>('ALL')
  const [tagIds, setTagIds] = useState<number[]>([])
  const [tagMatch, setTagMatch] = useState<'ANY' | 'ALL' | 'UNTAGGED'>('ANY')
  const [sortBy, setSortBy] = useState<TaskSortField>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [groupBy, setGroupBy] = useState<GroupBy>('NONE')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [detailsId, setDetailsId] = useState<number | null>(Number.isSafeInteger(taskId) && taskId > 0 ? taskId : null)
  const [sharingId, setSharingId] = useState<number | null>(null)
  const [editingTask, setEditingTask] = useState<SharedTask | null>(null)

  const filters = { tab, page, pageSize, search, ...(personId !== null ? { personId } : {}),
    permission, status, priority, taskType, due, sortBy, sortDirection,
    ...(tagIds.length ? { tagIds: tagIds.join(',') } : {}), tagMatch }
  const query = useQuery({ queryKey: ['task-shares', 'list', filters], queryFn: () => listSharedTasks(filters) })
  const peopleQuery = useQuery({ queryKey: ['task-shares', 'people', tab], queryFn: () => listSharePeople(tab) })
  const discussionIds = (query.data?.items ?? []).map(task => task.taskId).slice(0, 75)
  const discussionIdsKey = discussionIds.join(',')
  const discussionQuery = useQuery({
    queryKey: ['discussions', 'shared-cards', discussionIdsKey],
    queryFn: () => discussionApi.unread(discussionIds),
    enabled: discussionIds.length > 0, refetchInterval: 15000, staleTime: 5000,
  })
  function openTaskDiscussion(id: number) {
    setDetailsId(id)
    setParams(current => {
      const next = new URLSearchParams(current)
      next.set('taskId', String(id))
      next.set('discussion', '1')
      next.delete('subtaskId')
      return next
    })
  }
  const people = peopleQuery.data ?? []
  const selectedPerson = people.find(person => person.userId === personId)
  const total = query.data?.total ?? 0

  const groups = useMemo(() => {
    const grouped = new Map<string, SharedTask[]>()
    for (const task of query.data?.items ?? []) {
      const key = groupKey(task, groupBy)
      const existing = grouped.get(key)
      if (existing) existing.push(task)
      else grouped.set(key, [task])
    }
    return [...grouped.values()]
  }, [query.data?.items, groupBy])

  function resetPageAnd(update: () => void) { setPage(1); update() }
  function changeTab(next: Tab) {
    if (next === tab) return
    setPersonId(null) // Owners and recipients are different filter scopes.
    setPage(1)
    setParams({ tab: next })
  }
  function clearFilters() {
    setPersonId(null); setPermission('ALL'); setStatus('ALL'); setPriority('ALL')
    setTaskType('ALL'); setDue('ALL'); setTagIds([]); setTagMatch('ANY'); setPage(1)
  }
  const removeLabel = (label: string) => t('tasks.toolbar.removeFilter', { filter: label })
  const chips: TaskCollectionToolbarFilterChip[] = [
    ...(personId !== null ? [{ key: 'person', label: `${t('taskSharing.filterPeople')}: ${selectedPerson?.userName ?? `#${personId}`}`,
      onRemove: () => resetPageAnd(() => setPersonId(null)), removeLabel: removeLabel(t('taskSharing.filterPeople')) }] : []),
    ...(permission !== 'ALL' ? [{ key: 'permission', label: `${t('taskSharing.permissions')}: ${t(permission === 'VIEW' ? 'taskSharing.view' : 'taskSharing.edit')}`,
      onRemove: () => resetPageAnd(() => setPermission('ALL')), removeLabel: removeLabel(t('taskSharing.permissions')) }] : []),
    ...(status !== 'ALL' ? [{ key: 'status', label: `${t('tasks.allStatuses')}: ${t(`tasks.statuses.${status}`)}`,
      onRemove: () => resetPageAnd(() => setStatus('ALL')), removeLabel: removeLabel(t('tasks.allStatuses')) }] : []),
    ...(priority !== 'ALL' ? [{ key: 'priority', label: `${t('tasks.priority')}: ${t(`tasks.priorities.${priority}`)}`,
      onRemove: () => resetPageAnd(() => setPriority('ALL')), removeLabel: removeLabel(t('tasks.priority')) }] : []),
    ...(taskType !== 'ALL' ? [{ key: 'taskType', label: `${t('tasks.taskTypeFilter.label')}: ${t(`tasks.taskTypeFilter.${taskType}`)}`,
      onRemove: () => resetPageAnd(() => setTaskType('ALL')), removeLabel: removeLabel(t('tasks.taskTypeFilter.label')) }] : []),
    ...(due !== 'ALL' ? [{ key: 'due', label: `${t('tasks.dueDate')}: ${t(`tasks.dueFilters.${due}`)}`,
      onRemove: () => resetPageAnd(() => setDue('ALL')), removeLabel: removeLabel(t('tasks.dueDate')) }] : []),
    ...(tagIds.length || tagMatch === 'UNTAGGED' ? [{ key: 'tags',
      label: `${t('tags.filter')}: ${tagMatch === 'UNTAGGED' ? t('tags.untagged') : `${tagIds.length} (${tagMatch})`}`,
      onRemove: () => resetPageAnd(() => { setTagIds([]); setTagMatch('ANY') }), removeLabel: removeLabel(t('tags.filter')) }] : []),
  ]

  const filterContent = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-1.5 sm:col-span-2">
        <label className="text-muted-foreground block text-xs font-medium">{t(tab === 'with' ? 'taskSharing.receivedFrom' : 'taskSharing.sentTo')}</label>
        <SharePeopleFilter people={people} value={personId} onChange={next => resetPageAnd(() => setPersonId(next))}
          disabled={peopleQuery.isPending || peopleQuery.isError} />
        {peopleQuery.isError ? <p className="text-destructive text-xs">{t('taskSharing.peopleError')}</p> : null}
      </div>
      <div className="min-w-0 space-y-1.5">
        <label className="text-muted-foreground block text-xs font-medium">{t('tasks.allStatuses')}</label>
        <Select value={status} onValueChange={next => resetPageAnd(() => setStatus(next as typeof status))}>
          <SelectTrigger aria-label={t('tasks.allStatuses')}><SelectValue>
            {status === 'ALL' ? t('tasks.toolbar.all') : <TaskStatusIndicator status={status} pill />}
          </SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="ALL">{t('tasks.toolbar.all')}</SelectItem>
            {TASK_STATUSES.map(value => <SelectItem key={value} value={value}><TaskStatusIndicator status={value}/></SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 space-y-1.5">
        <label className="text-muted-foreground block text-xs font-medium">{t('tasks.priority')}</label>
        <Select value={priority} onValueChange={next => resetPageAnd(() => setPriority(next as typeof priority))}>
          <SelectTrigger aria-label={t('tasks.priority')}><SelectValue>
            {priority === 'ALL' ? t('tasks.toolbar.all') : <TaskPriorityIndicator priority={priority} pill />}
          </SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="ALL">{t('tasks.toolbar.all')}</SelectItem>
            {TASK_PRIORITIES.map(value => <SelectItem key={value} value={value}><TaskPriorityIndicator priority={value}/></SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 space-y-1.5">
        <label className="text-muted-foreground block text-xs font-medium">{t('taskSharing.permissions')}</label>
        <Select value={permission} onValueChange={next => resetPageAnd(() => setPermission(next as typeof permission))}>
          <SelectTrigger aria-label={t('taskSharing.permissions')}><SelectValue>
            {permission === 'ALL' ? t('tasks.toolbar.all') : (
              <span className="flex items-center gap-2">{permission === 'VIEW' ? <Eye className="size-4"/> : <Pencil className="size-4"/>}
                {t(permission === 'VIEW' ? 'taskSharing.view' : 'taskSharing.edit')}</span>
            )}
          </SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="ALL">{t('tasks.toolbar.all')}</SelectItem>
            <SelectItem value="VIEW"><span className="flex items-center gap-2"><Eye className="size-4"/>{t('taskSharing.view')}</span></SelectItem>
            <SelectItem value="EDIT"><span className="flex items-center gap-2"><Pencil className="size-4"/>{t('taskSharing.edit')}</span></SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 space-y-1.5">
        <label className="text-muted-foreground block text-xs font-medium">{t('tasks.taskTypeFilter.label')}</label>
        <TaskTypeFilterSelect value={taskType} onChange={next => resetPageAnd(() => setTaskType(next))} />
      </div>
      <div className="min-w-0 space-y-1.5">
        <label className="text-muted-foreground block text-xs font-medium">{t('tags.filter')}</label>
        <TaskTagFilter value={tagIds} onChange={next => resetPageAnd(() => setTagIds(next))}
          match={tagMatch} onMatchChange={next => resetPageAnd(() => setTagMatch(next))} />
      </div>
      <div className="min-w-0 space-y-1.5">
        <label className="text-muted-foreground block text-xs font-medium">{t('tasks.dueDate')}</label>
        <Select value={due} onValueChange={next => resetPageAnd(() => setDue(next as TaskDueFilter))}>
          <SelectTrigger aria-label={t('tasks.dueDate')}><SelectValue>
            {due === 'ALL' ? t('tasks.toolbar.all') : <TaskDueIndicator due={due} pill />}
          </SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="ALL">{t('tasks.toolbar.all')}</SelectItem>
            {TASK_DUE_FILTERS.filter(value => value !== 'ALL').map(value =>
              <SelectItem key={value} value={value}><TaskDueIndicator due={value}/></SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  function groupLabel(task: SharedTask): string {
    if (groupBy === 'STATUS') return t(`tasks.statuses.${task.status}`)
    if (groupBy === 'PRIORITY') return t(`tasks.priorities.${task.priority}`)
    if (groupBy === 'DUE_DATE') {
      const date = task.dueDate ? parseDateOnly(task.dueDate) : null
      return date ? date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }) : t('tasks.noDueDate')
    }
    return ''
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-7">
      <header className="space-y-1"><h1 className="flex items-center gap-2 text-2xl font-bold">
        <Share2 className="text-primary size-6"/>{t('taskSharing.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('taskSharing.people')}</p>
      </header>
      <div role="tablist" aria-label={t('taskSharing.title')} className="flex flex-wrap gap-2 border-b pb-3">
        {(['with','by'] as const).map(value =>
          <Button key={value} type="button" role="tab" aria-selected={tab === value}
            variant={tab === value ? 'default' : 'outline'} onClick={() => changeTab(value)}>
            {t(value === 'with' ? 'taskSharing.received' : 'taskSharing.sent')}
          </Button>)}
      </div>
      <TaskCollectionToolbar
        searchValue={search} onSearchChange={next => resetPageAnd(() => setSearch(next))}
        searchAriaLabel={t('taskSharing.search')} searchPlaceholder={t('taskSharing.search')}
        filterButtonLabel={t('tasks.toolbar.filters')} filterTitle={t('tasks.toolbar.filterTitle')}
        filterDescription={t('tasks.toolbar.filterDescription')}
        filterCount={chips.length} filterContent={filterContent}
        clearFiltersLabel={t('tasks.toolbar.clear')} onClearFilters={clearFilters} closeLabel={t('common.close')}
        groupValue={groupBy} groupLabel={t('tasks.toolbar.group')}
        groupOptions={(['NONE','STATUS','PRIORITY','DUE_DATE'] as const).map(value => ({
          value, label: t(`tasks.toolbar.groupValues.${value}`),
        }))}
        onGroupChange={next => setGroupBy(next as GroupBy)}
        sortValue={sortBy} sortLabel={t('tasks.toolbar.sort')}
        sortOptions={(['createdAt','dueDate','priority','title','status'] as const).map(value => ({
          value, label: t(`tasks.sortFields.${value}`),
        }))}
        onSortChange={next => resetPageAnd(() => setSortBy(next as TaskSortField))}
        sortDirection={sortDirection} onSortDirectionChange={next => resetPageAnd(() => setSortDirection(next))}
        sortDirectionLabel={t('tasks.toolbar.sortDirection')}
        ascendingLabel={t('tasks.toolbar.ascending')} descendingLabel={t('tasks.toolbar.descending')}
        activeFilters={chips} activeFiltersLabel={t('tasks.toolbar.active')}
      />
      {query.isPending ? <div className="flex justify-center py-16"><Loader2 className="size-7 animate-spin"/></div>
        : query.isError ? <div className="text-destructive rounded-xl border p-6">{t('taskSharing.error')}{' '}
          <Button variant="outline" onClick={() => void query.refetch()}>{t('common.retry')}</Button></div>
        : groups.length === 0 ? <p className="text-muted-foreground rounded-xl border p-8 text-center">{t('taskSharing.empty')}</p>
        : <div className="space-y-4">
          {groups.map(tasks => {
            const firstTask = tasks[0]
            if (!firstTask) return null
            return <section key={groupKey(firstTask, groupBy)} className="space-y-3">
            {groupBy !== 'NONE' ? <div className="text-muted-foreground flex items-center gap-3 pt-2 text-xs font-semibold uppercase tracking-wide">
              <span className="truncate">{groupLabel(firstTask)}</span><span className="bg-border h-px flex-1"/>
            </div> : null}
            {tasks.map(task => <article key={task.taskId} role="button" tabIndex={0}
              onClick={() => setDetailsId(task.taskId)}
              onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault(); setDetailsId(task.taskId)
              } }}
              className="border-border bg-card hover:border-primary/40 hover:shadow-sm focus-visible:ring-ring cursor-pointer rounded-xl border p-4 transition sm:p-5 focus-visible:outline-none focus-visible:ring-2">
              <TaskCardLayout
                title={<div className="space-y-1"><p className="text-base font-semibold">{task.title}</p>
                  <p className="text-muted-foreground text-xs">{t('taskSharing.sharedBy')}: {task.ownerName} - {task.ownerCode}</p></div>}
                tags={<div className="flex flex-wrap items-center justify-end gap-2">
                  <TaskTags tags={task.tags} compact />
                  <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
                    {tab === 'by' ? <><UsersRound className="size-3.5"/>{task.recipientCount} {t('taskSharing.people')}</>
                      : <>{task.permission === 'EDIT' ? <Pencil className="size-3.5"/> : <Eye className="size-3.5"/>}
                        {t(task.permission === 'EDIT' ? 'taskSharing.edit' : 'taskSharing.view')}</>}
                  </span></div>}
                details={<div className="space-y-2">
                  <DiscussionShortcut
                    available={Object.hasOwn(discussionQuery.data ?? {}, task.taskId)}
                    unread={discussionQuery.data?.[task.taskId] ?? 0}
                    onOpen={() => openTaskDiscussion(task.taskId)} />
                  <p className="text-muted-foreground line-clamp-2 text-sm">{task.description}</p>
                </div>}
                metadata={<><TaskStatusIndicator status={task.status}/><TaskPriorityIndicator priority={task.priority} pill/>
                  {task.dueDate ? <span>{task.dueDate}</span> : null}</>}
                actions={tab === 'by' ? <Button type="button" variant="outline" size="sm"
                  onClick={event => {event.stopPropagation(); setSharingId(task.taskId)}}>
                  <Share2 className="size-4"/>{t('taskSharing.share')}</Button>
                  : task.permission === 'EDIT' ? <Button type="button" size="sm" variant="outline"
                    onClick={event => {event.stopPropagation(); setEditingTask(task)}}>
                    <Pencil className="size-4"/>{t('taskSharing.edit')}</Button> : undefined}
              />
            </article>)}
          </section>
          })}
        </div>}
      <TablePagination page={page} totalPages={Math.ceil(total / pageSize)} pageSize={pageSize}
        startRow={total ? (page - 1) * pageSize + 1 : 0} endRow={Math.min(total, page * pageSize)}
        totalRows={total} pageSizes={[20,50]} onPageChange={setPage}
        onPageSizeChange={next => {setPageSize(next);setPage(1)}} />
      <TaskDetailsDrawer taskId={detailsId} onOpenChange={open => { if (!open) {
        setDetailsId(null)
        setParams(current => { const next = new URLSearchParams(current); next.delete('taskId'); next.delete('discussion'); next.delete('subtaskId'); return next })
        void client.invalidateQueries({queryKey:['task-shares']})
      } }} />
      {editingTask ? <EditSharedTaskDialog task={editingTask} open onOpenChange={open => {if (!open) setEditingTask(null)}}/> : null}
      {sharingId !== null ? <ShareTaskDialog taskId={sharingId} open onOpenChange={open => {if (!open) setSharingId(null)}}/> : null}
    </div>
  )
}

