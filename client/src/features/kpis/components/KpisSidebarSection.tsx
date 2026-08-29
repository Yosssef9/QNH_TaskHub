import { ChevronDown, Gauge, Loader2, Plus, RefreshCw } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { OverflowTooltipText } from '@/components/shared/OverflowTooltipText'
import { taskHubEase, taskHubItemMotion } from '@/components/shared/TaskHubMotion'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { useKpis } from '../hooks/use-kpis'
import { kpiIcons } from './kpi-icons'
export function KpisSidebarSection({
  collapsed,
  expanded,
  onToggle,
  onCreate,
  onNavigate,
}: {
  collapsed: boolean
  expanded: boolean
  onToggle: () => void
  onCreate: () => void
  onNavigate?: (() => void) | undefined
}) {
  const { i18n, t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const query = useKpis()
  const header = (
    <button
      type="button"
      aria-expanded={!collapsed && expanded}
      aria-label={t('kpis.sectionTitle')}
      className={cn(
        'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-accent-foreground flex h-11 w-full items-center rounded-xl text-sm font-medium',
        collapsed ? 'justify-center' : 'gap-3 px-3',
      )}
      onClick={onToggle}
    >
      <Gauge className="size-5 shrink-0" />
      <span className={cn('flex-1 text-start', collapsed && 'hidden')}>
        {t('kpis.sectionTitle')}
      </span>
      {!collapsed ? (
        <motion.span
          className="grid place-items-center"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: taskHubEase }}
        >
          <ChevronDown className="size-4" />
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
            {t('kpis.sectionTitle')}
          </TooltipContent>
        </Tooltip>
      ) : (
        header
      )}
      <AnimatePresence initial={false}>
        {!collapsed && expanded ? (
          <motion.div
            key="kpis-sidebar-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: taskHubEase }}
            className="overflow-hidden"
          >
            <div className="sidebar-nested-scroll mt-1 max-h-56 space-y-1 overflow-y-auto ps-3 pe-1">
              {query.isPending ? (
                <Loader2 className="text-sidebar-muted mx-auto my-3 size-4 animate-spin" />
              ) : null}
              {query.isError ? (
                <button
                  className="text-sidebar-muted flex h-9 w-full items-center justify-center gap-2 text-xs"
                  onClick={() => void query.refetch()}
                >
                  <RefreshCw className="size-4" />
                  {t('common.retry')}
                </button>
              ) : null}
              <AnimatePresence initial={false} mode="popLayout">
                {(query.data ?? []).map((kpi) => {
                  const Icon = kpiIcons[kpi.iconKey]
                  return (
                    <motion.div
                      key={kpi.id}
                      layout="position"
                      initial={taskHubItemMotion.initial}
                      animate={taskHubItemMotion.animate}
                      exit={taskHubItemMotion.exit}
                      transition={taskHubItemMotion.transition}
                    >
                      <NavLink
                        to={`/kpis/${kpi.id}`}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          cn(
                            'flex h-9 items-center gap-2 rounded-lg px-2 text-sm',
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
                            !kpi.isActive && 'opacity-55',
                          )
                        }
                      >
                        <Icon className="size-4 shrink-0" style={{ color: kpi.color }} />
                        <OverflowTooltipText
                          side={i18n.dir() === 'rtl' ? 'left' : 'right'}
                          className="flex-1"
                        >
                          {kpi.name}
                        </OverflowTooltipText>
                      </NavLink>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
            <div className="mt-2 flex gap-1 ps-3">
              <button
                type="button"
                className="text-sidebar-muted hover:bg-sidebar-hover flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-xs"
                onClick={onCreate}
              >
                <Plus className="size-4" />
                {t('kpis.create')}
              </button>
              <Link
                to="/kpis"
                onClick={onNavigate}
                className="text-sidebar-muted hover:bg-sidebar-hover flex h-8 items-center rounded-md px-2 text-xs"
              >
                {t('kpis.viewAll')}
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
