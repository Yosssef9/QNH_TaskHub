import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router'

import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { CalendarDayPanel } from '@/features/calendar/components/CalendarDayPanel'
import {
  CalendarFilters,
  selectedTaskScopes,
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
import { useMeetingSchedule } from '@/features/meetings/hooks/use-meetings'
import { useUpdatePreferences } from '@/features/preferences/hooks/use-update-preferences'
import { TaskDetailsDrawer } from '@/features/tasks/components/TaskDetailsDrawer'
import { TaskEditorDialog } from '@/features/tasks/components/TaskEditorDialog'
import { useWorkCycles } from '@/features/work-cycles/hooks/use-work-cycles'
import { riyadhLocalDateTimeToUtcIso } from '@/lib/date-time'

export function CalendarPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [range, setRange] = useState<CalendarVisibleRange | null>(null)
  const [viewMode, setViewMode] = useState<CalendarViewMode>('MONTH')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayPanelOpen, setDayPanelOpen] = useState(false)
  const [detailsTaskId, setDetailsTaskId] = useState<number | null>(null)
  const [searchTarget, setSearchTarget] = useState<CalendarSearchTarget | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [showAdjacentDatesOverride, setShowAdjacentDatesOverride] = useState<boolean | null>(null)
  const [filters, setFilters] = useState<CalendarFilterState>({
    sources: {
      personal: true,
      kpi: false,
      meetings: false,
    },
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

  const personalQueryFilters = useMemo<CalendarTaskFilters | null>(() => {
    if (!range || !filters.sources.personal) return null
    return {
      start: range.start,
      end: range.end,
      scope: 'PERSONAL',
      status: filters.status,
      priority: filters.priority,
      listId: filters.listId,
    }
  }, [filters, range])

  const kpiQueryFilters = useMemo<CalendarTaskFilters | null>(() => {
    if (!range || !filters.sources.kpi) return null
    return {
      start: range.start,
      end: range.end,
      scope: 'KPI',
      status: filters.status,
      priority: filters.priority,
      cycleId: filters.cycleId,
      kpiInstanceId: filters.kpiInstanceId,
    }
  }, [filters, range])

  const meetingScheduleInput = useMemo(() => {
    if (!range || !filters.sources.meetings) return null
    return {
      fromAtUtc: riyadhLocalDateTimeToUtcIso(range.start, '00:00'),
      toAtUtc: riyadhLocalDateTimeToUtcIso(range.end, '00:00'),
      ...(filters.roomId === undefined ? {} : { roomId: filters.roomId }),
    }
  }, [filters.roomId, filters.sources.meetings, range])

  const personalTasksQuery = useCalendarTasks(personalQueryFilters)
  const kpiTasksQuery = useCalendarTasks(kpiQueryFilters)
  const meetingsQuery = useMeetingSchedule(meetingScheduleInput)

  const tasks = useMemo(
    () => [...(personalTasksQuery.data ?? []), ...(kpiTasksQuery.data ?? [])],
    [kpiTasksQuery.data, personalTasksQuery.data],
  )
  const meetings = meetingsQuery.data ?? []

  useEffect(() => {
    if (!searchTarget) return

    const detailsTimer = window.setTimeout(() => {
      setDetailsTaskId(searchTarget.taskId)
    }, 850)
    const highlightTimer = window.setTimeout(() => {
      setSearchTarget((current) =>
        current?.requestId === searchTarget.requestId ? null : current,
      )
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

  const taskScopes = selectedTaskScopes(filters)
  const createScope = taskScopes.length === 1 ? taskScopes[0] : null
  const canCreate =
    createScope === 'PERSONAL'
      ? !listsQuery.isPending && !listsQuery.isError && lists.length > 0
      : createScope === 'KPI'
        ? !cyclesQuery.isPending && !cyclesQuery.isError && openCycles.length > 0
        : false
  const createUnavailableReason =
    taskScopes.length !== 1
      ? t('calendar.createSingleTaskSourceRequired')
      : createScope === 'PERSONAL'
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

  function refetchTaskQueries() {
    if (filters.sources.personal) void personalTasksQuery.refetch()
    if (filters.sources.kpi) void kpiTasksQuery.refetch()
  }

  const taskLoadError =
    (filters.sources.personal && personalTasksQuery.isError) ||
    (filters.sources.kpi && kpiTasksQuery.isError)
  const meetingLoadError = filters.sources.meetings && meetingsQuery.isError
  const isFetching =
    (filters.sources.personal && personalTasksQuery.isFetching) ||
    (filters.sources.kpi && kpiTasksQuery.isFetching) ||
    (filters.sources.meetings && meetingsQuery.isFetching)
  const enabledQueriesSucceeded =
    (!filters.sources.personal || personalTasksQuery.isSuccess) &&
    (!filters.sources.kpi || kpiTasksQuery.isSuccess) &&
    (!filters.sources.meetings || meetingsQuery.isSuccess)

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

      {taskLoadError || meetingLoadError ? (
        <ErrorState
          className="min-h-44"
          title={t('calendar.loadErrorTitle')}
          description={t('calendar.loadErrorDescription')}
          onRetry={() => {
            if (filters.sources.personal) void personalTasksQuery.refetch()
            if (filters.sources.kpi) void kpiTasksQuery.refetch()
            if (filters.sources.meetings) void meetingsQuery.refetch()
          }}
        />
      ) : null}

      <TaskCalendar
        tasks={tasks}
        meetings={meetings}
        meetingsEnabled={filters.sources.meetings}
        isFetching={Boolean(isFetching)}
        showEmpty={enabledQueriesSucceeded && tasks.length === 0 && meetings.length === 0}
        viewMode={viewMode}
        selectedDate={selectedDate}
        searchTarget={searchTarget}
        showAdjacentDates={showAdjacentDates}
        displayPreferencePending={updatePreferencesMutation.isPending}
        onViewModeChange={(next) => {
          setDayPanelOpen(false)
          if (next !== 'MONTH') setSelectedDate(null)
          setViewMode(next)
        }}
        onShowAdjacentDatesChange={changeAdjacentDateDisplay}
        onRangeChange={setRange}
        onSelectDate={selectDate}
        onOpenTask={openTask}
        onOpenMeeting={(meetingId) => navigate(`/meetings/${meetingId}`)}
      />

      <CalendarDayPanel
        date={dayPanelOpen ? selectedDate : null}
        tasks={selectedDateTasks}
        scope={createScope ?? 'PERSONAL'}
        canCreate={canCreate}
        createUnavailableReason={createUnavailableReason}
        onOpenChange={(open) => {
          setDayPanelOpen(open)
          if (!open) setSelectedDate(null)
        }}
        onOpenTask={openTask}
        onCreateTask={() => setEditorOpen(true)}
      />

      {editorOpen && selectedDate && createScope ? (
        createScope === 'PERSONAL' ? (
          lists.length > 0 ? (
            <TaskEditorDialog
              key={`calendar-personal-${selectedDate}-${filters.listId ?? 'default'}`}
              open
              onOpenChange={setEditorOpen}
              lists={lists}
              initialListId={filters.listId ?? defaultList?.id ?? null}
              initialCalendarDate={selectedDate}
              allowListSelectionOnCreate
              onSaved={refetchTaskQueries}
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
            onSaved={refetchTaskQueries}
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
