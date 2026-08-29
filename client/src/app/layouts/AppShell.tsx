import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useNavigation } from 'react-router'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAutoExpandSidebar } from '@/hooks/use-auto-expand-sidebar'
import { cn } from '@/lib/cn'

import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'

export function AppShell() {
  const { t } = useTranslation()
  const desktopSidebar = useAutoExpandSidebar()
  const navigation = useNavigation()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const navigationPending = navigation.state !== 'idle'

  return (
    <div className="bg-background text-foreground flex min-h-screen">
      <div
        className={cn(
          'relative hidden shrink-0 transition-[width] duration-200 ease-out will-change-[width] lg:block',
          desktopSidebar.isExpanded ? 'w-72' : 'w-20',
        )}
      >
        <aside
          aria-label={t('navigation.main')}
          className={cn(
            'fixed inset-y-0 start-0 z-40 overflow-hidden shadow-sm transition-[width] duration-200 ease-out will-change-[width]',
            desktopSidebar.isExpanded ? 'w-72' : 'w-20',
          )}
          onPointerEnter={desktopSidebar.onPointerEnter}
          onPointerLeave={desktopSidebar.onPointerLeave}
        >
          <AppSidebar
            collapsed={!desktopSidebar.isExpanded}
            onNavigate={desktopSidebar.onNavigate}
          />
        </aside>
      </div>

      <Dialog open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <DialogContent closeLabel={t('common.close')} className="p-0 lg:hidden">
          <DialogTitle className="sr-only">{t('navigation.main')}</DialogTitle>
          <DialogDescription className="sr-only">{t('navigation.main')}</DialogDescription>
          <AppSidebar onNavigate={() => setMobileSidebarOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="relative min-w-0 flex-1">
        <AppHeader onOpenSidebar={() => setMobileSidebarOpen(true)} />

        <AnimatePresence>
          {navigationPending ? (
            <motion.div
              key="route-navigation-progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-primary/10"
              role="status"
              aria-label={t('common.loading')}
            >
              <motion.div
                className="bg-primary h-full w-1/3 rounded-full"
                initial={{ x: '-120%' }}
                animate={{ x: '360%' }}
                transition={{
                  duration: 0.95,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main
          aria-busy={navigationPending}
          className="mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
