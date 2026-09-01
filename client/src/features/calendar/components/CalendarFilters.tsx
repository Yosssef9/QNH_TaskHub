import {
  BriefcaseBusiness,
  CalendarClock,
  Gauge,
  ListFilter,
  ListTodo,
  MapPin,
  RotateCcw,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { appIcons } from '@/config/app-icons'
import { KpiSelectIndicator } from '@/features/kpis/components/KpiSelectIndicator'
import { ListSelectIndicator } from '@/features/lists/components/ListSelectIndicator'
import { useLists } from '@/features/lists/hooks/use-lists'
import { useActiveMeetingRooms } from '@/features/meetings/hooks/use-meeting-rooms'
import type { MeetingRoom } from '@/features/meetings/types/meeting.types'
import { TaskPriorityIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import type { TaskPriority, TaskStatus } from '@/features/tasks/types/task.types'
import { useWorkCycles } from '@/features/work-cycles/hooks/use-work-cycles'
import type { WorkCycle } from '@/features/work-cycles/types/work-cycle.types'
import { cn } from '@/lib/cn'

import type {
  CalendarScope,
  CalendarSource,
  CalendarSourceSelection,
  CalendarTask,
} from '../types/calendar.types'
import { CalendarSearch } from './CalendarSearch'

const ALL = 'ALL'

export interface CalendarFilterState {
  sources: CalendarSourceSelection
  search: string
  status?: TaskStatus | undefined
  priority?: TaskPriority | undefined
  listId?: number | undefined
  cycleId?: number | undefined
  kpiInstanceId?: number | undefined
  roomId?: number | undefined
}

export function selectedTaskScopes(value: CalendarFilterState): CalendarScope[] {
  const scopes: CalendarScope[] = []
  if (value.sources.personal) scopes.push('PERSONAL')
  if (value.sources.kpi) scopes.push('KPI')
  return scopes
}

export function countActiveCalendarFilters(
  value: CalendarFilterState,
  currentCycleId?: number,
): number {
  const cycleFilterIsActive =
    value.sources.kpi &&
    (currentCycleId === undefined ? value.cycleId !== undefined : value.cycleId !== currentCycleId)

  return [
    value.search.trim().length > 0,
    value.status !== undefined,
    value.priority !== undefined,
    value.sources.personal && value.listId !== undefined,
    cycleFilterIsActive,
    value.sources.kpi && value.kpiInstanceId !== undefined,
    value.sources.meetings && value.roomId !== undefined,
  ].filter(Boolean).length
}

export function clearCalendarFilters(
  value: CalendarFilterState,
  currentCycleId?: number,
): CalendarFilterState {
  return {
    sources: value.sources,
    search: '',
    ...(value.sources.kpi && currentCycleId !== undefined ? { cycleId: currentCycleId } : {}),
  }
}

function NeutralFilterIndicator({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 font-medium">
      <span className="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-md">
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
      <span className="truncate">{label}</span>
    </span>
  )
}

function WorkCycleSelectIndicator({
  cycle,
  currentLabel,
}: {
  cycle: WorkCycle
  currentLabel: string
}) {
  const Icon = appIcons[cycle.iconKey]

  return (
    <span className="inline-flex min-w-0 items-center gap-2 font-medium">
      <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-md">
        <Icon aria-hidden="true" className="size-3.5" style={{ color: cycle.color }} />
      </span>
      <span className="min-w-0 truncate">{cycle.title}</span>
      {cycle.isCurrent ? (
        <span className="bg-primary/10 text-primary shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
          {currentLabel}
        </span>
      ) : null}
    </span>
  )
}

function roomLabel(room: MeetingRoom, arabic: boolean): string {
  const name = arabic ? room.nameAr : room.nameEn
  return room.code ? `${name} · ${room.code}` : name
}

interface Props {
  value: CalendarFilterState
  onChange: (next: CalendarFilterState) => void
  onOpenSearchResult: (task: CalendarTask) => void
}

export function CalendarFilters({ onChange, onOpenSearchResult, value }: Props) {
  const { i18n, t } = useTranslation()
  const listsQuery = useLists()
  const cyclesQuery = useWorkCycles()
  const roomsQuery = useActiveMeetingRooms(value.sources.meetings)
  const initializedKpiScope = useRef(false)
  const isArabic = i18n.language.toLowerCase().startsWith('ar')

  const cycles = useMemo(
    () => (cyclesQuery.data ?? []).filter((cycle) => cycle.archivedAtUtc === null),
    [cyclesQuery.data],
  )
  const currentCycle = cycles.find((cycle) => cycle.isCurrent && cycle.closedAtUtc === null) ?? null
  const selectedCycle = cycles.find((cycle) => cycle.id === value.cycleId) ?? null
  const selectedList = (listsQuery.data ?? []).find((list) => list.id === value.listId) ?? null
  const availableInstances = selectedCycle
    ? selectedCycle.instances
    : cycles.flatMap((cycle) => cycle.instances)
  const selectedInstance =
    availableInstances.find((instance) => instance.id === value.kpiInstanceId) ?? null
  const selectedRoom = (roomsQuery.data ?? []).find((room) => room.id === value.roomId) ?? null
  const taskScopes = selectedTaskScopes(value)

  useEffect(() => {
    if (!value.sources.kpi) {
      initializedKpiScope.current = false
      return
    }
    if (initializedKpiScope.current || cyclesQuery.isPending || cyclesQuery.isError) return

    initializedKpiScope.current = true
    if (currentCycle && value.cycleId === undefined) {
      onChange({ ...value, cycleId: currentCycle.id, kpiInstanceId: undefined })
    }
  }, [cycles, cyclesQuery.isError, cyclesQuery.isPending, currentCycle, onChange, value])

  function toggleSource(source: CalendarSource) {
    const field =
      source === 'PERSONAL' ? 'personal' : source === 'KPI' ? 'kpi' : 'meetings'
    const enabledCount = Object.values(value.sources).filter(Boolean).length
    if (value.sources[field] && enabledCount === 1) return

    const nextSources = { ...value.sources, [field]: !value.sources[field] }
    const hasTaskSource = nextSources.personal || nextSources.kpi

    onChange({
      ...value,
      sources: nextSources,
      ...(!nextSources.personal ? { listId: undefined } : {}),
      ...(!nextSources.kpi ? { cycleId: undefined, kpiInstanceId: undefined } : {}),
      ...(!nextSources.meetings ? { roomId: undefined } : {}),
      ...(!hasTaskSource
        ? { search: '', status: undefined, priority: undefined }
        : {}),
    })
  }

  const activeFilterCount = countActiveCalendarFilters(value, currentCycle?.id)

  function clearFilters() {
    onChange(clearCalendarFilters(value, currentCycle?.id))
  }

  const taskFiltersEnabled = taskScopes.length > 0

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex min-h-8 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-lg">
              <ListFilter aria-hidden="true" className="size-4" />
            </span>
            <span>{t('calendar.filtersTitle')}</span>
            {activeFilterCount > 0 ? (
              <span
                className="bg-primary/12 text-primary inline-grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                aria-label={t('calendar.activeFilterCount', { count: activeFilterCount })}
              >
                {activeFilterCount}
              </span>
            ) : null}
          </div>

          {activeFilterCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={clearFilters}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              {t('calendar.clearFilters')}
            </Button>
          ) : null}
        </div>

        <div
          className="bg-muted/60 grid grid-cols-1 gap-1 rounded-xl p-1 sm:grid-cols-3"
          aria-label={t('calendar.sourceLabel')}
        >
          <SourceButton
            active={value.sources.personal}
            icon={ListTodo}
            label={t('calendar.personalTasks')}
            onClick={() => toggleSource('PERSONAL')}
          />
          <SourceButton
            active={value.sources.kpi}
            icon={Gauge}
            label={t('calendar.kpiTasks')}
            onClick={() => toggleSource('KPI')}
          />
          <SourceButton
            active={value.sources.meetings}
            icon={CalendarClock}
            label={t('calendar.meetings')}
            onClick={() => toggleSource('MEETINGS')}
          />
        </div>

        {(taskFiltersEnabled || value.sources.meetings) && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {taskFiltersEnabled ? (
              <>
                <CalendarSearch
                  value={value.search}
                  scopes={taskScopes}
                  status={value.status}
                  priority={value.priority}
                  listId={value.listId}
                  cycleId={value.cycleId}
                  kpiInstanceId={value.kpiInstanceId}
                  onChange={(search) => onChange({ ...value, search })}
                  onOpenTask={onOpenSearchResult}
                />

                <Select
                  value={value.status ?? ALL}
                  onValueChange={(next) =>
                    onChange({ ...value, status: next === ALL ? undefined : (next as TaskStatus) })
                  }
                >
                  <SelectTrigger aria-label={t('calendar.statusFilter')}>
                    <SelectValue>
                      <TaskStatusIndicator status={value.status ?? 'ALL'} pill />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      <TaskStatusIndicator status="ALL" />
                    </SelectItem>
                    <SelectItem value="TODO">
                      <TaskStatusIndicator status="TODO" />
                    </SelectItem>
                    <SelectItem value="IN_PROGRESS">
                      <TaskStatusIndicator status="IN_PROGRESS" />
                    </SelectItem>
                    <SelectItem value="DONE">
                      <TaskStatusIndicator status="DONE" />
                    </SelectItem>
                    <SelectItem value="CANCELLED">
                      <TaskStatusIndicator status="CANCELLED" />
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={value.priority ?? ALL}
                  onValueChange={(next) =>
                    onChange({ ...value, priority: next === ALL ? undefined : (next as TaskPriority) })
                  }
                >
                  <SelectTrigger aria-label={t('calendar.priorityFilter')}>
                    <SelectValue>
                      <TaskPriorityIndicator priority={value.priority ?? 'ALL'} pill />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      <TaskPriorityIndicator priority="ALL" />
                    </SelectItem>
                    <SelectItem value="LOW">
                      <TaskPriorityIndicator priority="LOW" />
                    </SelectItem>
                    <SelectItem value="MEDIUM">
                      <TaskPriorityIndicator priority="MEDIUM" />
                    </SelectItem>
                    <SelectItem value="HIGH">
                      <TaskPriorityIndicator priority="HIGH" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : null}

            {value.sources.meetings ? (
              <Select
                value={value.roomId ? String(value.roomId) : ALL}
                disabled={roomsQuery.isPending || roomsQuery.isError}
                onValueChange={(next) =>
                  onChange({ ...value, roomId: next === ALL ? undefined : Number(next) })
                }
              >
                <SelectTrigger aria-label={t('calendar.roomFilter')}>
                  <SelectValue>
                    {selectedRoom ? (
                      <NeutralFilterIndicator
                        icon={MapPin}
                        label={roomLabel(selectedRoom, isArabic)}
                      />
                    ) : (
                      <NeutralFilterIndicator icon={MapPin} label={t('calendar.allMeetingRooms')} />
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>
                    <NeutralFilterIndicator icon={MapPin} label={t('calendar.allMeetingRooms')} />
                  </SelectItem>
                  {(roomsQuery.data ?? []).map((room) => (
                    <SelectItem key={room.id} value={String(room.id)}>
                      <NeutralFilterIndicator icon={MapPin} label={roomLabel(room, isArabic)} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        )}

        {value.sources.personal ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              value={value.listId ? String(value.listId) : ALL}
              onValueChange={(next) =>
                onChange({ ...value, listId: next === ALL ? undefined : Number(next) })
              }
            >
              <SelectTrigger aria-label={t('calendar.listFilter')}>
                <SelectValue>
                  {selectedList ? (
                    <ListSelectIndicator list={selectedList} />
                  ) : (
                    <NeutralFilterIndicator icon={ListTodo} label={t('calendar.allLists')} />
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>
                  <NeutralFilterIndicator icon={ListTodo} label={t('calendar.allLists')} />
                </SelectItem>
                {(listsQuery.data ?? []).map((list) => (
                  <SelectItem key={list.id} value={String(list.id)}>
                    <ListSelectIndicator list={list} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {value.sources.kpi ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Select
              value={value.cycleId ? String(value.cycleId) : ALL}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  cycleId: next === ALL ? undefined : Number(next),
                  kpiInstanceId: undefined,
                })
              }
            >
              <SelectTrigger aria-label={t('calendar.cycleFilter')}>
                <SelectValue>
                  {selectedCycle ? (
                    <WorkCycleSelectIndicator
                      cycle={selectedCycle}
                      currentLabel={t('calendar.currentCycle')}
                    />
                  ) : (
                    <NeutralFilterIndicator icon={BriefcaseBusiness} label={t('calendar.allCycles')} />
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>
                  <NeutralFilterIndicator icon={BriefcaseBusiness} label={t('calendar.allCycles')} />
                </SelectItem>
                {cycles.map((cycle) => (
                  <SelectItem key={cycle.id} value={String(cycle.id)}>
                    <WorkCycleSelectIndicator cycle={cycle} currentLabel={t('calendar.currentCycle')} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={value.kpiInstanceId ? String(value.kpiInstanceId) : ALL}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  kpiInstanceId: next === ALL ? undefined : Number(next),
                })
              }
            >
              <SelectTrigger aria-label={t('calendar.kpiFilter')}>
                <SelectValue>
                  {selectedInstance ? (
                    <KpiSelectIndicator
                      name={selectedInstance.name}
                      iconKey={selectedInstance.iconKey}
                      color={selectedInstance.color}
                    />
                  ) : (
                    <NeutralFilterIndicator icon={Gauge} label={t('calendar.allKpis')} />
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>
                  <NeutralFilterIndicator icon={Gauge} label={t('calendar.allKpis')} />
                </SelectItem>
                {availableInstances.map((instance) => (
                  <SelectItem key={instance.id} value={String(instance.id)}>
                    <span className="flex min-w-0 items-center gap-2">
                      <KpiSelectIndicator
                        name={instance.name}
                        iconKey={instance.iconKey}
                        color={instance.color}
                      />
                      {!selectedCycle && instance.cycleTitle ? (
                        <span className="text-muted-foreground shrink-0 text-xs">
                          · {instance.cycleTitle}
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="hidden xl:block" />
          </div>
        ) : null}

        {(listsQuery.isError || cyclesQuery.isError || (value.sources.meetings && roomsQuery.isError)) && (
          <p className="text-destructive text-xs">{t('calendar.filterLoadError')}</p>
        )}
      </CardContent>
    </Card>
  )
}

function SourceButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={active}
      className={cn(
        'justify-center',
        active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
      )}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Button>
  )
}
