import { ChevronDown, FolderOpen, Loader2, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { OverflowTooltipText } from '@/components/shared/OverflowTooltipText'
import { taskHubEase, taskHubItemMotion } from '@/components/shared/TaskHubMotion'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { useLists } from '../hooks/use-lists'
import { listIcons } from './list-icons'
const ListEditorDialog = lazy(() =>
  import('./ListEditorDialog').then((module) => ({ default: module.ListEditorDialog })),
)
const ListsManagerDialog = lazy(() =>
  import('./ListsManagerDialog').then((module) => ({ default: module.ListsManagerDialog })),
)
export function ListsSidebarSection({
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
  const [createOpen, setCreateOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const query = useLists()
  const header = (
    <button
      type="button"
      aria-expanded={!collapsed && expanded}
      aria-label={t('lists.sectionTitle')}
      className={cn(
        'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-accent-foreground flex h-11 w-full items-center rounded-xl text-sm font-medium',
        collapsed ? 'justify-center' : 'gap-3 px-3',
      )}
      onClick={onToggle}
    >
      <FolderOpen className="size-5 shrink-0" />
      <span className={cn('flex-1 text-start', collapsed && 'hidden')}>
        {t('lists.sectionTitle')}
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
    <>
      <div className="border-sidebar-border mt-3 border-t pt-3">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{header}</TooltipTrigger>
            <TooltipContent side={i18n.dir() === 'rtl' ? 'left' : 'right'}>
              {t('lists.sectionTitle')}
            </TooltipContent>
          </Tooltip>
        ) : (
          header
        )}
        <AnimatePresence initial={false}>
          {!collapsed && expanded ? (
            <motion.div
              key="lists-sidebar-content"
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
                  {(query.data ?? []).map((list) => {
                    const Icon = listIcons[list.iconKey]
                    const label = list.isDefault ? t('lists.myTasks') : list.name
                    return (
                      <motion.div
                        key={list.id}
                        layout="position"
                        initial={taskHubItemMotion.initial}
                        animate={taskHubItemMotion.animate}
                        exit={taskHubItemMotion.exit}
                        transition={taskHubItemMotion.transition}
                      >
                        <NavLink
                          to={`/lists/${list.id}`}
                          onClick={onNavigate}
                          className={({ isActive }) =>
                            cn(
                              'flex h-9 items-center gap-2 rounded-lg px-2 text-sm',
                              isActive
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
                            )
                          }
                        >
                          <Icon className="size-4 shrink-0" style={{ color: list.color }} />
                          <OverflowTooltipText
                            side={i18n.dir() === 'rtl' ? 'left' : 'right'}
                            className="flex-1"
                          >
                            {label}
                          </OverflowTooltipText>
                        </NavLink>
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
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="size-4" />
                  {t('lists.createTitle')}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-sidebar-muted size-8"
                  aria-label={t('lists.manageTitle')}
                  onClick={() => setManageOpen(true)}
                >
                  <Settings2 className="size-4" />
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <Suspense fallback={null}>
        <ListEditorDialog open={createOpen} onOpenChange={setCreateOpen} />
        <ListsManagerDialog
          lists={query.data ?? []}
          open={manageOpen}
          onOpenChange={setManageOpen}
        />
      </Suspense>
    </>
  )
}
