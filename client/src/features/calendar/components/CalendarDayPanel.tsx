import { AlertTriangle, CalendarDays, Gauge, ListTodo, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { TaskPriorityIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/cn'
import { parseDateOnly } from '@/lib/date-only'

import type { CalendarScope, CalendarTask } from '../types/calendar.types'

interface Props {
  date: string | null
  tasks: CalendarTask[]
  scope: CalendarScope
  canCreate: boolean
  createUnavailableReason?: string | undefined
  onOpenChange: (open: boolean) => void
  onOpenTask: (taskId: number) => void
  onCreateTask: () => void
}

interface DayPanelContentProps extends Omit<Props, 'date' | 'onOpenChange'> {
  formattedDate: string
  headingId: string
  compact?: boolean
  onClose?: () => void
}

function DayPanelContent({
  canCreate,
  compact = false,
  createUnavailableReason,
  formattedDate,
  headingId,
  onClose,
  onCreateTask,
  onOpenTask,
  scope,
  tasks,
}: DayPanelContentProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-0 flex-col">
      <div className={cn('border-b px-5 py-5', compact ? 'pe-5' : 'pe-14')}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="bg-primary/10 text-primary mb-3 grid size-10 place-items-center rounded-xl">
              <CalendarDays aria-hidden="true" className="size-5" />
            </div>
            {compact ? (
              <h2 id={headingId} className="text-lg font-semibold sm:text-xl">
                {formattedDate}
              </h2>
            ) : (
              <DialogTitle id={headingId} className="text-xl">
                {formattedDate}
              </DialogTitle>
            )}
            {compact ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {t('calendar.dayTaskCount', { count: tasks.length })}
              </p>
            ) : (
              <DialogDescription className="mt-1">
                {t('calendar.dayTaskCount', { count: tasks.length })}
              </DialogDescription>
            )}
          </div>

          {compact && onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-me-2 -mt-2 shrink-0"
              aria-label={t('common.close')}
              onClick={onClose}
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn('min-h-0 flex-1 p-4 sm:p-5', !compact && 'overflow-y-auto')}>
        {tasks.length === 0 ? (
          <div className="border-border bg-muted/20 text-muted-foreground rounded-xl border border-dashed p-7 text-center text-sm">
            {t('calendar.emptyDay')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={cn(
                  'bg-card hover:border-primary/30 focus-visible:ring-ring w-full rounded-xl border p-3.5 text-start shadow-sm transition-[border-color,box-shadow] hover:shadow-md focus-visible:ring-2 focus-visible:outline-none',
                  task.isOverdue && 'border-destructive/25',
                )}
                onClick={() => onOpenTask(task.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={task.title}>
                      {task.title}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <TaskStatusIndicator status={task.status} pill />
                      <TaskPriorityIndicator priority={task.priority} pill />
                      {task.isOverdue ? (
                        <span className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium">
                          <AlertTriangle aria-hidden="true" className="size-3.5" />
                          {t('tasks.overdue')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2.5 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    {task.listId ? (
                      <ListTodo aria-hidden="true" className="size-3.5" />
                    ) : (
                      <Gauge aria-hidden="true" className="size-3.5" />
                    )}
                    {task.listName ?? task.kpiName ?? t('calendar.taskContextUnavailable')}
                  </span>
                  <span>
                    {task.calendarDateSource === 'DUE_DATE'
                      ? t('calendar.dueDateSource')
                      : t('calendar.startDateSource')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t p-4 sm:p-5">
        <Button className="w-full" disabled={!canCreate} onClick={onCreateTask}>
          <Plus aria-hidden="true" className="size-4" />
          {t('calendar.addTaskOnDate')}
        </Button>
        {!canCreate && createUnavailableReason ? (
          <p className="text-muted-foreground mt-2 text-center text-xs leading-5">
            {createUnavailableReason}
          </p>
        ) : scope === 'KPI' ? (
          <p className="text-muted-foreground mt-2 text-center text-xs leading-5">
            {t('calendar.kpiDatePolicyHint')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function CalendarDayPanel({
  canCreate,
  createUnavailableReason,
  date,
  onCreateTask,
  onOpenChange,
  onOpenTask,
  scope,
  tasks,
}: Props) {
  const { i18n, t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 639px)')
  const mobilePanelRef = useRef<HTMLElement>(null)
  const formattedDate = useMemo(() => {
    const parsed = parseDateOnly(date)
    if (!parsed) return date ?? ''
    return new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(parsed)
  }, [date, i18n.language])
  const headingId = `calendar-day-panel-${date ?? 'closed'}`

  useEffect(() => {
    if (!isMobile || date === null) return
    const frame = window.requestAnimationFrame(() => {
      mobilePanelRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [date, isMobile])

  if (isMobile) {
    if (date === null) return null

    return (
      <section
        ref={mobilePanelRef}
        aria-labelledby={headingId}
        className="bg-card scroll-mt-20 overflow-hidden rounded-xl border shadow-sm"
      >
        <DayPanelContent
          compact
          canCreate={canCreate}
          createUnavailableReason={createUnavailableReason}
          formattedDate={formattedDate}
          headingId={headingId}
          scope={scope}
          tasks={tasks}
          onClose={() => onOpenChange(false)}
          onOpenTask={onOpenTask}
          onCreateTask={onCreateTask}
        />
      </section>
    )
  }

  return (
    <Dialog open={date !== null} onOpenChange={onOpenChange}>
      <DialogContent
        variant="drawer"
        closeLabel={t('common.close')}
        className="w-[min(25rem,92vw)] sm:w-[25rem]"
      >
        <DayPanelContent
          canCreate={canCreate}
          createUnavailableReason={createUnavailableReason}
          formattedDate={formattedDate}
          headingId={headingId}
          scope={scope}
          tasks={tasks}
          onOpenTask={onOpenTask}
          onCreateTask={onCreateTask}
        />
      </DialogContent>
    </Dialog>
  )
}
