import { FileText, Mail } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { ContractSettingsPanel } from '@/features/contracts/components/ContractSettingsPanel'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { EmailSettingsPanel } from '@/features/email-settings/components/EmailSettingsPanel'
import { useEmailSettings } from '@/features/email-settings/hooks/use-email-settings'
import { cn } from '@/lib/cn'

type SettingsTab = 'email' | 'contracts'

export function SettingsPage() {
  const { t } = useTranslation()
  const query = useEmailSettings()
  const currentUser = useCurrentUser()
  const contractsEnabled = Boolean(currentUser.data?.access.contractsEnabled)
  const [activeTab, setActiveTab] = useState<SettingsTab>('email')

  useEffect(() => {
    if (!contractsEnabled && activeTab === 'contracts') setActiveTab('email')
  }, [activeTab, contractsEnabled])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('settings.eyebrow')}
        title={t('settings.pageTitle')}
        description={t('settings.pageDescription')}
      />

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
          <main className="min-w-0">
            {activeTab === 'email' ? (
              <EmailSettingsPanel settings={query.data} />
            ) : (
              <ContractSettingsPanel
                emailSystemEnabled={query.data.systemEnabled}
                emailNotificationsEnabled={query.data.notificationsEnabled}
                hasActiveEmail={Boolean(query.data.activeEmail)}
              />
            )}
          </main>

          <aside className="order-first xl:order-last">
            <div className="bg-card sticky top-20 z-20 rounded-xl border p-2 shadow-sm supports-[backdrop-filter]:bg-card/95 supports-[backdrop-filter]:backdrop-blur">
              <nav aria-label={t('settings.navigationLabel')} className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
                <SettingsTabButton
                  active={activeTab === 'email'}
                  icon={Mail}
                  title={t('settings.emailSection')}
                  description={t('settings.emailSectionDescription')}
                  onClick={() => setActiveTab('email')}
                />
                {contractsEnabled ? (
                  <SettingsTabButton
                    active={activeTab === 'contracts'}
                    icon={FileText}
                    title={t('settings.contractsSection')}
                    description={t('settings.contractsSectionDescription')}
                    onClick={() => setActiveTab('contracts')}
                  />
                ) : null}
              </nav>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function SettingsTabButton({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  icon: LucideIcon
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'focus-visible:ring-ring relative flex min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-start outline-none focus-visible:ring-2',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className={cn('mt-0.5 hidden text-xs leading-5 sm:block xl:block', active ? 'text-primary/80' : 'text-muted-foreground')}>
          {description}
        </span>
      </span>
      {active ? <span aria-hidden="true" className="bg-primary absolute inset-y-2 start-0 w-1 rounded-full" /> : null}
    </button>
  )
}
