import { Building2, ChevronDown, FileText, PackageSearch, ShoppingBasket, Tags } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'

import { taskHubEase } from '@/components/shared/TaskHubMotion'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

const procurementLinks = [
  { to: '/contracts', labelKey: 'procurement.navigation.contracts', icon: FileText, end: true, enabled: true },
  { to: '/items', labelKey: 'procurement.navigation.items', icon: PackageSearch, end: false, enabled: true },
  { to: '/suppliers', labelKey: 'procurement.navigation.suppliers', icon: Building2, end: false, enabled: true },
  { to: '/price-quotes', labelKey: 'procurement.navigation.priceQuotes', icon: Tags, end: false, enabled: true },
] as const

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
          <TooltipContent side={i18n.dir() === 'rtl' ? 'left' : 'right'}>{t('procurement.navigation.section')}</TooltipContent>
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


