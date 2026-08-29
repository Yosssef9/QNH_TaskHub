import { move } from '@dnd-kit/helpers'
import { Archive, CheckCircle2, Clock3, Lock, Pencil, Plus, RotateCcw, Target, Trash2, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'

import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { taskHubFadeMotion } from '@/components/shared/TaskHubMotion'
import { SortableDragHandle, TaskHubDragDropProvider, useTaskHubSortable } from '@/components/shared/TaskHubSortable'
import { Button } from '@/components/ui/button'
import { buttonStyles } from '@/components/ui/button.styles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { kpiIcons } from '@/features/kpis/components/kpi-icons'
import { useKpis } from '@/features/kpis/hooks/use-kpis'
import { TaskList } from '@/features/tasks/components/TaskList'
import { AddCycleKpisDialog } from '@/features/work-cycles/components/AddCycleKpisDialog'
import { WorkCycleEditorDialog } from '@/features/work-cycles/components/WorkCycleEditorDialog'
import {
  useArchiveWorkCycle,
  useCloseWorkCycle,
  useRemoveCycleKpi,
  useReopenWorkCycle,
  useReorderCycleInstances,
  useWorkCycle,
} from '@/features/work-cycles/hooks/use-work-cycles'
import type { KpiInstance } from '@/features/work-cycles/types/work-cycle.types'
import { cn } from '@/lib/cn'

function sameOrder(left: KpiInstance[], right: KpiInstance[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id)
}

function sameSet(left: KpiInstance[], right: KpiInstance[]) {
  if (left.length !== right.length) return false
  const ids = new Set(right.map((item) => item.id))
  return left.every((item) => ids.has(item.id))
}

export function WorkCyclePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { cycleId: rawCycleId } = useParams<{ cycleId: string }>()
  const cycleId = Number(rawCycleId)
  const cycleQuery = useWorkCycle(Number.isSafeInteger(cycleId) && cycleId > 0 ? cycleId : null)
  const kpisQuery = useKpis()
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [removing, setRemoving] = useState<KpiInstance | null>(null)
  const [ordered, setOrdered] = useState<KpiInstance[]>([])
  const draggingRef = useRef(false)
  const close = useCloseWorkCycle()
  const reopen = useReopenWorkCycle()
  const archive = useArchiveWorkCycle()
  const remove = useRemoveCycleKpi()
  const reorder = useReorderCycleInstances()

  useEffect(() => {
    if (cycleQuery.data && !draggingRef.current) setOrdered(cycleQuery.data.instances)
  }, [cycleQuery.data])

  if (!Number.isSafeInteger(cycleId) || cycleId <= 0) return <Navigate to="/not-found" replace />
  if (cycleQuery.isPending || kpisQuery.isPending) return <LoadingState />
  if (cycleQuery.isError || kpisQuery.isError) {
    return <ErrorState onRetry={() => void Promise.all([cycleQuery.refetch(), kpisQuery.refetch()])} />
  }

  const cycle = cycleQuery.data
  const displayed = sameSet(ordered, cycle.instances) ? ordered : cycle.instances
  const closed = Boolean(cycle.closedAtUtc)

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t(closed ? 'workCycles.statusClosed' : 'workCycles.statusOpen')}
        title={cycle.title}
        description={cycle.description ?? t('workCycles.noDescription')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/work-cycles" className={buttonStyles({ variant: 'outline' })}>
              {t('workCycles.viewAll')}
            </Link>
            {!closed ? (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  {t('common.edit')}
                </Button>
                <Button variant="outline" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  {t('workCycles.addKpis')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    close.mutate(cycle.id, {
                      onSuccess: () => toast.success(t('workCycles.closed')),
                      onError: () => toast.error(t('workCycles.errors.lifecycle')),
                    })
                  }
                >
                  <Lock className="size-4" />
                  {t('workCycles.close')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    reopen.mutate(cycle.id, {
                      onSuccess: () => toast.success(t('workCycles.reopened')),
                      onError: () => toast.error(t('workCycles.errors.lifecycle')),
                    })
                  }
                >
                  <RotateCcw className="size-4" />
                  {t('workCycles.reopen')}
                </Button>
                <Button variant="destructive" onClick={() => setArchiving(true)}>
                  <Archive className="size-4" />
                  {t('workCycles.archive')}
                </Button>
              </>
            )}
          </div>
        }
      />

      {closed ? (
        <div className="bg-muted/60 text-muted-foreground flex items-start gap-3 rounded-xl border p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>{t('workCycles.readOnlyDescription')}</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t('workCycles.totalTasks')} value={cycle.taskCount} icon={Target} />
        <Metric label={t('workCycles.completedTasks')} value={cycle.completedTaskCount} icon={CheckCircle2} />
        <Metric label={t('workCycles.overdueTasks')} value={cycle.overdueTaskCount} icon={Clock3} />
        <Metric label={t('workCycles.kpiInstances')} value={cycle.instances.length} icon={Target} />
      </div>

      <CollapsibleSection
        defaultOpen={false}
        title={t('workCycles.kpiInstances')}
        description={t('workCycles.instancesDescription')}
        expandLabel={t('workCycles.expandCycle', { name: t('workCycles.kpiInstances') })}
        collapseLabel={t('workCycles.collapseCycle', { name: t('workCycles.kpiInstances') })}
        titleClassName="text-lg"
      >
        <TaskHubDragDropProvider
          onDragStart={() => {
            draggingRef.current = true
          }}
          onDragEnd={(event) => {
            draggingRef.current = false
            if (event.canceled) {
              setOrdered(cycle.instances)
              return
            }
            const next = move(displayed, event)
            if (sameOrder(next, displayed)) return
            setOrdered(next)
            reorder.mutate(
              { cycleId: cycle.id, instanceIds: next.map((item) => item.id) },
              {
                onError: () => {
                  setOrdered(cycle.instances)
                  toast.error(t('workCycles.errors.reorderInstances'))
                },
              },
            )
          }}
        >
          <div
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            aria-busy={reorder.isPending}
          >
            <AnimatePresence initial={false}>
              {displayed.map((instance, index) => (
                <motion.div
                  key={instance.id}
                  initial={taskHubFadeMotion.initial}
                  animate={taskHubFadeMotion.animate}
                  exit={taskHubFadeMotion.exit}
                  transition={taskHubFadeMotion.transition}
                >
                  <InstanceCard
                    instance={instance}
                    index={index}
                    readOnly={closed}
                    dragDisabled={closed || reorder.isPending}
                    onRemove={() => setRemoving(instance)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TaskHubDragDropProvider>
      </CollapsibleSection>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('workCycles.cycleTasks')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('workCycles.cycleTasksDescription')}</p>
        </div>
        <TaskList cycle={cycle} />
      </section>

      <WorkCycleEditorDialog
        key={`edit-${cycle.id}`}
        cycle={cycle}
        kpis={kpisQuery.data}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <AddCycleKpisDialog
        key={`add-${cycle.id}`}
        cycle={cycle}
        kpis={kpisQuery.data}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      <ConfirmModal
        open={Boolean(removing)}
        title={t('workCycles.removeKpiTitle')}
        message={t('workCycles.removeKpiDescription', { name: removing?.name })}
        confirmText={t('workCycles.removeKpi')}
        cancelText={t('common.cancel')}
        danger
        loading={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          remove.mutate(
            { cycleId: cycle.id, instanceId: removing.id },
            {
              onSuccess: () => {
                toast.success(t('workCycles.kpiRemoved'))
                setRemoving(null)
              },
              onError: () => toast.error(t('workCycles.errors.removeKpi')),
            },
          )
        }
      />

      <ConfirmModal
        open={archiving}
        title={t('workCycles.archiveTitle')}
        message={t('workCycles.archiveDescription', { name: cycle.title })}
        confirmText={t('workCycles.archive')}
        cancelText={t('common.cancel')}
        danger
        loading={archive.isPending}
        onCancel={() => setArchiving(false)}
        onConfirm={() =>
          archive.mutate(cycle.id, {
            onSuccess: () => {
              toast.success(t('workCycles.archived'))
              navigate('/work-cycles', { replace: true })
            },
            onError: () => toast.error(t('workCycles.errors.archive')),
          })
        }
      />
    </div>
  )
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-5">
        <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function InstanceCard({
  instance,
  index,
  readOnly,
  dragDisabled,
  onRemove,
}: {
  instance: KpiInstance
  index: number
  readOnly: boolean
  dragDisabled: boolean
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const sortable = useTaskHubSortable({ id: instance.id, index })
  const Icon = kpiIcons[instance.iconKey]
  return (
    <div ref={sortable.ref} className="h-full">
      <Card
        className={cn(
          'h-full hover:border-primary/20 hover:shadow-md',
          sortable.isDragging && 'border-primary/35 scale-[1.015] shadow-xl ring-1 ring-primary/15',
          sortable.isDropTarget && !sortable.isDragging && 'border-primary/45 bg-primary/[0.035]',
        )}
      >
        <CardHeader className="flex-row items-start gap-2">
          <SortableDragHandle
            handleRef={sortable.handleRef}
            label={t('common.dragToReorder', { name: instance.name })}
            disabled={dragDisabled}
            className="-ms-1 mt-1"
          />
          <span
            className="grid size-10 shrink-0 place-items-center rounded-lg"
            style={{ color: instance.color, backgroundColor: `${instance.color}18` }}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              <Link
                to={`/work-cycles/${instance.cycleId}/kpis/${instance.id}`}
                className="hover:text-primary"
              >
                {instance.name}
              </Link>
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {t(`kpis.methods.${instance.calculationMethod}`)} · {t(`kpis.periods.${instance.periodType}`)}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-muted/45 rounded-lg p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span>{t('kpis.target')}</span>
              <strong>{instance.targetValue ?? t('kpis.noTarget')}</strong>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <span>{t('workCycles.totalTasks')}</span>
              <strong>{instance.taskCount}</strong>
            </div>
          </div>
          {!readOnly ? (
            <div className="flex justify-end">
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                aria-label={t('workCycles.removeKpi')}
                onClick={onRemove}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
