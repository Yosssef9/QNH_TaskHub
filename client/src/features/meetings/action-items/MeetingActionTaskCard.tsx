import { CalendarDays, Check, Circle, ListChecks, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TaskPriorityIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import type { TaskStatus } from '@/features/tasks/types/task.types'
import { parseDateOnly } from '@/lib/date-only'
import { cn } from '@/lib/cn'

import type { MeetingActionItem } from './meeting-action-items.types'

interface MeetingActionTaskCardProps {
  item: MeetingActionItem
  onOpen: () => void
  canChangeStatus?: boolean
  completionBlockedMessage?: string | undefined
  statusPending?: boolean
  onStatusChange?: (nextStatus: TaskStatus) => void
  showMeeting?: boolean
  onOpenMeeting?: () => void
  showAssignee?: boolean
  showAssignedBy?: boolean
  actionMenu?: ReactNode
}

function TaskDate({ item }: { item: MeetingActionItem }) {
  const { i18n, t } = useTranslation()

  if (!item.dueDate) return <span>{t('tasks.noDueDate')}</span>

  const date = parseDateOnly(item.dueDate)
  return (
    <span className={item.isOverdue ? 'text-destructive font-medium' : undefined}>
      {item.isOverdue ? t('tasks.overdue') : t('tasks.due')} ·{' '}
      {date?.toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}
    </span>
  )
}

export function MeetingActionTaskCard({
  item,
  onOpen,
  canChangeStatus = false,
  completionBlockedMessage,
  statusPending = false,
  onStatusChange,
  showMeeting = false,
  onOpenMeeting,
  showAssignee = false,
  showAssignedBy = false,
  actionMenu,
}: MeetingActionTaskCardProps) {
  const { t } = useTranslation()
  const completionIsUnavailable = !canChangeStatus || item.status === 'CANCELLED' || statusPending
  const completionNativeDisabled =
    item.status === 'CANCELLED' || statusPending || (!canChangeStatus && !completionBlockedMessage)
  const statusDisabled = !canChangeStatus || item.status === 'CANCELLED' || statusPending

  function changeStatus(nextStatus: TaskStatus) {
    if (!canChangeStatus || statusPending) return
    onStatusChange?.(nextStatus)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('tasks.details.open', { title: item.title })}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group focus-visible:ring-ring relative flex cursor-pointer flex-col gap-4 rounded-xl border border-s-[3px] border-s-transparent p-4 shadow-sm transition-[border-color,background-color,box-shadow] duration-300 ease-out focus-visible:ring-2 focus-visible:outline-none sm:flex-row sm:items-start sm:p-5',
        item.status === 'DONE'
          ? 'border-success/25 border-s-success/65 bg-success/[0.035] hover:border-success/40 hover:border-s-success/80 hover:bg-success/[0.055] hover:shadow-md'
          : item.isOverdue
            ? 'border-destructive/20 border-s-destructive/55 bg-card hover:border-destructive/35 hover:shadow-md'
            : 'bg-card hover:border-primary/25 hover:shadow-md',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={completionNativeDisabled}
            aria-disabled={completionIsUnavailable}
            className={cn(
              'focus-visible:ring-ring grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,color,box-shadow,transform] duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none active:scale-95 disabled:cursor-default aria-disabled:cursor-not-allowed',
              item.status === 'DONE'
                ? 'bg-success text-success-foreground shadow-sm'
                : item.status === 'CANCELLED'
                  ? 'text-destructive opacity-60'
                  : canChangeStatus
                    ? 'text-muted-foreground hover:bg-success/10 hover:text-success'
                    : 'bg-muted/60 text-muted-foreground',
            )}
            aria-label={
              canChangeStatus
                ? t(item.status === 'DONE' ? 'tasks.reopenTask' : 'tasks.completeTask', {
                    title: item.title,
                  })
                : completionBlockedMessage ?? t(`tasks.statuses.${item.status}`)
            }
            onClick={(event) => {
              event.stopPropagation()
              if (item.status === 'CANCELLED' || statusPending) return
              if (!canChangeStatus) {
                if (completionBlockedMessage) toast.error(completionBlockedMessage)
                return
              }
              changeStatus(item.status === 'DONE' ? 'TODO' : 'DONE')
            }}
          >
            {item.status === 'DONE' ? (
              <Check className="size-5" strokeWidth={2.75} />
            ) : (
              <Circle className="size-6" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {canChangeStatus
            ? t(item.status === 'DONE' ? 'tasks.reopenTask' : 'tasks.completeTask', {
                title: item.title,
              })
            : completionBlockedMessage ?? t(`tasks.statuses.${item.status}`)}
        </TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-start text-base font-semibold',
            item.status === 'DONE' && 'text-foreground/85',
          )}
        >
          {item.title}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <button
            type="button"
            disabled={statusDisabled}
            className="focus-visible:ring-ring rounded-full transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-80"
            onClick={(event) => {
              event.stopPropagation()
              if (statusDisabled) return

              if (item.status === 'TODO') {
                changeStatus('IN_PROGRESS')
                return
              }

              if (item.status === 'IN_PROGRESS' || item.status === 'DONE') {
                changeStatus('TODO')
              }
            }}
          >
            <TaskStatusIndicator status={item.status} pill />
          </button>

          <TaskPriorityIndicator priority={item.priority} className="text-muted-foreground" />

          <span aria-hidden="true" className="bg-border hidden h-4 w-px sm:block" />

          <span className="text-muted-foreground flex items-center gap-1.5">
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
            <TaskDate item={item} />
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {showMeeting ? (
            <button
              type="button"
              className="text-primary hover:text-primary/80 focus-visible:ring-ring inline-flex min-w-0 items-center gap-1.5 rounded-md font-medium focus-visible:ring-2 focus-visible:outline-none"
              onClick={(event) => {
                event.stopPropagation()
                onOpenMeeting?.()
              }}
            >
              <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{item.meetingTitle}</span>
            </button>
          ) : null}

          {showAssignee ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              <UserRound aria-hidden="true" className="size-4 shrink-0" />
              {t('meetings.followUp.assignedTo', { name: item.assigneeName })}
            </span>
          ) : null}

          {showAssignedBy ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              <UserRound aria-hidden="true" className="size-4 shrink-0" />
              {t('tasks.assignedToMe.assignedBy', { name: item.assignedByName })}
            </span>
          ) : null}
        </div>

        {item.agendaTitle ? (
          <div className="text-muted-foreground mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted/45 px-2 py-1 text-xs">
            <ListChecks aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="shrink-0">{t('meetings.followUp.agenda')}:</span>
            <span className="truncate">{item.agendaTitle}</span>
          </div>
        ) : null}

        {item.subtaskTotal > 0 ? (
          <div className="mt-4 max-w-md">
            <div className="text-muted-foreground mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span>{t('tasks.subtaskProgress')}</span>
              <span className="font-medium tabular-nums">
                {item.subtaskCompleted}/{item.subtaskTotal} ·{' '}
                {Math.round((item.subtaskCompleted / item.subtaskTotal) * 100)}%
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-success h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.round((item.subtaskCompleted / item.subtaskTotal) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {actionMenu ? (
        <div
          className="shrink-0 self-end sm:self-start"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {actionMenu}
        </div>
      ) : null}
    </div>
  )
}
