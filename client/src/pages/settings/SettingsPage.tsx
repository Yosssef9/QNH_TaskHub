import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmailSettingsPanel } from '@/features/email-settings/components/EmailSettingsPanel'
import { useEmailSettings } from '@/features/email-settings/hooks/use-email-settings'

export function SettingsPage() {
  const { t } = useTranslation()
  const query = useEmailSettings()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('emailSettings.eyebrow')}
        title={t('emailSettings.pageTitle')}
        description={t('emailSettings.pageDescription')}
      />

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <EmailSettingsPanel settings={query.data} />
          <aside className="hidden xl:block">
            <div className="bg-card sticky top-24 rounded-xl border p-5 shadow-sm">
              <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                <Mail aria-hidden="true" className="size-5" />
              </span>
              <h2 className="mt-4 font-semibold">{t('emailSettings.help.title')}</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {t('emailSettings.help.description')}
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
