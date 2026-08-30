import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'

import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { CalendarDayPanel } from '@/features/calendar/components/CalendarDayPanel'
import {
  CalendarFilters,
  type CalendarFilterState,
} from '@/features/calendar/components/CalendarFilters'
import { TaskCalendar } from '@/features/calendar/components/TaskCalendar'
import { useCalendarTasks } from '@/features/calendar/hooks/use-calendar-tasks'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import type {
  CalendarSearchTarget,
  CalendarTask,
  CalendarTaskFilters,
  CalendarViewMode,
  CalendarVisibleRange,
} from '@/features/calendar/types/calendar.types'
import { useLists } from '@/features/lists/hooks/use-lists'
import { useUpdatePreferences } from '@/features/preferences/hooks/use-update-preferences'
import { TaskDetailsDrawer } from '@/features/tasks/components/TaskDetailsDrawer'
import { TaskEditorDialog } from '@/features/tasks/components/TaskEditorDialog'
import { useWorkCycles } from '@/features/work-cycles/hooks/use-work-cycles'

export function CalendarPage() {
  const { t } = useTranslation()
  const [range, setRange] = useState<CalendarVisibleRange | null>(null)
  const [viewMode, setViewMode] = useState<CalendarViewMode>('MONTH')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayPanelOpen, setDayPanelOpen] = useState(false)
  const [detailsTaskId, setDetailsTaskId] = useState<number | null>(null)
  const [searchTarget, setSearchTarget] = useState<CalendarSearchTarget | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [showAdjacentDatesOverride, setShowAdjacentDatesOverride] = useState<boolean | null>(null)
  const [filters, setFilters] = useState<CalendarFilterState>({
    scope: 'PERSONAL',
    search: '',
  })
  const changeFilters = useCallback(
    (nextFilters: CalendarFilterState) => {
      if (nextFilters.search !== filters.search) {
        setSearchTarget(null)
      }

      setFilters(nextFilters)
    },
    [filters.search],
  )
  const currentUserQuery = useCurrentUser()
  const updatePreferencesMutation = useUpdatePreferences()
  const listsQuery = useLists()
  const cyclesQuery = useWorkCycles()
  const savedShowAdjacentDates =
    currentUserQuery.data?.preferences.calendarShowAdjacentDates ?? true
  const showAdjacentDates = showAdjacentDatesOverride ?? savedShowAdjacentDates

  useEffect(() => {
    setShowAdjacentDatesOverride(null)
  }, [savedShowAdjacentDates])

  const queryFilters = useMemo<CalendarTaskFilters | null>(() => {
    if (!range) return null
    return {
      start: range.start,
      end: range.end,
      scope: filters.scope,
      status: filters.status,
      priority: filters.priority,
      listId: filters.scope === 'PERSONAL' ? filters.listId : undefined,
      cycleId: filters.scope === 'KPI' ? filters.cycleId : undefined,
      kpiInstanceId: filters.scope === 'KPI' ? filters.kpiInstanceId : undefined,
    }
  }, [filters, range])

  const tasksQuery = useCalendarTasks(queryFilters)
  const tasks = tasksQuery.data ?? []

  useEffect(() => {
    if (!searchTarget) return

    const detailsTimer = window.setTimeout(() => {
      setDetailsTaskId(searchTarget.taskId)
    }, 850)
    const highlightTimer = window.setTimeout(() => {
      setSearchTarget((current) => (current?.requestId === searchTarget.requestId ? null : current))
    }, 2500)

    return () => {
      window.clearTimeout(detailsTimer)
      window.clearTimeout(highlightTimer)
    }
  }, [searchTarget])
  const selectedDateTasks = selectedDate
    ? tasks.filter((task) => task.calendarDate === selectedDate)
    : []

  const lists = listsQuery.data ?? []
  const defaultList = lists.find((list) => list.isDefault) ?? lists[0] ?? null
  const openCycles = (cyclesQuery.data ?? []).filter(
    (cycle) =>
      cycle.archivedAtUtc === null &&
      cycle.closedAtUtc === null &&
      cycle.instances.some((instance) => instance.isActive && instance.taskPolicy.allowsTasks),
  )
  const filteredInstanceContext = filters.kpiInstanceId
    ? (openCycles
        .flatMap((cycle) => cycle.instances.map((instance) => ({ cycle, instance })))
        .find(
          ({ instance }) =>
            instance.id === filters.kpiInstanceId &&
            instance.isActive &&
            instance.taskPolicy.allowsTasks,
        ) ?? null)
    : null
  const filteredInitialCycle =
    openCycles.find((cycle) => cycle.id === filters.cycleId) ??
    filteredInstanceContext?.cycle ??
    null
  const fallbackInitialCycle =
    filteredInitialCycle ?? openCycles.find((cycle) => cycle.isCurrent) ?? openCycles[0] ?? null
  const filteredInitialInstance =
    filteredInstanceContext !== null &&
    filteredInstanceContext.cycle.id === fallbackInitialCycle?.id
      ? filteredInstanceContext.instance
      : fallbackInitialCycle?.instances.find(
          (instance) =>
            instance.id === filters.kpiInstanceId &&
            instance.isActive &&
            instance.taskPolicy.allowsTasks,
        )

  const canCreate =
    filters.scope === 'PERSONAL'
      ? !listsQuery.isPending && !listsQuery.isError && lists.length > 0
      : !cyclesQuery.isPending && !cyclesQuery.isError && openCycles.length > 0
  const createUnavailableReason =
    filters.scope === 'PERSONAL'
      ? listsQuery.isError
        ? t('calendar.createListsUnavailable')
        : lists.length === 0 && !listsQuery.isPending
          ? t('calendar.createListRequired')
          : undefined
      : cyclesQuery.isError
        ? t('calendar.createCyclesUnavailable')
        : openCycles.length === 0 && !cyclesQuery.isPending
          ? t('calendar.createOpenCycleRequired')
          : undefined

  function changeAdjacentDateDisplay(nextValue: boolean) {
    if (nextValue === showAdjacentDates) return

    setShowAdjacentDatesOverride(nextValue)
    updatePreferencesMutation.mutate(
      { calendarShowAdjacentDates: nextValue },
      {
        onError: () => {
          setShowAdjacentDatesOverride(null)
          toast.error(t('calendar.displayPreferenceError'))
        },
      },
    )
  }

  function selectDate(date: string) {
    setSearchTarget(null)
    setSelectedDate(date)
    setDayPanelOpen(true)
  }

  function openTask(taskId: number) {
    setSearchTarget(null)
    setDayPanelOpen(false)
    setSelectedDate(null)
    setDetailsTaskId(taskId)
  }

  function openSearchResult(task: CalendarTask) {
    setEditorOpen(false)
    setDayPanelOpen(false)
    setSelectedDate(task.calendarDate)
    setSearchTarget({
      taskId: task.id,
      calendarDate: task.calendarDate,
      requestId: Date.now(),
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('calendar.eyebrow')}
        title={t('calendar.title')}
        description={t('calendar.description')}
      />

      <CalendarFilters
        value={filters}
        onChange={changeFilters}
        onOpenSearchResult={openSearchResult}
      />

      {tasksQuery.isError ? (
        <ErrorState
          className="min-h-44"
          title={t('calendar.loadErrorTitle')}
          description={t('calendar.loadErrorDescription')}
          onRetry={() => void tasksQuery.refetch()}
        />
      ) : null}

      <TaskCalendar
        tasks={tasks}
        isFetching={tasksQuery.isFetching}
        showEmpty={tasksQuery.isSuccess && tasks.length === 0}
        viewMode={viewMode}
        selectedDate={selectedDate}
        searchTarget={searchTarget}
        showAdjacentDates={showAdjacentDates}
        displayPreferencePending={updatePreferencesMutation.isPending}
        onViewModeChange={setViewMode}
        onShowAdjacentDatesChange={changeAdjacentDateDisplay}
        onRangeChange={setRange}
        onSelectDate={selectDate}
        onOpenTask={openTask}
      />

      <CalendarDayPanel
        date={dayPanelOpen ? selectedDate : null}
        tasks={selectedDateTasks}
        scope={filters.scope}
        canCreate={canCreate}
        createUnavailableReason={createUnavailableReason}
        onOpenChange={(open) => {
          setDayPanelOpen(open)
          if (!open) setSelectedDate(null)
        }}
        onOpenTask={openTask}
        onCreateTask={() => setEditorOpen(true)}
      />

      {editorOpen && selectedDate ? (
        filters.scope === 'PERSONAL' ? (
          lists.length > 0 ? (
            <TaskEditorDialog
              key={`calendar-personal-${selectedDate}-${filters.listId ?? 'default'}`}
              open
              onOpenChange={setEditorOpen}
              lists={lists}
              initialListId={filters.listId ?? defaultList?.id ?? null}
              initialCalendarDate={selectedDate}
              allowListSelectionOnCreate
              onSaved={() => void tasksQuery.refetch()}
            />
          ) : null
        ) : openCycles.length > 0 ? (
          <TaskEditorDialog
            key={`calendar-kpi-${selectedDate}-${fallbackInitialCycle?.id ?? 'cycle'}-${filteredInitialInstance?.id ?? 'instance'}`}
            open
            onOpenChange={setEditorOpen}
            cycles={openCycles}
            initialCycleId={fallbackInitialCycle?.id ?? null}
            initialKpiInstanceId={filteredInitialInstance?.id ?? null}
            initialCalendarDate={selectedDate}
            onSaved={() => void tasksQuery.refetch()}
          />
        ) : null
      ) : null}

      <TaskDetailsDrawer
        taskId={detailsTaskId}
        onOpenChange={(open) => {
          if (!open) setDetailsTaskId(null)
        }}
      />
    </div>
  )
}
