import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router'

import { ReturnToPortalButton } from '@/components/shared/ReturnToPortalButton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { navigationItems } from '@/config/navigation'
import { cn } from '@/lib/cn'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { ContractsSidebarSection } from '@/features/contracts/components/ContractsSidebarSection'
import { ListsSidebarSection } from '@/features/lists/components/ListsSidebarSection'
import { KpiEditorDialog } from '@/features/kpis/components/KpiEditorDialog'
import { KpisSidebarSection } from '@/features/kpis/components/KpisSidebarSection'
import { MeetingsSidebarSection } from '@/features/meetings/components/MeetingsSidebarSection'
import { useKpis } from '@/features/kpis/hooks/use-kpis'
import { WorkCycleEditorDialog } from '@/features/work-cycles/components/WorkCycleEditorDialog'
import { WorkCyclesSidebarSection } from '@/features/work-cycles/components/WorkCyclesSidebarSection'

const appBaseUrl = import.meta.env.BASE_URL

interface AppSidebarProps {
  collapsed?: boolean
  onNavigate?: () => void
}

export function AppSidebar({ collapsed = false, onNavigate }: AppSidebarProps) {
  const { i18n, t } = useTranslation()
  const isRtl = i18n.dir() === 'rtl'
  const { data } = useCurrentUser()
  const location = useLocation()
  const [openSection, setOpenSection] = useState<
    'lists' | 'meetings' | 'workCycles' | 'kpis' | 'contracts' | null
  >(() =>
    location.pathname.startsWith('/meetings')
      ? 'meetings'
      : location.pathname.startsWith('/contracts')
        ? 'contracts'
        : location.pathname.startsWith('/work-cycles') ||
            location.pathname.startsWith('/kpi-tasks')
          ? 'workCycles'
          : location.pathname.startsWith('/kpis')
            ? 'kpis'
            : 'lists',
  )
  const [createKpiOpen, setCreateKpiOpen] = useState(false)
  const [createCycleOpen, setCreateCycleOpen] = useState(false)
  const kpisQuery = useKpis()

  useEffect(() => {
    if (location.pathname.startsWith('/meetings')) {
      setOpenSection('meetings')
    } else if (location.pathname.startsWith('/contracts')) {
      setOpenSection('contracts')
    } else if (
      location.pathname.startsWith('/work-cycles') ||
      location.pathname.startsWith('/kpi-tasks')
    ) {
      setOpenSection('workCycles')
    } else if (location.pathname.startsWith('/kpis')) {
      setOpenSection('kpis')
    }
  }, [location.pathname])

  const visibleItems = navigationItems.filter(
    (item) => !item.requiredRole || item.requiredRole === data?.access.roleCode,
  )

  return (
    <div className="border-sidebar-border bg-sidebar text-sidebar-foreground flex h-full flex-col border-e shadow-[0_0_24px_rgb(15_23_42/0.05)] dark:shadow-[4px_0_24px_-18px_rgb(0_0_0/0.65)] dark:rtl:shadow-[-4px_0_24px_-18px_rgb(0_0_0/0.65)]">
      {/* Brand */}
      <div className="border-sidebar-border relative flex h-[104px] shrink-0 items-center justify-center overflow-hidden border-b px-3">
        <div
          aria-hidden={!collapsed}
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200 ease-out',
            collapsed ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0',
          )}
        >
          <img src={`${appBaseUrl}images/logo.png`} alt="" className="size-12 object-contain" />
        </div>

        <div
          aria-hidden={collapsed}
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center px-4 text-center transition-[opacity,transform] duration-200 ease-out',
            collapsed ? 'pointer-events-none translate-y-1 opacity-0' : 'translate-y-0 opacity-100',
          )}
        >
          <img
            src={`${appBaseUrl}images/fullLogo.png`}
            alt=""
            className="h-auto max-h-[46px] w-full max-w-[220px] object-contain"
          />

          <div className="mt-2 flex flex-col items-center gap-0.5 text-center">
            <span dir="rtl" className="text-sidebar-foreground text-sm leading-5 font-semibold">
              {t('common.brandArabicName')}
            </span>

            <span
              dir="ltr"
              className="text-sidebar-muted text-[11px] leading-4 font-medium tracking-[0.08em]"
            >
              {t('common.brandEnglishName')}
            </span>
          </div>
        </div>

        <span className="sr-only">{t('common.appName')}</span>
      </div>

      {/* Main navigation */}
      <nav
        aria-label={t('navigation.main')}
        className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto p-3"
      >
        {visibleItems.map((item) => {
          const Icon = item.icon
          const label = t(item.labelKey)

          const link = (
            <NavLink
              to={item.to}
              end={item.end}
              {...(collapsed ? { 'aria-label': label } : {})}
              {...(collapsed
                ? {
                    style: {
                      background: 'transparent',
                      backgroundColor: 'transparent',
                      boxShadow: 'none',
                      border: 'none',
                      borderRadius: 0,
                      outline: 'none',
                      filter: 'none',
                    },
                  }
                : {})}
              className={({ isActive, isPending }) =>
                cn(
                  'flex h-11 w-full items-center overflow-hidden text-sm font-medium transition-colors duration-150',

                  collapsed
                    ? 'justify-center gap-0 p-0'
                    : 'focus-visible:ring-sidebar-ring gap-3 rounded-xl px-3 outline-none focus-visible:ring-2',

                  collapsed
                    ? isActive || isPending
                      ? 'text-sidebar-accent-foreground'
                      : 'text-sidebar-muted hover:text-sidebar-accent-foreground'
                    : isActive || isPending
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm shadow-blue-900/5'
                      : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-accent-foreground',
                )
              }
              {...(onNavigate ? { onClick: onNavigate } : {})}
            >
              {({ isPending }) => (
                <>
                  {isPending ? (
                    <Loader2
                      aria-hidden="true"
                      className={cn('size-5 shrink-0 animate-spin', collapsed && 'mx-auto')}
                    />
                  ) : (
                    <Icon
                      aria-hidden="true"
                      className={cn('size-5 shrink-0', collapsed && 'mx-auto')}
                      strokeWidth={2}
                    />
                  )}

                  <span
                    aria-hidden={collapsed}
                    className={cn(
                      'whitespace-nowrap',
                      collapsed ? 'hidden' : 'max-w-48 opacity-100',
                    )}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          )

          return collapsed ? (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>

              <TooltipContent side={isRtl ? 'left' : 'right'}>{label}</TooltipContent>
            </Tooltip>
          ) : (
            <div key={item.to}>{link}</div>
          )
        })}

        <ListsSidebarSection
          collapsed={collapsed}
          expanded={openSection === 'lists'}
          onToggle={() => setOpenSection((current) => (current === 'lists' ? null : 'lists'))}
          onNavigate={onNavigate}
        />
        <MeetingsSidebarSection
          collapsed={collapsed}
          expanded={openSection === 'meetings'}
          organizerEnabled={data?.access.meetingOrganizeEnabled === true}
          coordinatorEnabled={data?.access.meetingCoordinateEnabled === true}
          onToggle={() =>
            setOpenSection((current) => (current === 'meetings' ? null : 'meetings'))
          }
          onNavigate={onNavigate}
        />
        <WorkCyclesSidebarSection
          collapsed={collapsed}
          expanded={openSection === 'workCycles'}
          onToggle={() =>
            setOpenSection((current) => (current === 'workCycles' ? null : 'workCycles'))
          }
          onCreate={() => setCreateCycleOpen(true)}
          onNavigate={onNavigate}
        />
        <KpisSidebarSection
          collapsed={collapsed}
          expanded={openSection === 'kpis'}
          onToggle={() => setOpenSection((current) => (current === 'kpis' ? null : 'kpis'))}
          onCreate={() => setCreateKpiOpen(true)}
          onNavigate={onNavigate}
        />
        {data?.access.contractsEnabled ? (
          <ContractsSidebarSection
            collapsed={collapsed}
            expanded={openSection === 'contracts'}
            onToggle={() =>
              setOpenSection((current) => (current === 'contracts' ? null : 'contracts'))
            }
            onNavigate={onNavigate}
          />
        ) : null}
      </nav>

      <div className="border-sidebar-border shrink-0 border-t p-3">
        <ReturnToPortalButton collapsed={collapsed} />
      </div>
      {createCycleOpen && kpisQuery.data ? (
        <WorkCycleEditorDialog
          open
          onOpenChange={setCreateCycleOpen}
          kpis={kpisQuery.data}
        />
      ) : null}
      {createKpiOpen ? <KpiEditorDialog open onOpenChange={setCreateKpiOpen} /> : null}
    </div>
  )
}
