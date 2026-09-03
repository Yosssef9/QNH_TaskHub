import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  Clock3,
  FileClock,
  FileWarning,
  Gauge,
  Loader2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../hooks/use-notifications'
import type { NotificationItem, NotificationType } from '../types/notification.types'

const notificationIcons: Record<NotificationType, LucideIcon> = {
  TASK_OVERDUE: AlertTriangle,
  TASK_DUE_TODAY: Clock3,
  HIGH_PRIORITY_TASK_DUE_TOMORROW: CalendarClock,
  CURRENT_CYCLE_ENDING_SOON: CalendarClock,
  CURRENT_CYCLE_PAST_END: AlertTriangle,
  KPI_BELOW_TARGET: Gauge,
  KPI_MEASUREMENT_DUE: Gauge,
  CONTRACT_EXPIRATION_REMINDER: FileWarning,
  CONTRACT_NOTICE_DEADLINE_REMINDER: FileClock,
  MEETING_REQUEST_SUBMITTED: CalendarClock,
  MEETING_REQUEST_UPDATED: CalendarClock,
  MEETING_RESCHEDULE_REQUEST_CANCELLED: CalendarClock,
  MEETING_APPROVED: CheckCheck,
  MEETING_REJECTED: AlertTriangle,
  MEETING_INVITED: CalendarClock,
  MEETING_RESCHEDULED: CalendarClock,
  MEETING_CANCELLED: AlertTriangle,
  MEETING_START_REMINDER: Clock3,
}

const notificationTones: Record<NotificationType, string> = {
  TASK_OVERDUE: 'bg-destructive/10 text-destructive',
  TASK_DUE_TODAY: 'bg-warning/10 text-warning-foreground',
  HIGH_PRIORITY_TASK_DUE_TOMORROW: 'bg-warning/10 text-warning-foreground',
  CURRENT_CYCLE_ENDING_SOON: 'bg-info/10 text-info-foreground',
  CURRENT_CYCLE_PAST_END: 'bg-destructive/10 text-destructive',
  KPI_BELOW_TARGET: 'bg-destructive/10 text-destructive',
  KPI_MEASUREMENT_DUE: 'bg-primary/10 text-primary',
  CONTRACT_EXPIRATION_REMINDER: 'bg-warning/10 text-warning-foreground',
  CONTRACT_NOTICE_DEADLINE_REMINDER: 'bg-warning/10 text-warning-foreground',
  MEETING_REQUEST_SUBMITTED: 'bg-info/10 text-info-foreground',
  MEETING_REQUEST_UPDATED: 'bg-info/10 text-info-foreground',
  MEETING_RESCHEDULE_REQUEST_CANCELLED: 'bg-warning/10 text-warning-foreground',
  MEETING_APPROVED: 'bg-success/10 text-success',
  MEETING_REJECTED: 'bg-destructive/10 text-destructive',
  MEETING_INVITED: 'bg-primary/10 text-primary',
  MEETING_RESCHEDULED: 'bg-info/10 text-info-foreground',
  MEETING_CANCELLED: 'bg-destructive/10 text-destructive',
  MEETING_START_REMINDER: 'bg-warning/10 text-warning-foreground',
}

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null
  return new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatMetric(
  value: number | null,
  unit: 'PERCENT' | 'NUMBER' | null,
  locale: string,
): string {
  if (value === null) return '—'
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
  return unit === 'PERCENT' ? `${formatted}%` : formatted
}

function relativeTime(value: string, locale: string): string {
  const diffMs = new Date(value).getTime() - Date.now()
  const absoluteMs = Math.abs(diffMs)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (absoluteMs < 60_000) return formatter.format(0, 'minute')
  if (absoluteMs < 3_600_000) return formatter.format(Math.round(diffMs / 60_000), 'minute')
  if (absoluteMs < 86_400_000) return formatter.format(Math.round(diffMs / 3_600_000), 'hour')
  return formatter.format(Math.round(diffMs / 86_400_000), 'day')
}

export function NotificationBell() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const query = useNotifications(10)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const unreadCount = query.data?.unreadCount ?? 0
  const badge = unreadCount > 9 ? '9+' : String(unreadCount)

  function openNotification(item: NotificationItem) {
    if (!item.readAtUtc) void markRead.mutate(item.id)
    setOpen(false)
    navigate(item.href)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              unreadCount
                ? t('notifications.openWithCount', { count: unreadCount })
                : t('notifications.open')
            }
          >
            <Bell aria-hidden="true" className="size-5" />
            {unreadCount > 0 ? (
              <span className="bg-destructive text-white absolute -end-0.5 -top-0.5 grid min-w-4.5 place-items-center rounded-full px-1 text-[10px] leading-[18px] font-bold shadow-sm">
                {badge}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-[min(26rem,calc(100vw-1rem))] overflow-hidden p-0"
        >
          <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{t('notifications.title')}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {unreadCount
                  ? t('notifications.unreadCount', { count: unreadCount })
                  : t('notifications.allCaughtUp')}
              </p>
            </div>
            {unreadCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={markAll.isPending}
                className="shrink-0"
                onClick={() => markAll.mutate()}
              >
                {markAll.isPending ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <CheckCheck aria-hidden="true" className="size-3.5" />
                )}
                {t('notifications.markAllRead')}
              </Button>
            ) : null}
          </div>

          <div className="max-h-[min(32rem,70vh)] overflow-y-auto">
            {query.isPending ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 px-4 py-10 text-sm">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                {t('notifications.loading')}
              </div>
            ) : query.isError ? (
              <div className="px-4 py-8 text-center">
                <p className="text-destructive text-sm">{t('notifications.error')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void query.refetch()}
                >
                  {t('common.retry')}
                </Button>
              </div>
            ) : query.data.items.length ? (
              <div className="divide-border divide-y">
                {query.data.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    locale={i18n.language}
                    onOpen={() => openNotification(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="px-6 py-10 text-center">
                <span className="bg-muted text-muted-foreground mx-auto grid size-11 place-items-center rounded-full">
                  <Bell aria-hidden="true" className="size-5" />
                </span>
                <p className="mt-3 text-sm font-medium">{t('notifications.emptyTitle')}</p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {t('notifications.emptyDescription')}
                </p>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <span className="sr-only" role="status" aria-live="polite">
        {t('notifications.unreadStatus', { count: unreadCount })}
      </span>
    </>
  )
}

function NotificationRow({
  item,
  locale,
  onOpen,
}: {
  item: NotificationItem
  locale: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const Icon = notificationIcons[item.type]
  const eventDate = formatDate(item.eventDate, locale)
  const unread = item.readAtUtc === null

  return (
    <button
      type="button"
      className={cn(
        'hover:bg-muted/55 focus-visible:ring-ring relative flex w-full items-start gap-3 px-4 py-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset',
        unread && 'bg-primary/[0.045]',
      )}
      onClick={onOpen}
    >
      {unread ? (
        <span aria-hidden="true" className="bg-primary absolute end-3 top-3 size-2 rounded-full" />
      ) : null}

      <span
        className={cn(
          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
          notificationTones[item.type],
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>

      <span className="min-w-0 flex-1 pe-3">
        <span className="text-muted-foreground block text-[11px] font-semibold">
          {t(`notifications.types.${item.type}`)}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold">{item.subjectTitle}</span>
        {item.contextTitle ? (
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
            {item.contextTitle}
          </span>
        ) : null}
        <NotificationDetail item={item} eventDate={eventDate} locale={locale} />
        <span className="text-muted-foreground mt-1.5 block text-[11px]">
          {relativeTime(item.createdAtUtc, locale)}
        </span>
      </span>
    </button>
  )
}

function NotificationDetail({
  item,
  eventDate,
  locale,
}: {
  item: NotificationItem
  eventDate: string | null
  locale: string
}) {
  const { t } = useTranslation()

  if (item.type === 'CONTRACT_EXPIRATION_REMINDER' && eventDate) {
    return (
      <span className="text-muted-foreground mt-1 block text-xs">
        {t('notifications.contractEndDate', { date: eventDate })}
      </span>
    )
  }

  if (item.type === 'CONTRACT_NOTICE_DEADLINE_REMINDER' && eventDate) {
    return (
      <span className="text-muted-foreground mt-1 block text-xs">
        {t('notifications.contractNoticeDeadline', { date: eventDate })}
      </span>
    )
  }

  if (item.type === 'KPI_BELOW_TARGET') {
    return (
      <span className="text-muted-foreground mt-1 block text-xs">
        {t('notifications.kpiResult', {
          actual: formatMetric(item.actualValue, item.measurementUnit, locale),
          target: formatMetric(item.targetValue, item.measurementUnit, locale),
        })}
      </span>
    )
  }

  if (item.type === 'KPI_MEASUREMENT_DUE' && eventDate) {
    return (
      <span className="text-muted-foreground mt-1 block text-xs">
        {t('notifications.measurementDue', { date: eventDate })}
      </span>
    )
  }

  if (eventDate) {
    return (
      <span className="text-muted-foreground mt-1 block text-xs">
        {t('notifications.eventDate', { date: eventDate })}
      </span>
    )
  }

  return null
}


