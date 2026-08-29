import { BriefcaseBusiness, Gauge, ListFilter, ListTodo, RotateCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { SearchInput } from '@/components/shared/SearchInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { appIcons } from '@/config/app-icons'
import { KpiSelectIndicator } from '@/features/kpis/components/KpiSelectIndicator'
import { ListSelectIndicator } from '@/features/lists/components/ListSelectIndicator'
import { useLists } from '@/features/lists/hooks/use-lists'
import { TaskPriorityIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import type { TaskPriority, TaskStatus } from '@/features/tasks/types/task.types'
import { useWorkCycles } from '@/features/work-cycles/hooks/use-work-cycles'
import type { WorkCycle } from '@/features/work-cycles/types/work-cycle.types'
import { cn } from '@/lib/cn'

import type { CalendarScope } from '../types/calendar.types'

const ALL = 'ALL'

export interface CalendarFilterState {
  scope: CalendarScope
  search: string
  status?: TaskStatus | undefined
  priority?: TaskPriority | undefined
  listId?: number | undefined
  cycleId?: number | undefined
  kpiInstanceId?: number | undefined
}

export function countActiveCalendarFilters(
  value: CalendarFilterState,
  currentCycleId?: number,
): number {
  const cycleFilterIsActive =
    value.scope === 'KPI' &&
    (currentCycleId === undefined ? value.cycleId !== undefined : value.cycleId !== currentCycleId)

  return [
    value.search.trim().length > 0,
    value.status !== undefined,
    value.priority !== undefined,
    value.scope === 'PERSONAL' ? value.listId !== undefined : cycleFilterIsActive,
    value.scope === 'KPI' && value.kpiInstanceId !== undefined,
  ].filter(Boolean).length
}

export function clearCalendarFilters(
  value: CalendarFilterState,
  currentCycleId?: number,
): CalendarFilterState {
  return {
    scope: value.scope,
    search: '',
    ...(value.scope === 'KPI' && currentCycleId !== undefined ? { cycleId: currentCycleId } : {}),
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

interface Props {
  value: CalendarFilterState
  onChange: (next: CalendarFilterState) => void
}

export function CalendarFilters({ onChange, value }: Props) {
  const { t } = useTranslation()
  const listsQuery = useLists()
  const cyclesQuery = useWorkCycles()
  const initializedKpiScope = useRef(false)

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

  useEffect(() => {
    if (value.scope !== 'KPI') {
      initializedKpiScope.current = false
      return
    }
    if (initializedKpiScope.current || cyclesQuery.isPending || cyclesQuery.isError) return

    initializedKpiScope.current = true
    if (currentCycle && value.cycleId === undefined) {
      onChange({ ...value, cycleId: currentCycle.id, kpiInstanceId: undefined })
    }
  }, [cycles, cyclesQuery.isError, cyclesQuery.isPending, onChange, value])

  function setScope(scope: CalendarScope) {
    if (scope === value.scope) return
    onChange({ ...value, scope })
  }

  const activeFilterCount = countActiveCalendarFilters(value, currentCycle?.id)

  function clearFilters() {
    onChange(clearCalendarFilters(value, currentCycle?.id))
  }

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
          className="bg-muted/60 grid grid-cols-2 gap-1 rounded-xl p-1"
          aria-label={t('calendar.scopeLabel')}
        >
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={value.scope === 'PERSONAL'}
            className={cn(
              'justify-center',
              value.scope === 'PERSONAL' &&
                'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
            )}
            onClick={() => setScope('PERSONAL')}
          >
            <ListTodo aria-hidden="true" className="size-4" />
            {t('calendar.personalTasks')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={value.scope === 'KPI'}
            className={cn(
              'justify-center',
              value.scope === 'KPI' &&
                'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
            )}
            onClick={() => setScope('KPI')}
          >
            <Gauge aria-hidden="true" className="size-4" />
            {t('calendar.kpiTasks')}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1.5fr)_repeat(3,minmax(10rem,1fr))]">
          <SearchInput
            value={value.search}
            onChange={(search) => onChange({ ...value, search })}
            placeholder={t('calendar.searchPlaceholder')}
            ariaLabel={t('calendar.searchLabel')}
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

          {value.scope === 'PERSONAL' ? (
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
          ) : (
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
                    <NeutralFilterIndicator
                      icon={BriefcaseBusiness}
                      label={t('calendar.allCycles')}
                    />
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>
                  <NeutralFilterIndicator
                    icon={BriefcaseBusiness}
                    label={t('calendar.allCycles')}
                  />
                </SelectItem>
                {cycles.map((cycle) => (
                  <SelectItem key={cycle.id} value={String(cycle.id)}>
                    <WorkCycleSelectIndicator
                      cycle={cycle}
                      currentLabel={t('calendar.currentCycle')}
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {value.scope === 'KPI' ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1.5fr)_repeat(3,minmax(10rem,1fr))]">
            <div className="hidden xl:block" />
            <Select
              value={value.kpiInstanceId ? String(value.kpiInstanceId) : ALL}
              onValueChange={(next) =>
                onChange({ ...value, kpiInstanceId: next === ALL ? undefined : Number(next) })
              }
            >
              <SelectTrigger aria-label={t('calendar.kpiFilter')} className="xl:col-span-2">
                <SelectValue>
                  {selectedInstance ? (
                    <KpiSelectIndicator kpi={selectedInstance} />
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
                      <KpiSelectIndicator kpi={instance} />
                      {!selectedCycle ? (
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

        {(listsQuery.isError || cyclesQuery.isError) && (
          <p className="text-destructive text-xs">{t('calendar.filterLoadError')}</p>
        )}
      </CardContent>
    </Card>
  )
}
