import {
  AlertTriangle,
  ArrowUp,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  CircleDot,
  Clock3,
  Flag,
  ListFilter,
  Type,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import type { TaskDueFilter, TaskPriority, TaskSortField } from '../types/task.types'

export const taskPriorityPresentation = {
  LOW: { dot: 'bg-info', tone: 'bg-info/12 text-info-foreground' },
  MEDIUM: { dot: 'bg-warning', tone: 'bg-warning/15 text-warning-foreground' },
  HIGH: { dot: 'bg-destructive', tone: 'bg-destructive/10 text-destructive' },
} as const

const duePresentation = {
  ALL: { icon: CalendarRange, className: 'bg-muted text-muted-foreground' },
  OVERDUE: { icon: AlertTriangle, className: 'bg-destructive/10 text-destructive' },
  TODAY: { icon: CalendarCheck2, className: 'bg-info/12 text-info-foreground' },
  UPCOMING: { icon: CalendarDays, className: 'bg-success/12 text-success-foreground' },
  NO_DATE: { icon: CalendarX2, className: 'bg-muted text-muted-foreground' },
} as const

const sortPresentation = {
  createdAt: { icon: Clock3, label: 'tasks.sortFields.createdAt' },
  dueDate: { icon: CalendarDays, label: 'tasks.sortFields.dueDate' },
  priority: { icon: Flag, label: 'tasks.sortFields.priority' },
  title: { icon: Type, label: 'tasks.sortFields.title' },
  status: { icon: CircleDot, label: 'tasks.sortFields.status' },
} as const

interface IndicatorProps {
  pill?: boolean
  className?: string
}

function SemanticIndicator({
  className,
  icon: Icon,
  label,
  pill = false,
  tone,
}: IndicatorProps & {
  icon: typeof ArrowUp
  label: string
  tone: string
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 font-medium',
        pill && 'rounded-full px-2.5 py-1 text-xs',
        pill && tone,
        className,
      )}
    >
      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', !pill && tone)}>
        <Icon aria-hidden="true" className={pill ? 'size-3.5' : 'size-3'} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  )
}

export function TaskPriorityIndicator({
  priority,
  ...props
}: IndicatorProps & { priority: TaskPriority | 'ALL' }) {
  const { t } = useTranslation()
  if (priority === 'ALL') {
    return (
      <SemanticIndicator
        {...props}
        icon={ListFilter}
        tone="bg-muted text-muted-foreground"
        label={t('tasks.allPriorities')}
      />
    )
  }
  const presentation = taskPriorityPresentation[priority]
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 font-medium',
        props.pill && 'rounded-full px-2.5 py-1 text-xs',
        props.pill && presentation.tone,
        props.className,
      )}
    >
      <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', presentation.dot)} />
      <span className="truncate">{t(`tasks.priorities.${priority}`)}</span>
    </span>
  )
}

export function TaskDueIndicator({
  due,
  label,
  ...props
}: IndicatorProps & { due: TaskDueFilter; label?: string }) {
  const { t } = useTranslation()
  const presentation = duePresentation[due]
  return (
    <SemanticIndicator
      {...props}
      icon={presentation.icon}
      tone={presentation.className}
      label={label ?? t(`tasks.dueFilters.${due}`)}
    />
  )
}

export function TaskSortIndicator({
  sortBy,
  pill = false,
}: {
  sortBy: TaskSortField
  pill?: boolean
}) {
  const { t } = useTranslation()
  const presentation = sortPresentation[sortBy]
  const Icon = presentation.icon
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 font-medium',
        pill && 'bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs',
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{t(presentation.label)}</span>
    </span>
  )
}
