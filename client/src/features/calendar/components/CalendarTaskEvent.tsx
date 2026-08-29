import { AlertTriangle, BriefcaseBusiness, CalendarDays, Gauge, ListTodo } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  TaskDueIndicator,
  TaskPriorityIndicator,
  taskPriorityPresentation,
} from '@/features/tasks/components/TaskSelectIndicators'
import {
  TaskStatusIndicator,
  taskStatusPresentation,
} from '@/features/tasks/components/TaskStatusIndicator'
import { cn } from '@/lib/cn'
import { parseDateOnly } from '@/lib/date-only'

import type { CalendarTask } from '../types/calendar.types'

interface Props {
  task: CalendarTask
  monthGrid?: boolean
}

function taskSurfaceClass(task: CalendarTask): string {
  if (task.isOverdue) {
    return 'border-destructive/25 border-s-destructive bg-destructive/[0.055] hover:bg-destructive/[0.085]'
  }

  switch (task.status) {
    case 'IN_PROGRESS':
      return 'border-info/25 border-s-info bg-info/[0.055] hover:bg-info/[0.085]'
    case 'DONE':
      return 'border-success/25 border-s-success bg-success/[0.055] hover:bg-success/[0.085]'
    case 'CANCELLED':
      return 'border-destructive/20 border-s-destructive/70 bg-destructive/[0.035] hover:bg-destructive/[0.06]'
    case 'TODO':
      return 'border-border/80 border-s-muted-foreground/40 bg-muted/35 hover:bg-muted/60'
  }
}

function CalendarTaskTooltip({ task }: { task: CalendarTask }) {
  const { i18n, t } = useTranslation()
  const sourceDate =
    task.calendarDateSource === 'DUE_DATE'
      ? (task.dueDate ?? task.calendarDate)
      : (task.startDate ?? task.calendarDate)
  const parsedDate = parseDateOnly(sourceDate)
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [i18n.language],
  )
  const formattedDate = parsedDate ? dateFormatter.format(parsedDate) : sourceDate

  return (
    <TooltipContent className="border-border bg-popover text-popover-foreground w-72 max-w-[calc(100vw-1rem)] rounded-xl border p-3 shadow-xl">
      <div className="space-y-3">
        <p className="text-foreground text-sm leading-5 font-semibold">{task.title}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <TaskStatusIndicator status={task.status} pill />
          <TaskPriorityIndicator priority={task.priority} pill />
          {task.isOverdue ? (
            <TaskDueIndicator due="OVERDUE" label={t('tasks.overdue')} pill />
          ) : null}
        </div>

        <div className="border-border text-muted-foreground space-y-1.5 border-t pt-2.5 text-xs leading-5">
          {task.listId !== null ? (
            <div className="flex min-w-0 items-center gap-2">
              <ListTodo aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="font-medium">{t('tasks.list')}:</span>
              <span className="text-foreground min-w-0 truncate">
                {task.listName ?? t('calendar.taskContextUnavailable')}
              </span>
            </div>
          ) : (
            <>
              {task.cycleTitle ? (
                <div className="flex min-w-0 items-center gap-2">
                  <BriefcaseBusiness aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="font-medium">{t('workCycles.singular')}:</span>
                  <span className="text-foreground min-w-0 truncate">{task.cycleTitle}</span>
                </div>
              ) : null}
              <div className="flex min-w-0 items-center gap-2">
                <Gauge aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="font-medium">{t('tasks.kpi')}:</span>
                <span className="text-foreground min-w-0 truncate">
                  {task.kpiName ?? t('calendar.taskContextUnavailable')}
                </span>
              </div>
            </>
          )}

          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="font-medium">
              {task.calendarDateSource === 'DUE_DATE'
                ? t('calendar.dueDateSource')
                : t('calendar.startDateSource')}:
            </span>
            <span className="text-foreground min-w-0 truncate">{formattedDate}</span>
          </div>
        </div>
      </div>
    </TooltipContent>
  )
}

export function CalendarTaskEvent({ monthGrid = false, task }: Props) {
  const status = taskStatusPresentation[task.status]
  const priority = taskPriorityPresentation[task.priority]
  const StatusIcon = task.isOverdue ? AlertTriangle : status.icon
  const statusTone = task.isOverdue ? 'bg-destructive/10 text-destructive' : status.className

  if (monthGrid) {
    return (
      <div className="w-full min-w-0">
        <span
          className="flex min-h-4 items-center justify-center gap-1 sm:hidden"
          aria-hidden="true"
        >
          <span className={cn('grid size-4 shrink-0 place-items-center rounded-full', statusTone)}>
            <StatusIcon className="size-2.5" />
          </span>
          <span className={cn('size-1.5 shrink-0 rounded-full', priority.dot)} />
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'hidden min-w-0 items-center gap-1.5 rounded-md border border-s-2 px-1.5 py-1 shadow-xs sm:flex sm:px-2',
                taskSurfaceClass(task),
              )}
            >
              <span
                className={cn('grid size-4 shrink-0 place-items-center rounded-full', statusTone)}
              >
                <StatusIcon aria-hidden="true" className="size-2.5" />
              </span>
              <span
                className={cn(
                  'text-foreground min-w-0 flex-1 truncate text-[11px] font-semibold sm:text-xs',
                  task.status === 'CANCELLED' && 'text-muted-foreground',
                )}
              >
                {task.title}
              </span>
              <span
                aria-hidden="true"
                className={cn('size-1.5 shrink-0 rounded-full', priority.dot)}
              />
            </div>
          </TooltipTrigger>
          <CalendarTaskTooltip task={task} />
        </Tooltip>

        <span className="sr-only sm:hidden">{task.title}</span>
      </div>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 items-center gap-2 py-0.5">
          <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', statusTone)}>
            <StatusIcon aria-hidden="true" className="size-3.5" />
          </span>
          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
            {task.title}
          </span>
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', priority.dot)}
          />
        </div>
      </TooltipTrigger>
      <CalendarTaskTooltip task={task} />
    </Tooltip>
  )
}
