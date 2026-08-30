import { BriefcaseBusiness, CalendarDays, Gauge, ListTodo, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { TaskDueIndicator, TaskPriorityIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import { useClickOutside } from '@/hooks/use-click-outside'
import { APP_TIME_ZONE } from '@/lib/date-time'
import { parseDateOnly } from '@/lib/date-only'

import { useCalendarSearch } from '../hooks/use-calendar-search'
import type {
  CalendarSearchFilters,
  CalendarTask,
  CalendarScope,
} from '../types/calendar.types'

const SEARCH_DEBOUNCE_MS = 300
const MIN_SEARCH_LENGTH = 2

interface Props {
  value: string
  scope: CalendarScope
  status?: CalendarSearchFilters['status']
  priority?: CalendarSearchFilters['priority']
  listId?: number | undefined
  cycleId?: number | undefined
  kpiInstanceId?: number | undefined
  onChange: (value: string) => void
  onOpenTask: (task: CalendarTask) => void
}

export function getCurrentDateOnlyInAppTimeZone(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function groupCalendarSearchResults(items: CalendarTask[], today: string) {
  return {
    upcoming: items.filter((item) => item.calendarDate >= today),
    past: items.filter((item) => item.calendarDate < today),
  }
}

export function CalendarSearch({
  cycleId,
  kpiInstanceId,
  listId,
  onChange,
  onOpenTask,
  priority,
  scope,
  status,
  value,
}: Props) {
  const { i18n, t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState(value.trim())
  const trimmedValue = value.trim()

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(trimmedValue),
      SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [trimmedValue])

  useClickOutside(rootRef, () => setOpen(false), open)

  const queryFilters = useMemo<CalendarSearchFilters | null>(() => {
    if (debouncedQuery.length < MIN_SEARCH_LENGTH) return null
    return {
      query: debouncedQuery,
      scope,
      status,
      priority,
      listId: scope === 'PERSONAL' ? listId : undefined,
      cycleId: scope === 'KPI' ? cycleId : undefined,
      kpiInstanceId: scope === 'KPI' ? kpiInstanceId : undefined,
    }
  }, [cycleId, debouncedQuery, kpiInstanceId, listId, priority, scope, status])

  const searchQuery = useCalendarSearch(queryFilters)
  const items = searchQuery.data?.items ?? []
  const grouped = useMemo(
    () => groupCalendarSearchResults(items, getCurrentDateOnlyInAppTimeZone()),
    [items],
  )
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [i18n.language],
  )
  const showPanel = open && trimmedValue.length > 0
  const waitingForDebounce =
    trimmedValue.length >= MIN_SEARCH_LENGTH && debouncedQuery !== trimmedValue

  function changeValue(next: string) {
    onChange(next)
    setOpen(next.trim().length > 0)
  }

  function clearSearch() {
    onChange('')
    setDebouncedQuery('')
    setOpen(false)
  }

  function selectTask(task: CalendarTask) {
    setOpen(false)
    onOpenTask(task)
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <Command
        shouldFilter={false}
        loop
        className="size-auto overflow-visible bg-transparent [&_[data-cmdk-input-wrapper]]:rounded-md [&_[data-cmdk-input-wrapper]]:border [&_[data-cmdk-input-wrapper]]:border-input [&_[data-cmdk-input-wrapper]]:bg-background [&_[data-cmdk-input-wrapper]]:shadow-xs"
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape' && showPanel) {
            event.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <div className="relative">
          <CommandInput
            value={value}
            onValueChange={changeValue}
            onFocus={() => {
              if (trimmedValue.length > 0) setOpen(true)
              if (
                trimmedValue.length >= MIN_SEARCH_LENGTH &&
                debouncedQuery === trimmedValue &&
                !searchQuery.isFetching
              ) {
                void searchQuery.refetch()
              }
            }}
            placeholder={t('calendar.searchPlaceholder')}
            aria-label={t('calendar.searchLabel')}
            className="h-10 pe-10 py-2"
          />
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('common.clearSearch')}
              className="absolute end-0.5 top-1/2 size-9 -translate-y-1/2"
              onClick={clearSearch}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>

        {showPanel ? (
          <CommandList className="border-border bg-popover text-popover-foreground z-50 mt-2 max-h-[24rem] w-full rounded-xl border p-2 shadow-xl sm:absolute sm:start-0 sm:top-full sm:w-[min(43rem,calc(100vw-3rem))]">
            {trimmedValue.length < MIN_SEARCH_LENGTH ? (
              <SearchMessage icon={Search}>{t('calendar.searchMinimumHint')}</SearchMessage>
            ) : waitingForDebounce || (searchQuery.isFetching && !searchQuery.data) ? (
              <SearchMessage icon={Search}>{t('calendar.searchingAll')}</SearchMessage>
            ) : searchQuery.isError ? (
              <SearchMessage icon={Search} destructive>
                {t('calendar.searchError')}
              </SearchMessage>
            ) : items.length === 0 ? (
              <SearchMessage icon={Search}>
                <span className="font-medium">{t('calendar.searchNoResults')}</span>
                <span className="mt-1 block text-xs">{t('calendar.searchNoResultsHint')}</span>
              </SearchMessage>
            ) : (
              <>
                <div className="text-muted-foreground flex items-center justify-between gap-3 px-2 pb-1 pt-0.5 text-[11px] font-medium">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-foreground font-semibold">
                      {t('calendar.searchResultsTitle')}
                    </span>
                    <span>
                      {searchQuery.data && searchQuery.data.total > items.length
                        ? t('calendar.searchResultCountLimited', {
                            shown: items.length,
                            total: searchQuery.data.total,
                          })
                        : t('calendar.searchResultCount', {
                            count: searchQuery.data?.total ?? items.length,
                          })}
                    </span>
                  </span>
                  <span className="hidden sm:inline">{t('calendar.searchKeyboardHint')}</span>
                </div>

                {grouped.upcoming.length > 0 ? (
                  <CalendarSearchSection
                    title={t('calendar.searchUpcoming')}
                    tasks={grouped.upcoming}
                    dateFormatter={dateFormatter}
                    onSelect={selectTask}
                  />
                ) : null}

                {grouped.past.length > 0 ? (
                  <CalendarSearchSection
                    title={t('calendar.searchPast')}
                    tasks={grouped.past}
                    dateFormatter={dateFormatter}
                    onSelect={selectTask}
                  />
                ) : null}
              </>
            )}
          </CommandList>
        ) : null}
      </Command>
    </div>
  )
}

function SearchMessage({
  children,
  destructive = false,
  icon: Icon,
}: {
  children: ReactNode
  destructive?: boolean
  icon: typeof Search
}) {
  return (
    <div
      className={
        destructive
          ? 'text-destructive px-3 py-8 text-center text-sm'
          : 'text-muted-foreground px-3 py-8 text-center text-sm'
      }
    >
      <Icon aria-hidden="true" className="mx-auto mb-2 size-5 opacity-60" />
      {children}
    </div>
  )
}

function CalendarSearchSection({
  dateFormatter,
  onSelect,
  tasks,
  title,
}: {
  dateFormatter: Intl.DateTimeFormat
  onSelect: (task: CalendarTask) => void
  tasks: CalendarTask[]
  title: string
}) {
  return (
    <section className="py-1">
      <p className="text-muted-foreground px-2 py-1.5 text-[11px] font-semibold tracking-wide">
        {title}
      </p>
      {tasks.map((task) => (
        <CalendarSearchResultItem
          key={task.id}
          task={task}
          dateFormatter={dateFormatter}
          onSelect={onSelect}
        />
      ))}
    </section>
  )
}

function CalendarSearchResultItem({
  dateFormatter,
  onSelect,
  task,
}: {
  dateFormatter: Intl.DateTimeFormat
  onSelect: (task: CalendarTask) => void
  task: CalendarTask
}) {
  const { t } = useTranslation()
  const parsedDate = parseDateOnly(task.calendarDate)
  const formattedDate = parsedDate ? dateFormatter.format(parsedDate) : task.calendarDate

  return (
    <CommandItem
      value={`calendar-task-${task.id}`}
      className="items-start px-2.5 py-2.5"
      onSelect={() => onSelect(task)}
    >
      <span className="bg-primary/8 text-primary mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg">
        <CalendarDays aria-hidden="true" className="size-4" />
      </span>

      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="text-foreground block truncate font-semibold">{task.title}</span>
        <span className="text-muted-foreground block text-xs">{formattedDate}</span>

        <span className="flex flex-wrap items-center gap-1.5">
          <TaskStatusIndicator status={task.status} pill />
          <TaskPriorityIndicator priority={task.priority} pill />
          {task.isOverdue ? (
            <TaskDueIndicator due="OVERDUE" label={t('tasks.overdue')} pill />
          ) : null}
        </span>

        {task.listId !== null ? (
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
            <ListTodo aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{task.listName ?? t('calendar.taskContextUnavailable')}</span>
          </span>
        ) : (
          <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {task.cycleTitle ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <BriefcaseBusiness aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{task.cycleTitle}</span>
              </span>
            ) : null}
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Gauge aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{task.kpiName ?? t('calendar.taskContextUnavailable')}</span>
            </span>
          </span>
        )}
      </span>
    </CommandItem>
  )
}
