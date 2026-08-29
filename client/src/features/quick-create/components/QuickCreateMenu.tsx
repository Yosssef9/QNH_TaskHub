import { Gauge, ListChecks, ListTodo, Loader2, Plus, Repeat2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { KpiEditorDialog } from '@/features/kpis/components/KpiEditorDialog'
import { useKpis } from '@/features/kpis/hooks/use-kpis'
import { useLists } from '@/features/lists/hooks/use-lists'
import { TaskEditorDialog } from '@/features/tasks/components/TaskEditorDialog'
import { WorkCycleEditorDialog } from '@/features/work-cycles/components/WorkCycleEditorDialog'
import { useWorkCycles } from '@/features/work-cycles/hooks/use-work-cycles'
import type { KpiInstance, WorkCycle } from '@/features/work-cycles/types/work-cycle.types'
import { cn } from '@/lib/cn'

type QuickCreateTarget = 'TASK' | 'KPI_TASK' | 'WORK_CYCLE' | 'KPI_TEMPLATE' | null

function parsePositiveId(value: string | undefined): number | null {
  if (!value) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function getRouteContext(pathname: string) {
  const kpiMatch = pathname.match(/^\/work-cycles\/(\d+)\/kpis\/(\d+)(?:\/|$)/)
  if (kpiMatch) {
    return {
      listId: null,
      cycleId: parsePositiveId(kpiMatch[1]),
      instanceId: parsePositiveId(kpiMatch[2]),
    }
  }

  const cycleMatch = pathname.match(/^\/work-cycles\/(\d+)(?:\/|$)/)
  if (cycleMatch) {
    return {
      listId: null,
      cycleId: parsePositiveId(cycleMatch[1]),
      instanceId: null,
    }
  }

  const listMatch = pathname.match(/^\/lists\/(\d+)(?:\/|$)/)
  return {
    listId: parsePositiveId(listMatch?.[1]),
    cycleId: null,
    instanceId: null,
  }
}

function taskEnabledInstances(cycle: WorkCycle | null | undefined): KpiInstance[] {
  return (
    cycle?.instances.filter((instance) => instance.isActive && instance.taskPolicy.allowsTasks) ?? []
  )
}

export function QuickCreateMenu() {
  const { t } = useTranslation()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [target, setTarget] = useState<QuickCreateTarget>(null)

  const listsQuery = useLists()
  const cyclesQuery = useWorkCycles()
  const kpisQuery = useKpis()

  const lists = listsQuery.data ?? []
  const cycles = cyclesQuery.data ?? []
  const kpis = kpisQuery.data ?? []
  const openCycles = cycles.filter((cycle) => !cycle.closedAtUtc && !cycle.archivedAtUtc)
  const activeKpis = kpis.filter((kpi) => kpi.isActive)
  const routeContext = getRouteContext(location.pathname)

  const routeList = lists.find((list) => list.id === routeContext.listId) ?? null
  const defaultList =
    routeList ??
    lists.find((list) => list.isDefault) ??
    (lists.length === 1 ? lists[0] ?? null : null)

  const routeCycle = openCycles.find((cycle) => cycle.id === routeContext.cycleId) ?? null
  const currentCycle = openCycles.find((cycle) => cycle.isCurrent) ?? null
  const preferredCycle =
    routeCycle ?? currentCycle ?? (openCycles.length === 1 ? openCycles[0] ?? null : null)

  const routeInstance =
    routeCycle
      ?.instances.find(
        (instance) =>
          instance.id === routeContext.instanceId &&
          instance.isActive &&
          instance.taskPolicy.allowsTasks,
      ) ?? null
  const preferredInstances = taskEnabledInstances(preferredCycle)
  const preferredInstance =
    routeInstance ??
    (preferredInstances.length === 1 ? preferredInstances[0] ?? null : null)

  const kpiTaskAvailable = routeCycle
    ? taskEnabledInstances(routeCycle).length > 0
    : openCycles.some((cycle) => taskEnabledInstances(cycle).length > 0)

  const queriesPending = listsQuery.isPending || cyclesQuery.isPending || kpisQuery.isPending

  function choose(nextTarget: Exclude<QuickCreateTarget, null>) {
    setMenuOpen(false)
    setTarget(nextTarget)
  }

  const taskDisabled = listsQuery.isPending || listsQuery.isError || lists.length === 0
  const taskReason = listsQuery.isPending
    ? t('quickCreate.loading')
    : listsQuery.isError
      ? t('quickCreate.dataUnavailable')
      : lists.length === 0
        ? t('quickCreate.noLists')
        : t('quickCreate.taskDescription')

  const kpiTaskDisabled = cyclesQuery.isPending || cyclesQuery.isError || !kpiTaskAvailable
  const kpiTaskReason = cyclesQuery.isPending
    ? t('quickCreate.loading')
    : cyclesQuery.isError
      ? t('quickCreate.dataUnavailable')
      : routeCycle && taskEnabledInstances(routeCycle).length === 0
        ? t('quickCreate.noTaskKpisInCycle')
        : openCycles.length === 0
          ? t('quickCreate.noOpenCycles')
          : !kpiTaskAvailable
            ? t('quickCreate.noTaskKpis')
            : preferredCycle
              ? t('quickCreate.kpiTaskDescriptionWithCycle', { name: preferredCycle.title })
              : t('quickCreate.kpiTaskDescription')

  const cycleDisabled = kpisQuery.isPending || kpisQuery.isError || activeKpis.length === 0
  const cycleReason = kpisQuery.isPending
    ? t('quickCreate.loading')
    : kpisQuery.isError
      ? t('quickCreate.dataUnavailable')
      : activeKpis.length === 0
        ? t('quickCreate.noActiveKpis')
        : t('quickCreate.workCycleDescription')

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="bg-primary/8 text-primary hover:bg-primary/12 hover:text-primary"
            aria-label={t('quickCreate.open')}
          >
            <Plus aria-hidden="true" className="size-5" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(21rem,calc(100vw-1rem))] p-2"
        >
          <div className="border-border mb-1 border-b px-2 pt-1 pb-2">
            <p className="text-sm font-semibold">{t('quickCreate.title')}</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              {t('quickCreate.description')}
            </p>
          </div>

          <div role="group" className="space-y-1" aria-label={t('quickCreate.title')}>
            <QuickCreateItem
              icon={ListTodo}
              label={t('quickCreate.task')}
              description={taskReason}
              disabled={taskDisabled}
              onClick={() => choose('TASK')}
            />
            <QuickCreateItem
              icon={ListChecks}
              label={t('quickCreate.kpiTask')}
              description={kpiTaskReason}
              disabled={kpiTaskDisabled}
              onClick={() => choose('KPI_TASK')}
            />
            <QuickCreateItem
              icon={Repeat2}
              label={t('quickCreate.workCycle')}
              description={cycleReason}
              disabled={cycleDisabled}
              onClick={() => choose('WORK_CYCLE')}
            />
            <QuickCreateItem
              icon={Gauge}
              label={t('quickCreate.kpiTemplate')}
              description={t('quickCreate.kpiTemplateDescription')}
              onClick={() => choose('KPI_TEMPLATE')}
            />
          </div>

          {queriesPending ? (
            <div className="text-muted-foreground mt-2 flex items-center gap-2 border-t px-2 pt-2 text-[11px]">
              <Loader2 aria-hidden="true" className="size-3 animate-spin" />
              {t('quickCreate.preparing')}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {target === 'TASK' && lists.length > 0 ? (
        <TaskEditorDialog
          key={`quick-task-${defaultList?.id ?? 'select'}`}
          open
          onOpenChange={(open) => !open && setTarget(null)}
          lists={lists}
          initialListId={defaultList?.id ?? null}
          allowListSelectionOnCreate
        />
      ) : null}

      {target === 'KPI_TASK' && kpiTaskAvailable ? (
        routeInstance ? (
          <TaskEditorDialog
            key={`quick-kpi-task-instance-${routeInstance.id}`}
            open
            onOpenChange={(open) => !open && setTarget(null)}
            instance={routeInstance}
          />
        ) : routeCycle ? (
          <TaskEditorDialog
            key={`quick-kpi-task-cycle-${routeCycle.id}-${preferredInstance?.id ?? 'select'}`}
            open
            onOpenChange={(open) => !open && setTarget(null)}
            cycle={routeCycle}
            initialKpiInstanceId={preferredInstance?.id ?? null}
          />
        ) : (
          <TaskEditorDialog
            key={`quick-kpi-task-global-${preferredCycle?.id ?? 'select'}-${preferredInstance?.id ?? 'select'}`}
            open
            onOpenChange={(open) => !open && setTarget(null)}
            cycles={openCycles}
            initialCycleId={preferredCycle?.id ?? null}
            initialKpiInstanceId={preferredInstance?.id ?? null}
          />
        )
      ) : null}

      {target === 'WORK_CYCLE' && activeKpis.length > 0 ? (
        <WorkCycleEditorDialog
          key="quick-work-cycle"
          open
          onOpenChange={(open) => !open && setTarget(null)}
          kpis={kpis}
        />
      ) : null}

      {target === 'KPI_TEMPLATE' ? (
        <KpiEditorDialog
          key="quick-kpi-template"
          open
          onOpenChange={(open) => !open && setTarget(null)}
        />
      ) : null}
    </>
  )
}

function QuickCreateItem({
  icon: Icon,
  label,
  description,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon
  label: string
  description: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'focus-visible:ring-ring group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-start outline-none focus-visible:ring-2',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:bg-muted/60 active:bg-muted/80',
      )}
      onClick={onClick}
    >
      <span className="bg-primary/8 text-primary group-hover:bg-primary/12 grid size-9 shrink-0 place-items-center rounded-lg">
        <Icon aria-hidden="true" className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-5">{description}</span>
      </span>
    </button>
  )
}
