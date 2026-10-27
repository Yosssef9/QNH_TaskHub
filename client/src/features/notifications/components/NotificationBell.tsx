import {
  Pencil,
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  Clock3,
  FileClock,
  FileWarning,
  Gauge,
  Loader2,
  MessageCircle,
  AtSign,
  Paperclip,
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
  MEETING_SERIES_SCHEDULED: CalendarClock,
  MEETING_START_REMINDER: Clock3,
  MEETING_ACTION_ITEM_ASSIGNED: CalendarClock,
  MEETING_ACTION_ITEM_COMPLETED: CheckCheck,
  TASK_DISCUSSION_MESSAGE: CalendarClock,
  TASK_DISCUSSION_MENTION: CalendarClock,
  TASK_SHARED: CalendarClock,
  TASK_SHARE_UPDATED: CalendarClock,
  TASK_SHARE_REVOKED: AlertTriangle,
  GENERAL_TASK_ASSIGNED: CalendarClock,
  GENERAL_SUBTASK_ASSIGNED: CalendarClock,
  GENERAL_TASK_COMPLETED: CheckCheck,
  TASK_WORK_NOTE_ADDED: Pencil,
  TASK_ATTACHMENT_ADDED: Paperclip,
  GENERAL_ASSIGNMENT_REMOVED: AlertTriangle,
  GENERAL_TASK_DUE_CHANGED: Clock3,
  GENERAL_SUBTASK_DUE_CHANGED: Clock3,
  GENERAL_TASK_REOPENED: Clock3,
  GENERAL_SUBTASK_COMPLETED: CheckCheck,
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
  MEETING_SERIES_SCHEDULED: 'bg-primary/10 text-primary',
  MEETING_START_REMINDER: 'bg-warning/10 text-warning-foreground',
  MEETING_ACTION_ITEM_ASSIGNED: 'bg-primary/10 text-primary',
  MEETING_ACTION_ITEM_COMPLETED: 'bg-success/10 text-success',
  TASK_DISCUSSION_MESSAGE: 'bg-primary/10 text-primary',
  TASK_DISCUSSION_MENTION: 'bg-info/10 text-info-foreground',
  TASK_SHARED: 'bg-primary/10 text-primary',
  TASK_SHARE_UPDATED: 'bg-info/10 text-info-foreground',
  TASK_SHARE_REVOKED: 'bg-warning/10 text-warning-foreground',
  GENERAL_TASK_ASSIGNED: 'bg-primary/10 text-primary',
  GENERAL_SUBTASK_ASSIGNED: 'bg-primary/10 text-primary',
  GENERAL_TASK_COMPLETED: 'bg-success/10 text-success',
  TASK_WORK_NOTE_ADDED: 'bg-info/10 text-info-foreground',
  TASK_ATTACHMENT_ADDED: 'bg-primary/10 text-primary',
  GENERAL_ASSIGNMENT_REMOVED: 'bg-warning/10 text-warning-foreground',
  GENERAL_TASK_DUE_CHANGED: 'bg-warning/10 text-warning-foreground',
  GENERAL_SUBTASK_DUE_CHANGED: 'bg-warning/10 text-warning-foreground',
  GENERAL_TASK_REOPENED: 'bg-info/10 text-info-foreground',
  GENERAL_SUBTASK_COMPLETED: 'bg-success/10 text-success',
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
  if (item.type === 'TASK_DISCUSSION_MESSAGE' || item.type === 'TASK_DISCUSSION_MENTION') {
    return <DiscussionNotificationRow item={item} locale={locale} onOpen={onOpen} />
  }
  const Icon = notificationIcons[item.type]
  const eventDate = formatDate(item.eventDate, locale)
  const unread = item.readAtUtc === null
  const contextTitle =
    item.type === 'MEETING_SERIES_SCHEDULED' && item.contextTitle
      ? t('notifications.seriesMeetingCount', { count: Number(item.contextTitle) })
      : item.contextTitle

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
        {contextTitle ? (
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
            {contextTitle}
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

/** Dedicated compact, permission-safe rendering for discussion events. */
function DiscussionNotificationRow({
  item,
  locale,
  onOpen,
}: {
  item: NotificationItem
  locale: string
  onOpen: () => void
}) {
  const isArabic = locale.toLowerCase().startsWith('ar')
  const mention = item.type === 'TASK_DISCUSSION_MENTION'
  const unread = item.readAtUtc === null
  const details = item.discussion
  const available = details?.status === 'active'
  const deleted = details?.status === 'deleted'
  const sender = available ? details.senderName || (isArabic ? 'أحد الزملاء' : 'A colleague') : null
  const title = available || deleted ? details.taskTitle : null
  const subtask = available || deleted ? details.subtaskTitle : null
  const preview = available ? details.preview : null
  const fallback = deleted
    ? (isArabic ? 'تم حذف هذه الرسالة' : 'This message was deleted')
    : (isArabic ? 'هذه المناقشة لم تعد متاحة' : 'This discussion is no longer available')
  const initials = sender
    ? sender.trim().split(/\s+/u).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase()
    : ''

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'hover:bg-muted/55 focus-visible:ring-ring relative flex w-full items-start gap-3 px-4 py-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset',
        unread && 'bg-primary/[0.045]',
      )}
    >
      {unread ? <span aria-hidden="true" className="bg-primary absolute end-3 top-3 size-2 rounded-full" /> : null}
      <span className={cn(
        'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-bold',
        mention ? 'bg-info/10 text-info-foreground' : 'bg-primary/10 text-primary',
      )} aria-hidden="true">
        {initials || (mention ? <AtSign className="size-4" /> : <MessageCircle className="size-4" />)}
      </span>
      <span className="min-w-0 flex-1 pe-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">
            {sender ?? (deleted ? (isArabic ? 'رسالة محذوفة' : 'Deleted message') : (isArabic ? 'مناقشة غير متاحة' : 'Unavailable discussion'))}
          </span>
          {available && mention ? (
            <span className="bg-info/10 text-info-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
              {isArabic ? 'أشار إليك' : 'Mentioned you'}
            </span>
          ) : available ? (
            <span className="text-muted-foreground truncate text-[11px]">
              {isArabic ? 'أرسل رسالة' : 'sent a message'}
            </span>
          ) : null}
        </span>
        {title ? (
          <span className="text-foreground mt-1 flex min-w-0 items-center gap-1.5 text-xs font-medium">
            <span className="truncate">{title}</span>
            {subtask ? <span className="text-muted-foreground truncate">· {subtask}</span> : null}
          </span>
        ) : null}
        <span className={cn(
          'mt-1.5 block rounded-md px-2.5 py-2 text-xs leading-5',
          available ? 'border-border/70 bg-background/75 border' : 'text-muted-foreground bg-muted/60',
        )}>
          {available ? (
            <span className="line-clamp-3 break-words" dir="auto">
              {preview || (details.hasAttachment
                ? (isArabic ? 'مرفق جديد' : 'New attachment')
                : (isArabic ? 'رسالة جديدة' : 'New message'))}
            </span>
          ) : fallback}
          {available && details.hasAttachment ? (
            <span className="text-muted-foreground mt-1 flex items-center gap-1 text-[11px]">
              <Paperclip aria-hidden="true" className="size-3" />
              {isArabic ? 'يحتوي على مرفق' : 'Includes an attachment'}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground mt-1.5 flex items-center justify-between gap-2 text-[11px]">
          <span>{relativeTime(item.createdAtUtc, locale)}</span>
          {(available || deleted) ? (
            <span className="text-primary font-medium">{isArabic ? 'عرض الرسالة' : 'View message'}</span>
          ) : null}
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









