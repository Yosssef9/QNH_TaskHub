import { move } from '@dnd-kit/helpers'
import { Archive, CalendarDays, Lock, Pencil, Plus, Repeat2, RotateCcw, Star } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { AnimatedState, taskHubFadeMotion } from '@/components/shared/TaskHubMotion'
import {
  SortableDragHandle,
  TaskHubDragDropProvider,
  useTaskHubSortable,
} from '@/components/shared/TaskHubSortable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { appIcons } from '@/config/app-icons'
import { useKpis } from '@/features/kpis/hooks/use-kpis'
import { WorkCycleEditorDialog } from '@/features/work-cycles/components/WorkCycleEditorDialog'
import {
  useArchiveWorkCycle,
  useCloseWorkCycle,
  useReopenWorkCycle,
  useReorderWorkCycles,
  useSetCurrentWorkCycle,
  useWorkCycles,
} from '@/features/work-cycles/hooks/use-work-cycles'
import type { WorkCycle } from '@/features/work-cycles/types/work-cycle.types'
import { cn } from '@/lib/cn'

function sameOrder(left: WorkCycle[], right: WorkCycle[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id)
}

function sameSet(left: WorkCycle[], right: WorkCycle[]) {
  if (left.length !== right.length) return false
  const ids = new Set(right.map((item) => item.id))
  return left.every((item) => ids.has(item.id))
}

export function WorkCyclesPage() {
  const { i18n, t } = useTranslation()
  const cyclesQuery = useWorkCycles()
  const kpisQuery = useKpis()
  const [editor, setEditor] = useState<WorkCycle | 'create' | null>(null)
  const [archiving, setArchiving] = useState<WorkCycle | null>(null)
  const [ordered, setOrdered] = useState<WorkCycle[]>([])
  const draggingRef = useRef(false)
  const reorder = useReorderWorkCycles()
  const close = useCloseWorkCycle()
  const reopen = useReopenWorkCycle()
  const archive = useArchiveWorkCycle()
  const setCurrent = useSetCurrentWorkCycle()

  useEffect(() => {
    if (cyclesQuery.data && !draggingRef.current) setOrdered(cyclesQuery.data)
  }, [cyclesQuery.data])

  if (cyclesQuery.isPending || kpisQuery.isPending) return <LoadingState />
  if (cyclesQuery.isError || kpisQuery.isError) {
    return (
      <ErrorState
        onRetry={() => void Promise.all([cyclesQuery.refetch(), kpisQuery.refetch()])}
      />
    )
  }

  const cycles = cyclesQuery.data ?? []
  const displayed = sameSet(ordered, cycles) ? ordered : cycles

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('workCycles.eyebrow')}
        title={t('workCycles.title')}
        description={t('workCycles.description')}
        actions={
          <Button onClick={() => setEditor('create')} disabled={kpisQuery.data.length === 0}>
            <Plus className="size-4" />
            {t('workCycles.create')}
          </Button>
        }
      />

      {kpisQuery.data.length === 0 ? (
        <div className="bg-warning/10 text-warning-foreground border-warning/20 rounded-xl border p-4 text-sm">
          {t('workCycles.libraryRequired')}
        </div>
      ) : null}

      <AnimatedState stateKey={cycles.length === 0 ? 'empty' : 'content'}>
        {cycles.length === 0 ? (
          <EmptyState
            icon={Repeat2}
            title={t('workCycles.emptyTitle')}
            description={t('workCycles.emptyDescription')}
            {...(kpisQuery.data.length > 0
              ? {
                  action: (
                    <Button onClick={() => setEditor('create')}>
                      <Plus className="size-4" />
                      {t('workCycles.create')}
                    </Button>
                  ),
                }
              : {})}
          />
        ) : (
          <TaskHubDragDropProvider
            onDragStart={() => {
              draggingRef.current = true
            }}
            onDragEnd={(event) => {
              draggingRef.current = false
              if (event.canceled) {
                setOrdered(cycles)
                return
              }
              const next = move(displayed, event)
              if (sameOrder(next, displayed)) return
              setOrdered(next)
              reorder.mutate(next.map((item) => item.id), {
                onError: () => {
                  setOrdered(cycles)
                  toast.error(t('workCycles.errors.reorder'))
                },
              })
            }}
          >
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3" aria-busy={reorder.isPending}>
              <AnimatePresence initial={false}>
                {displayed.map((cycle, index) => (
                  <motion.div
                    key={cycle.id}
                    initial={taskHubFadeMotion.initial}
                    animate={taskHubFadeMotion.animate}
                    exit={taskHubFadeMotion.exit}
                    transition={taskHubFadeMotion.transition}
                  >
                    <WorkCycleCard
                      cycle={cycle}
                      index={index}
                      dragDisabled={reorder.isPending}
                      locale={i18n.language}
                      onEdit={() => setEditor(cycle)}
                      onSetCurrent={() =>
                        setCurrent.mutate(cycle.id, {
                          onSuccess: () => toast.success(t('workCycles.currentSet')),
                          onError: () => toast.error(t('workCycles.errors.current')),
                        })
                      }
                      onArchive={() => setArchiving(cycle)}
                      onClose={() =>
                        close.mutate(cycle.id, {
                          onSuccess: () => toast.success(t('workCycles.closed')),
                          onError: () => toast.error(t('workCycles.errors.lifecycle')),
                        })
                      }
                      onReopen={() =>
                        reopen.mutate(cycle.id, {
                          onSuccess: () => toast.success(t('workCycles.reopened')),
                          onError: () => toast.error(t('workCycles.errors.lifecycle')),
                        })
                      }
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </TaskHubDragDropProvider>
        )}
      </AnimatedState>

      {editor ? (
        <WorkCycleEditorDialog
          key={editor === 'create' ? 'create' : editor.id}
          cycle={editor === 'create' ? null : editor}
          kpis={kpisQuery.data}
          open
          onOpenChange={(open) => !open && setEditor(null)}
        />
      ) : null}

      <ConfirmModal
        open={Boolean(archiving)}
        title={t('workCycles.archiveTitle')}
        message={t('workCycles.archiveDescription', { name: archiving?.title })}
        confirmText={t('workCycles.archive')}
        cancelText={t('common.cancel')}
        danger
        loading={archive.isPending}
        onCancel={() => setArchiving(null)}
        onConfirm={() =>
          archiving &&
          archive.mutate(archiving.id, {
            onSuccess: () => {
              toast.success(t('workCycles.archived'))
              setArchiving(null)
            },
            onError: () => toast.error(t('workCycles.errors.archive')),
          })
        }
      />
    </div>
  )
}

function WorkCycleCard({
  cycle,
  index,
  dragDisabled,
  locale,
  onEdit,
  onSetCurrent,
  onArchive,
  onClose,
  onReopen,
}: {
  cycle: WorkCycle
  index: number
  dragDisabled: boolean
  locale: string
  onEdit: () => void
  onSetCurrent: () => void
  onArchive: () => void
  onClose: () => void
  onReopen: () => void
}) {
  const { t } = useTranslation()
  const sortable = useTaskHubSortable({ id: cycle.id, index })
  const Icon = appIcons[cycle.iconKey]
  const completion = cycle.taskCount
    ? Math.round((cycle.completedTaskCount / cycle.taskCount) * 100)
    : 0
  const dateLabel = [cycle.startDate, cycle.endDate]
    .filter(Boolean)
    .map((value) => new Date(`${value}T00:00:00`).toLocaleDateString(locale))
    .join(' – ')

  return (
    <div ref={sortable.ref} className="h-full">
      <Card
        className={cn(
          'h-full hover:border-primary/20 hover:shadow-md',
          cycle.isCurrent && 'border-primary/35 bg-primary/[0.025] ring-1 ring-primary/10',
          sortable.isDragging && 'border-primary/35 scale-[1.015] shadow-xl ring-1 ring-primary/15',
          sortable.isDropTarget && !sortable.isDragging && 'border-primary/45 bg-primary/[0.035]',
        )}
      >
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <SortableDragHandle
              handleRef={sortable.handleRef}
              label={t('common.dragToReorder', { name: cycle.title })}
              disabled={dragDisabled}
              className="-ms-1 mt-1"
            />
            <span
              className="grid size-11 shrink-0 place-items-center rounded-xl"
              style={{ color: cycle.color, backgroundColor: `${cycle.color}18` }}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                <Link to={`/work-cycles/${cycle.id}`} className="hover:text-primary">
                  {cycle.title}
                </Link>
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('workCycles.instanceCount', { count: cycle.instances.length })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {cycle.isCurrent ? (
              <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
                <Star className="size-3.5 fill-current" />
                {t('workCycles.current')}
              </span>
            ) : null}
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium',
                cycle.closedAtUtc
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-success/10 text-success',
              )}
            >
              {t(cycle.closedAtUtc ? 'workCycles.statusClosed' : 'workCycles.statusOpen')}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm">
            {cycle.description || t('workCycles.noDescription')}
          </p>
          {dateLabel ? (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <CalendarDays className="size-4" />
              {dateLabel}
            </p>
          ) : null}
          <div className="bg-muted/45 grid grid-cols-3 gap-2 rounded-lg p-3 text-center">
            <div>
              <p className="text-lg font-bold tabular-nums">{cycle.taskCount}</p>
              <p className="text-muted-foreground text-[11px]">{t('workCycles.totalTasks')}</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">{completion}%</p>
              <p className="text-muted-foreground text-[11px]">{t('workCycles.completed')}</p>
            </div>
            <div>
              <p className="text-destructive text-lg font-bold tabular-nums">{cycle.overdueTaskCount}</p>
              <p className="text-muted-foreground text-[11px]">{t('workCycles.overdue')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!cycle.closedAtUtc && !cycle.isCurrent ? (
              <Button size="sm" variant="outline" onClick={onSetCurrent}>
                <Star className="size-4" />
                {t('workCycles.makeCurrent')}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onEdit} disabled={Boolean(cycle.closedAtUtc)}>
              <Pencil className="size-4" />
              {t('common.edit')}
            </Button>
            {cycle.closedAtUtc ? (
              <Button size="sm" variant="ghost" onClick={onReopen}>
                <RotateCcw className="size-4" />
                {t('workCycles.reopen')}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={onClose}>
                <Lock className="size-4" />
                {t('workCycles.close')}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive ms-auto"
              aria-label={t('workCycles.archive')}
              disabled={!cycle.closedAtUtc}
              onClick={onArchive}
            >
              <Archive className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
