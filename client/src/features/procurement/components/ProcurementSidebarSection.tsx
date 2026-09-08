import {
  Building2,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  FileText,
  Loader2,
  PackageSearch,
  RefreshCw,
  ShoppingBasket,
  Tags,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'

import { taskHubEase } from '@/components/shared/TaskHubMotion'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { cn } from '@/lib/cn'

import type { ProcurementSyncStep } from '../api/procurement.api'
import {
  useProcurementSyncStatus,
  useRequestProcurementSync,
} from '../hooks/use-procurement-sync-status'

const procurementLinks = [
  { to: '/contracts', labelKey: 'procurement.navigation.contracts', icon: FileText, end: true, enabled: true },
  { to: '/items', labelKey: 'procurement.navigation.items', icon: PackageSearch, end: false, enabled: true },
  { to: '/suppliers', labelKey: 'procurement.navigation.suppliers', icon: Building2, end: false, enabled: true },
  { to: '/price-quotes', labelKey: 'procurement.navigation.priceQuotes', icon: Tags, end: false, enabled: true },
] as const

function formatRelativeSyncTime(value: string, language: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value

  const elapsedMs = Math.max(0, Date.now() - timestamp)
  const elapsedMinutes = Math.floor(elapsedMs / 60_000)
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })

  if (elapsedMinutes < 60) {
    return formatter.format(-elapsedMinutes, 'minute')
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return formatter.format(-elapsedHours, 'hour')
  }

  return formatter.format(-Math.floor(elapsedHours / 24), 'day')
}

function stepTranslationKey(step: ProcurementSyncStep): string {
  return `procurement.syncStatus.steps.${step}`
}

export function ProcurementSidebarSection({
  collapsed,
  expanded,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean
  expanded: boolean
  onToggle: () => void
  onNavigate?: (() => void) | undefined
}) {
  const { i18n, t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const currentUser = useCurrentUser()
  const syncStatus = useProcurementSyncStatus()
  const requestSync = useRequestProcurementSync()
  const canRefresh = currentUser.data?.access.roleCode === 'ADMIN'

  const lastSuccessfulRelative = syncStatus.data?.lastSuccessfulAtUtc
    ? formatRelativeSyncTime(syncStatus.data.lastSuccessfulAtUtc, i18n.language)
    : null

  let statusText = t('procurement.syncStatus.loading')
  let statusTone = 'text-sidebar-muted'
  let StatusIcon = Loader2
  let statusIconClassName = 'animate-spin'

  if (syncStatus.isError) {
    statusText = t('procurement.syncStatus.unavailable')
    statusTone = 'text-warning'
    StatusIcon = CircleAlert
    statusIconClassName = ''
  } else if (syncStatus.data) {
    if (!syncStatus.data.enabled) {
      statusText = t('procurement.syncStatus.disabled')
      StatusIcon = CircleAlert
      statusIconClassName = ''
    } else if (syncStatus.data.isRunning) {
      statusText = lastSuccessfulRelative
        ? t('procurement.syncStatus.updatingWithLastSuccess', { time: lastSuccessfulRelative })
        : t('procurement.syncStatus.updating')
      StatusIcon = Loader2
      statusIconClassName = 'animate-spin'
    } else if (syncStatus.data.lastAttempt?.status === 'FAILED') {
      statusText = lastSuccessfulRelative
        ? t('procurement.syncStatus.failedUsingPrevious', { time: lastSuccessfulRelative })
        : t('procurement.syncStatus.failedNoPrevious')
      statusTone = 'text-warning'
      StatusIcon = CircleAlert
      statusIconClassName = ''
    } else if (lastSuccessfulRelative) {
      statusText = t('procurement.syncStatus.lastSuccessful', { time: lastSuccessfulRelative })
      statusTone = 'text-success'
      StatusIcon = CircleCheck
      statusIconClassName = ''
    } else {
      statusText = t('procurement.syncStatus.never')
      StatusIcon = CircleAlert
      statusIconClassName = ''
    }
  }

  const failedStep = syncStatus.data?.lastAttempt?.status === 'FAILED'
    ? syncStatus.data.lastAttempt.failedStep
    : null
  const statusTitle = failedStep
    ? t('procurement.syncStatus.failedStep', {
        step: t(stepTranslationKey(failedStep)),
      })
    : statusText

  async function refreshNow() {
    try {
      const result = await requestSync.mutateAsync()
      if (result.accepted) {
        toast.success(t('procurement.syncStatus.refreshRequested'))
        return
      }

      if (result.reason === 'ALREADY_RUNNING') {
        toast(t('procurement.syncStatus.alreadyRunning'))
        return
      }

      toast.error(t('procurement.syncStatus.disabled'))
    } catch {
      toast.error(t('procurement.syncStatus.refreshFailed'))
    }
  }

  const header = (
    <button
      type="button"
      aria-expanded={!collapsed && expanded}
      aria-label={t('procurement.navigation.section')}
      className={cn(
        'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-accent-foreground flex h-11 w-full items-center rounded-xl text-sm font-medium',
        collapsed ? 'justify-center' : 'gap-3 px-3',
      )}
      onClick={onToggle}
    >
      <ShoppingBasket aria-hidden="true" className="size-5 shrink-0" />
      <span className={cn('flex-1 text-start', collapsed && 'hidden')}>{t('procurement.navigation.section')}</span>
      {!collapsed ? (
        <motion.span className="grid place-items-center" animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: taskHubEase }}>
          <ChevronDown aria-hidden="true" className="size-4" />
        </motion.span>
      ) : null}
    </button>
  )

  return (
    <div className="mt-1">
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{header}</TooltipTrigger>
          <TooltipContent side={i18n.dir() === 'rtl' ? 'left' : 'right'}>
            <div className="space-y-1">
              <p>{t('procurement.navigation.section')}</p>
              <p className="text-xs opacity-80">{statusText}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      ) : header}

      <AnimatePresence initial={false}>
        {!collapsed && expanded ? (
          <motion.div
            key="procurement-sidebar-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: taskHubEase }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-1 ps-3 pe-1">
              <div
                className="flex min-h-9 items-center gap-2 rounded-lg px-2"
                title={statusTitle}
              >
                <StatusIcon
                  aria-hidden="true"
                  className={cn('size-3.5 shrink-0', statusTone, statusIconClassName)}
                />
                <span className={cn('min-w-0 flex-1 truncate text-[11px]', statusTone)}>
                  {statusText}
                </span>
                {canRefresh ? (
                  <button
                    type="button"
                    className="text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-sidebar-ring grid size-7 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label={t('procurement.syncStatus.refreshNow')}
                    title={t('procurement.syncStatus.refreshNow')}
                    disabled={
                      requestSync.isPending ||
                      syncStatus.data?.isRunning === true ||
                      syncStatus.data?.enabled === false
                    }
                    onClick={() => void refreshNow()}
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={cn('size-3.5', requestSync.isPending && 'animate-spin')}
                    />
                  </button>
                ) : null}
              </div>

              {procurementLinks.map((item) => {
                const Icon = item.icon
                if (!item.enabled) {
                  return (
                    <div key={item.labelKey} aria-disabled="true" className="text-sidebar-muted/55 flex h-9 cursor-not-allowed items-center gap-2 rounded-lg px-2 text-sm">
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="flex-1">{t(item.labelKey)}</span>
                      <span className="text-[10px] font-medium uppercase">{t('procurement.navigation.comingSoon')}</span>
                    </div>
                  )
                }

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) => cn('flex h-9 items-center gap-2 rounded-lg px-2 text-sm', isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground')}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span>{t(item.labelKey)}</span>
                  </NavLink>
                )
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
