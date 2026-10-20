import { ArrowLeft, ArrowRight, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { WorkInboxPanel } from '@/features/dashboard/components/WorkInboxPanel'

export function WorkInboxPage() {
  const {t,i18n} = useTranslation()
  const Arrow = i18n.dir()==='rtl' ? ArrowLeft : ArrowRight
  return <div className="mx-auto w-full max-w-[1500px] space-y-4 pb-8">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h1 className="flex items-center gap-2 text-xl font-bold"><Inbox className="text-primary size-5"/>{t('workDashboard.inbox')}</h1><p className="text-muted-foreground mt-1 text-sm">{t('workDashboard.inboxDescription')}</p></div>
      <Link to="/" className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"><Arrow className="size-4"/>{t('workDashboard.backToDashboard')}</Link>
    </div>
    <WorkInboxPanel mode="full"/>
  </div>
}
