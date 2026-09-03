import {
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  Handshake,
  LayoutTemplate,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'

import { taskHubEase } from '@/components/shared/TaskHubMotion'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

import { MeetingEditorDialog } from './MeetingEditorDialog'

interface MeetingsSidebarSectionProps {
  collapsed: boolean
  expanded: boolean
  organizerEnabled: boolean
  coordinatorEnabled: boolean
  onToggle: () => void
  onNavigate?: (() => void) | undefined
}

export function MeetingsSidebarSection({
  collapsed,
  expanded,
  organizerEnabled,
  coordinatorEnabled,
  onToggle,
  onNavigate,
}: MeetingsSidebarSectionProps) {
  const { i18n, t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const [createOpen, setCreateOpen] = useState(false)
  const canCreate = organizerEnabled || coordinatorEnabled

  const items = [
    {
      to: '/meetings',
      label: t('meetings.myMeetingsTitle'),
      icon: CalendarDays,
      visible: true,
      end: true,
    },
    {
      to: '/meetings/requests',
      label: t('meetings.myRequestsTitle'),
      icon: ClipboardList,
      visible: organizerEnabled,
      end: true,
    },
    {
      to: '/meetings/coordination',
      label: t('meetings.coordinationQueueTitle'),
      icon: ShieldCheck,
      visible: coordinatorEnabled,
      end: true,
    },
    {
      to: '/meetings/schedule',
      label: t('meetings.schedulePage.title'),
      icon: CalendarRange,
      visible: canCreate,
      end: true,
    },
    {
      to: '/meetings/templates',
      label: t('meetings.sidebar.templates'),
      icon: LayoutTemplate,
      visible: canCreate,
      end: true,
    },
  ].filter((item) => item.visible)

  const header = (
    <button
      type="button"
      aria-expanded={!collapsed && expanded}
      aria-label={t('navigation.meetings')}
      className={cn(
        'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-accent-foreground flex h-11 w-full items-center rounded-xl text-sm font-medium',
        collapsed ? 'justify-center' : 'gap-3 px-3',
      )}
      onClick={onToggle}
    >
      <Handshake aria-hidden="true" className="size-5 shrink-0" />
      <span className={cn('flex-1 text-start', collapsed && 'hidden')}>
        {t('navigation.meetings')}
      </span>
      {!collapsed ? (
        <motion.span
          className="grid place-items-center"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: taskHubEase }}
        >
          <ChevronDown aria-hidden="true" className="size-4" />
        </motion.span>
      ) : null}
    </button>
  )

  return (
    <>
      <div className="mt-1">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{header}</TooltipTrigger>
            <TooltipContent side={i18n.dir() === 'rtl' ? 'left' : 'right'}>
              {t('navigation.meetings')}
            </TooltipContent>
          </Tooltip>
        ) : (
          header
        )}

        <AnimatePresence initial={false}>
          {!collapsed && expanded ? (
            <motion.div
              key="meetings-sidebar-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: taskHubEase }}
              className="overflow-hidden"
            >
              <div className="sidebar-nested-scroll mt-1 space-y-1 ps-3 pe-1">
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
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
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-start">{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>

              {canCreate ? (
                <div className="mt-2 ps-3">
                  <button
                    type="button"
                    className="text-sidebar-muted hover:bg-sidebar-hover flex h-8 w-full items-center justify-center gap-1 rounded-md text-xs"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    {t('meetings.createMeeting')}
                  </button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {createOpen ? (
        <MeetingEditorDialog
          open
          mode={coordinatorEnabled ? 'DIRECT' : 'REQUEST'}
          onOpenChange={setCreateOpen}
        />
      ) : null}
    </>
  )
}
