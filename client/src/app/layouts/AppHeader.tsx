import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { UserAccountMenu } from '@/features/auth/components/UserAccountMenu'
import { EmailStatusMenu } from '@/features/email-settings/components/EmailStatusMenu'
import { GlobalSearch } from '@/features/global-search/components/GlobalSearch'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { QuickCreateMenu } from '@/features/quick-create/components/QuickCreateMenu'

interface AppHeaderProps {
  onOpenSidebar: () => void
}

export function AppHeader({ onOpenSidebar }: AppHeaderProps) {
  const { t } = useTranslation()

  return (
    <header className="bg-background/90 sticky top-0 z-30 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-4 backdrop-blur-md sm:gap-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t('navigation.openSidebar')}
          onClick={onOpenSidebar}
        >
          <Menu aria-hidden="true" className="size-5" />
        </Button>
        <p className="hidden max-w-28 truncate text-sm font-semibold sm:block lg:hidden">
          {t('common.appName')}
        </p>
      </div>

      <div className="flex min-w-0 justify-end md:justify-center">
        <GlobalSearch className="md:w-full md:max-w-[36rem]" />
      </div>

      <div className="flex min-w-0 items-center gap-1">
        <QuickCreateMenu />
        <EmailStatusMenu />
        <NotificationBell />
        <UserAccountMenu />
      </div>
    </header>
  )
}
