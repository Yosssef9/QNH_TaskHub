import { ChevronDown, ListChecks, Loader2, Plus, RefreshCw, Repeat2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useLocation } from 'react-router'

import { OverflowTooltipText } from '@/components/shared/OverflowTooltipText'
import { taskHubEase, taskHubItemMotion } from '@/components/shared/TaskHubMotion'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { appIcons } from '@/config/app-icons'
import { kpiIcons } from '@/features/kpis/components/kpi-icons'
import { cn } from '@/lib/cn'

import { useWorkCycles } from '../hooks/use-work-cycles'

function activeCycleId(pathname: string): number | null {
  const match = pathname.match(/^\/work-cycles\/(\d+)/)
  return match ? Number(match[1]) : null
}

export function WorkCyclesSidebarSection({
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
  const location = useLocation()
  const query = useWorkCycles()
  const activeId = activeCycleId(location.pathname)
  const [expandedCycleId, setExpandedCycleId] = useState<number | null>(activeId)

  useEffect(() => {
    if (activeId !== null) setExpandedCycleId(activeId)
  }, [activeId])

  const header = (
    <button
      type="button"
      aria-expanded={!collapsed && expanded}
      aria-label={t('workCycles.sectionTitle')}
      className={cn(
        'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-accent-foreground flex h-11 w-full items-center rounded-xl text-sm font-medium',
        collapsed ? 'justify-center' : 'gap-3 px-3',
      )}
      onClick={onToggle}
    >
      <Repeat2 className="size-5 shrink-0" />
      <span className={cn('flex-1 text-start', collapsed && 'hidden')}>
        {t('workCycles.sectionTitle')}
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
            {t('workCycles.sectionTitle')}
          </TooltipContent>
        </Tooltip>
      ) : (
        header
      )}

      <AnimatePresence initial={false}>
        {!collapsed && expanded ? (
          <motion.div
            key="work-cycles-sidebar-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: taskHubEase }}
            className="overflow-hidden"
          >
            <div className="sidebar-nested-scroll mt-1 max-h-80 space-y-1 overflow-y-auto ps-3 pe-1">
              <NavLink
                to="/kpi-tasks"
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
                  )
                }
              >
                <ListChecks className="size-4 shrink-0" />
                <span>{t('workCycles.allKpiTasks')}</span>
              </NavLink>

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
                {(query.data ?? []).map((cycle) => {
                  const CycleIcon = appIcons[cycle.iconKey]
                  const cycleExpanded = expandedCycleId === cycle.id
                  return (
                    <motion.div
                      key={cycle.id}
                      layout="position"
                      initial={taskHubItemMotion.initial}
                      animate={taskHubItemMotion.animate}
                      exit={taskHubItemMotion.exit}
                      transition={taskHubItemMotion.transition}
                      className="rounded-lg"
                    >
                      <div className="flex items-center gap-1">
                        <NavLink
                          to={`/work-cycles/${cycle.id}`}
                          onClick={onNavigate}
                          className={({ isActive }) =>
                            cn(
                              'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-sm',
                              isActive
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
                            )
                          }
                        >
                          <CycleIcon className="size-4 shrink-0" style={{ color: cycle.color }} />
                          <OverflowTooltipText
                            side={i18n.dir() === 'rtl' ? 'left' : 'right'}
                            className="flex-1"
                          >
                            {cycle.title}
                          </OverflowTooltipText>
                        </NavLink>
                        <button
                          type="button"
                          aria-label={t(cycleExpanded ? 'workCycles.collapseCycle' : 'workCycles.expandCycle', {
                            name: cycle.title,
                          })}
                          aria-expanded={cycleExpanded}
                          className="text-sidebar-muted hover:bg-sidebar-hover grid size-8 shrink-0 place-items-center rounded-md"
                          onClick={() =>
                            setExpandedCycleId((current) => (current === cycle.id ? null : cycle.id))
                          }
                        >
                          <motion.span
                            animate={{ rotate: cycleExpanded ? 180 : 0 }}
                            transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: taskHubEase }}
                          >
                            <ChevronDown className="size-3.5" />
                          </motion.span>
                        </button>
                      </div>

                      <AnimatePresence initial={false}>
                        {cycleExpanded ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: taskHubEase }}
                            className="overflow-hidden ps-5"
                          >
                            {cycle.instances.map((instance) => {
                              const Icon = kpiIcons[instance.iconKey]
                              return (
                                <NavLink
                                  key={instance.id}
                                  to={`/work-cycles/${cycle.id}/kpis/${instance.id}`}
                                  onClick={onNavigate}
                                  className={({ isActive }) =>
                                    cn(
                                      'mt-1 flex h-8 items-center gap-2 rounded-md px-2 text-xs',
                                      isActive
                                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                        : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
                                    )
                                  }
                                >
                                  <Icon className="size-3.5 shrink-0" style={{ color: instance.color }} />
                                  <OverflowTooltipText
                                    side={i18n.dir() === 'rtl' ? 'left' : 'right'}
                                    className="flex-1"
                                  >
                                    {instance.name}
                                  </OverflowTooltipText>
                                </NavLink>
                              )
                            })}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>

            <div className="mt-2 flex gap-1 ps-3">
              <Button
                size="sm"
                variant="ghost"
                className="text-sidebar-muted h-8 flex-1"
                onClick={onCreate}
              >
                <Plus className="size-4" />
                {t('workCycles.create')}
              </Button>
              <Link
                to="/work-cycles"
                onClick={onNavigate}
                className="text-sidebar-muted hover:bg-sidebar-hover flex h-8 items-center rounded-md px-2 text-xs"
              >
                {t('workCycles.viewAll')}
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
