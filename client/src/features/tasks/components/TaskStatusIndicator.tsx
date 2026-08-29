import { CheckCircle2, Circle, Clock3, ListFilter, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import type { TaskStatus } from '../types/task.types'

export const taskStatusPresentation = {
  ALL: { icon: ListFilter, className: 'bg-muted text-muted-foreground' },
  TODO: { icon: Circle, className: 'bg-muted text-muted-foreground' },
  IN_PROGRESS: { icon: Clock3, className: 'bg-info/12 text-info-foreground' },
  DONE: { icon: CheckCircle2, className: 'bg-success/12 text-success-foreground' },
  CANCELLED: { icon: XCircle, className: 'bg-destructive/10 text-destructive' },
} as const

interface Props {
  status: TaskStatus | 'ALL'
  pill?: boolean
  className?: string
}

export function TaskStatusIndicator({ status, pill = false, className }: Props) {
  const { t } = useTranslation()
  const presentation = taskStatusPresentation[status]
  const Icon = presentation.icon

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 font-medium',
        pill && 'rounded-full px-2.5 py-1 text-xs',
        pill && presentation.className,
        className,
      )}
    >
      <span
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded-full',
          !pill && presentation.className,
        )}
      >
        <Icon aria-hidden="true" className={pill ? 'size-3.5' : 'size-3'} />
      </span>
      <span className="truncate">
        {status === 'ALL' ? t('tasks.allStatuses') : t(`tasks.statuses.${status}`)}
      </span>
    </span>
  )
}
