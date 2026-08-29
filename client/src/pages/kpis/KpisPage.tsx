import { move } from '@dnd-kit/helpers'
import { Archive, PauseCircle, Pencil, Plus, Target } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

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
import { buttonStyles } from '@/components/ui/button.styles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiEditorDialog } from '@/features/kpis/components/KpiEditorDialog'
import { kpiIcons } from '@/features/kpis/components/kpi-icons'
import {
  useArchiveKpi,
  useKpis,
  useReorderKpis,
  useSetKpiActive,
} from '@/features/kpis/hooks/use-kpis'
import type { PersonalKpi } from '@/features/kpis/types/kpi.types'
import { ApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'

type KpiEditorState = { mode: 'create' } | { mode: 'edit'; kpi: PersonalKpi } | null

function sameIds(left: PersonalKpi[], right: PersonalKpi[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id)
}

function sameIdSet(left: PersonalKpi[], right: PersonalKpi[]) {
  if (left.length !== right.length) return false
  const ids = new Set(right.map((item) => item.id))
  return left.every((item) => ids.has(item.id))
}

export function KpisPage() {
  const { t } = useTranslation()
  const { kpiId } = useParams()
  const query = useKpis()

  const [editor, setEditor] = useState<KpiEditorState>(null)
  const [archiving, setArchiving] = useState<PersonalKpi | null>(null)
  const [orderedKpis, setOrderedKpis] = useState<PersonalKpi[]>([])
  const [recentlyMovedKpiId, setRecentlyMovedKpiId] = useState<number | null>(null)
  const draggingRef = useRef(false)

  const archive = useArchiveKpi()
  const active = useSetKpiActive()
  const reorder = useReorderKpis()

  useEffect(() => {
    if (query.data && !draggingRef.current) {
      setOrderedKpis(query.data)
    }
  }, [query.data])

  useEffect(() => {
    if (recentlyMovedKpiId === null) return

    const timeout = window.setTimeout(() => setRecentlyMovedKpiId(null), 650)
    return () => window.clearTimeout(timeout)
  }, [recentlyMovedKpiId])

  if (query.isPending) return <LoadingState />

  if (query.isError) {
    return <ErrorState onRetry={() => void query.refetch()} />
  }

  const kpis = query.data ?? []
  const displayedKpis = sameIdSet(orderedKpis, kpis) ? orderedKpis : kpis
  const overviewState = kpis.length === 0 ? 'empty' : 'content'
  const selectedKpi = kpiId ? kpis.find((item) => item.id === Number(kpiId)) : null

  if (selectedKpi) {
    const Icon = kpiIcons[selectedKpi.iconKey]

    return (
      <div className="space-y-7">
        <PageHeader
          eyebrow={t(`kpis.methods.${selectedKpi.calculationMethod}`)}
          title={selectedKpi.name}
          description={selectedKpi.description ?? t('kpis.noDescription')}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditor({ mode: 'edit', kpi: selectedKpi })}>
                <Pencil className="size-4" />
                {t('common.edit')}
              </Button>
              <Link to="/kpis" className={buttonStyles({ variant: 'outline' })}>
                {t('kpis.viewAll')}
              </Link>
            </div>
          }
        />

        <div className="max-w-2xl">
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              <span
                className="grid size-12 place-items-center rounded-xl"
                style={{
                  backgroundColor: `${selectedKpi.color}18`,
                  color: selectedKpi.color,
                }}
              >
                <Icon className="size-6" />
              </span>

              <div>
                <CardTitle>{t('kpis.previewTitle')}</CardTitle>

                <p className="text-muted-foreground mt-1 text-sm">
                  {t(`kpis.periods.${selectedKpi.periodType}`)}
                </p>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              <p>{t(`kpis.previews.${selectedKpi.calculationMethod}`)}</p>

              <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <span>{t('kpis.target')}</span>
                  <strong>{selectedKpi.targetValue ?? t('kpis.noTarget')}</strong>
                </div>
                <div className="flex justify-between gap-3">
                  <span>{t('kpis.period')}</span>
                  <strong>{t(`kpis.periods.${selectedKpi.periodType}`)}</strong>
                </div>
              </div>
              <p className="bg-muted/50 text-muted-foreground rounded-lg p-3 text-xs">
                {t('kpis.templateOnlyHint')}
              </p>
            </CardContent>
          </Card>
        </div>

      </div>
    )
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('kpis.eyebrow')}
        title={t('kpis.title')}
        description={t('kpis.description')}
        actions={
          <Button onClick={() => setEditor({ mode: 'create' })}>
            <Plus className="size-4" />
            {t('kpis.create')}
          </Button>
        }
      />

      <AnimatedState stateKey={overviewState}>
        {kpis.length === 0 ? (
          <EmptyState
            icon={Target}
            title={t('kpis.emptyTitle')}
            description={t('kpis.emptyDescription')}
            action={
              <Button onClick={() => setEditor({ mode: 'create' })}>
                <Plus className="size-4" />
                {t('kpis.create')}
              </Button>
            }
          />
        ) : (
          <TaskHubDragDropProvider
                    onDragStart={() => {
                      draggingRef.current = true
                    }}
                    onDragEnd={(event) => {
                      draggingRef.current = false

                      if (event.canceled) {
                        setOrderedKpis(kpis)
                        return
                      }

                      const next = move(displayedKpis, event)
                      if (sameIds(next, displayedKpis)) return

                      const movedId = Number(event.operation.source?.id)
                      if (Number.isSafeInteger(movedId)) {
                        setRecentlyMovedKpiId(movedId)
                      }

                      setOrderedKpis(next)
                      reorder.mutate(
                        next.map((item) => item.id),
                        {
                          onError: () => toast.error(t('kpis.errors.reorder')),
                        },
                      )
                    }}
                  >
                    <div
                      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                      aria-busy={reorder.isPending}
                    >
                      <AnimatePresence initial={false}>
                        {displayedKpis.map((kpi, index) => (
                          <motion.div
                            key={kpi.id}
                            initial={taskHubFadeMotion.initial}
                            animate={taskHubFadeMotion.animate}
                            exit={taskHubFadeMotion.exit}
                            transition={taskHubFadeMotion.transition}
                          >
                            <KpiCard
                          kpi={kpi}
                          index={index}
                          dragDisabled={reorder.isPending}
                          justMoved={recentlyMovedKpiId === kpi.id}
                          onEdit={() =>
                            setEditor({
                              mode: 'edit',
                              kpi,
                            })
                          }
                          onArchive={() => setArchiving(kpi)}
                          onToggle={() =>
                            active.mutate(
                              {
                                kpiId: kpi.id,
                                isActive: !kpi.isActive,
                              },
                              {
                                onSuccess: () => toast.success(t('kpis.statusUpdated')),
                                onError: () => toast.error(t('kpis.errors.save')),
                              },
                            )
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
        <KpiEditorDialog
          key={editor.mode === 'edit' ? editor.kpi.id : 'create'}
          kpi={editor.mode === 'edit' ? editor.kpi : null}
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditor(null)
            }
          }}
        />
      ) : null}

      <ConfirmModal
        open={Boolean(archiving)}
        title={t('kpis.archiveTitle')}
        message={t('kpis.archiveDescription', {
          name: archiving?.name,
        })}
        confirmText={t('kpis.archive')}
        cancelText={t('common.cancel')}
        danger
        loading={archive.isPending}
        onCancel={() => setArchiving(null)}
        onConfirm={() =>
          archiving &&
          archive.mutate(archiving.id, {
            onSuccess: () => {
              toast.success(t('kpis.archived'))
              setArchiving(null)
            },
            onError: (error) =>
              toast.error(
                error instanceof ApiClientError && error.code === 'KPI_NOT_EMPTY'
                  ? t('kpis.errors.notEmpty')
                  : t('kpis.errors.archive'),
              ),
          })
        }
      />
    </div>
  )
}

function KpiCard({
  kpi,
  index,
  dragDisabled,
  justMoved,
  onEdit,
  onArchive,
  onToggle,
}: {
  kpi: PersonalKpi
  index: number
  dragDisabled: boolean
  justMoved: boolean
  onEdit: () => void
  onArchive: () => void
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const Icon = kpiIcons[kpi.iconKey]
  const sortable = useTaskHubSortable({ id: kpi.id, index })

  return (
    <div ref={sortable.ref} className="relative h-full">
      <Card
        className={cn(
          'group h-full hover:border-primary/20 hover:shadow-md',
          'origin-center transition-[transform,border-color,background-color,box-shadow] duration-180 ease-out motion-reduce:transition-none motion-reduce:transform-none',
          sortable.isDragging &&
            'border-primary/35 scale-[1.018] shadow-xl ring-1 ring-primary/15',
          sortable.isDropTarget &&
            !sortable.isDragging &&
            'border-primary/45 bg-primary/[0.035] scale-[1.012] shadow-lg ring-1 ring-primary/15',
          justMoved && !sortable.isDragging && 'bg-primary/[0.06] ring-1 ring-primary/20',
        )}
      >
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <SortableDragHandle
            handleRef={sortable.handleRef}
            label={t('common.dragToReorder', { name: kpi.name })}
            disabled={dragDisabled}
            className="-ms-1 mt-1 shrink-0"
          />

          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl"
            style={{
              backgroundColor: `${kpi.color}18`,
              color: kpi.color,
            }}
          >
            <Icon className="size-5" />
          </span>

          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              <Link className="hover:text-primary" to={`/kpis/${kpi.id}`}>
                {kpi.name}
              </Link>
            </CardTitle>

            <p className="text-muted-foreground mt-1 text-xs">
              {t(`kpis.methods.${kpi.calculationMethod}`)}
              {' · '}
              {t(`kpis.periods.${kpi.periodType}`)}
            </p>
          </div>
        </div>

        <span
          className={
            kpi.isActive
              ? 'bg-success/10 text-success rounded-full px-2.5 py-1 text-xs font-medium'
              : 'bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium'
          }
        >
          {t(kpi.isActive ? 'kpis.active' : 'kpis.inactive')}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm">
          {kpi.description || t('kpis.noDescription')}
        </p>

        <div className="bg-muted/50 rounded-lg p-3 text-sm">
          <div className="flex justify-between">
            <span>{t('kpis.target')}</span>
            <strong>{kpi.targetValue ?? t('kpis.noTarget')}</strong>
          </div>

          <p className="text-muted-foreground mt-3 text-xs">{t('kpis.templateOnlyHint')}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-4" />
            {t('common.edit')}
          </Button>

          <Button size="sm" variant="ghost" onClick={onToggle}>
            <PauseCircle className="size-4" />
            {t(kpi.isActive ? 'kpis.deactivate' : 'kpis.activate')}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="text-destructive ms-auto"
            aria-label={t('kpis.archive')}
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
