import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { cn } from '@/lib/cn'

import type { TaskStatus, TaskSummary } from '../types/task.types'

interface TaskListSummaryProps {
  summary: TaskSummary
  activeStatus?: TaskStatus
  overdueActive?: boolean
  onStatusClick: (status: TaskStatus) => void
  onOverdueClick: () => void
}

const statusSegments: Array<{
  status: TaskStatus
  key: keyof Pick<TaskSummary, 'todo' | 'inProgress' | 'done' | 'cancelled'>
  className: string
  dotClassName: string
}> = [
  {
    status: 'DONE',
    key: 'done',
    className: 'bg-success',
    dotClassName: 'bg-success',
  },
  {
    status: 'IN_PROGRESS',
    key: 'inProgress',
    className: 'bg-info',
    dotClassName: 'bg-info',
  },
  {
    status: 'TODO',
    key: 'todo',
    className: 'bg-muted-foreground/40',
    dotClassName: 'bg-muted-foreground/55',
  },
  {
    status: 'CANCELLED',
    key: 'cancelled',
    className: 'bg-destructive/55',
    dotClassName: 'bg-destructive/70',
  },
]

const smoothEase = [0.22, 1, 0.36, 1] as const

function percentage(value: number, total: number): number {
  if (total <= 0) return 0

  return Math.round((value / total) * 100)
}

export function TaskListSummary({
  summary,
  activeStatus,
  overdueActive = false,
  onStatusClick,
  onOverdueClick,
}: TaskListSummaryProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()

  const activeTaskTotal = Math.max(0, summary.total - summary.cancelled)
  const completionPercentage = percentage(summary.done, activeTaskTotal)
  const subtaskPercentage = percentage(summary.subtaskCompleted, summary.subtaskTotal)

  return (
    <CollapsibleSection
      defaultOpen
      title={t('tasks.summary.title')}
      description={t('tasks.summary.description')}
      collapsedDescription={t('tasks.summary.collapsedLine', {
        done: summary.done,
        active: activeTaskTotal,
        overdue: summary.overdue,
      })}
      expandLabel={t('tasks.summary.expand')}
      collapseLabel={t('tasks.summary.collapse')}
      titleClassName="text-sm"
      descriptionClassName="truncate text-xs"
    >
      {/* Main metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg px-3 py-2">
          <div className="text-xl font-semibold tabular-nums">{summary.total}</div>

          <div className="text-muted-foreground mt-0.5 text-xs">
            {t('tasks.summary.total')}
          </div>
        </div>

        <button
          type="button"
          aria-pressed={activeStatus === 'DONE'}
          aria-label={t('tasks.summary.filterStatus', {
            status: t('tasks.statuses.DONE'),
          })}
          className={cn(
            'rounded-lg px-3 py-2 text-start transition-colors',
            activeStatus === 'DONE' ? 'bg-success/10' : 'hover:bg-muted/60',
          )}
          onClick={() => onStatusClick('DONE')}
        >
          <div className="text-success text-xl font-semibold tabular-nums">
            {summary.done}
          </div>

          <div className="text-muted-foreground mt-0.5 text-xs">
            {t('tasks.summary.completed')} · {completionPercentage}%
          </div>
        </button>

        <button
          type="button"
          aria-pressed={activeStatus === 'IN_PROGRESS'}
          aria-label={t('tasks.summary.filterStatus', {
            status: t('tasks.statuses.IN_PROGRESS'),
          })}
          className={cn(
            'rounded-lg px-3 py-2 text-start transition-colors',
            activeStatus === 'IN_PROGRESS' ? 'bg-info/10' : 'hover:bg-muted/60',
          )}
          onClick={() => onStatusClick('IN_PROGRESS')}
        >
          <div className="text-info-foreground text-xl font-semibold tabular-nums">
            {summary.inProgress}
          </div>

          <div className="text-muted-foreground mt-0.5 text-xs">
            {t('tasks.summary.inProgress')}
          </div>
        </button>

        <button
          type="button"
          aria-pressed={overdueActive}
          aria-label={t('tasks.summary.filterOverdue')}
          className={cn(
            'rounded-lg px-3 py-2 text-start transition-colors',
            overdueActive ? 'bg-destructive/10' : 'hover:bg-muted/60',
          )}
          onClick={onOverdueClick}
        >
          <div className="text-destructive text-xl font-semibold tabular-nums">
            {summary.overdue}
          </div>

          <div className="text-muted-foreground mt-0.5 text-xs">
            {t('tasks.summary.overdue')}
          </div>
        </button>
      </div>

      {/* Task status distribution */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs font-medium">
            {t('tasks.summary.taskStatus')}
          </span>

          <span className="text-muted-foreground text-xs tabular-nums">
            {t('tasks.summary.activeCompletion', {
              percentage: completionPercentage,
            })}
          </span>
        </div>

        <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
          {summary.total === 0 ? (
            <div className="bg-muted h-full w-full" />
          ) : (
            statusSegments.map((segment) => {
              const value = summary[segment.key]

              if (value === 0) {
                return null
              }

              return (
                <button
                  key={segment.status}
                  type="button"
                  aria-label={t('tasks.summary.segmentLabel', {
                    status: t(`tasks.statuses.${segment.status}`),
                    count: value,
                  })}
                  className={cn(
                    'h-full min-w-1 transition-opacity hover:opacity-80 focus-visible:outline-none',
                    segment.className,
                    activeStatus &&
                      activeStatus !== segment.status &&
                      'opacity-35 hover:opacity-60',
                  )}
                  style={{
                    width: `${(value / summary.total) * 100}%`,
                  }}
                  onClick={() => onStatusClick(segment.status)}
                />
              )
            })
          )}
        </div>

        {/* Status legend */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {statusSegments.map((segment) => {
            const value = summary[segment.key]

            return (
              <button
                key={segment.status}
                type="button"
                aria-pressed={activeStatus === segment.status}
                className={cn(
                  'text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md text-xs transition-colors',
                  activeStatus === segment.status && 'text-foreground font-medium',
                )}
                onClick={() => onStatusClick(segment.status)}
              >
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', segment.dotClassName)}
                />

                <span>{t(`tasks.statuses.${segment.status}`)}</span>

                <span className="tabular-nums">{value}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Subtask progress */}
      {summary.subtaskTotal > 0 ? (
        <div className="mt-4 border-t pt-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground font-medium">
              {t('tasks.summary.subtasks')}
            </span>

            <span className="font-medium tabular-nums">
              {summary.subtaskCompleted}/{summary.subtaskTotal} · {subtaskPercentage}%
            </span>
          </div>

          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <motion.div
              initial={false}
              animate={{
                width: `${subtaskPercentage}%`,
              }}
              transition={
                shouldReduceMotion
                  ? {
                      duration: 0,
                    }
                  : {
                      duration: 0.35,
                      ease: smoothEase,
                    }
              }
              className="bg-success h-full rounded-full"
            />
          </div>
        </div>
      ) : null}
    </CollapsibleSection>
  )
}
