import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/shared/PageHeader'
import { MeetingSeriesComposer } from '@/features/meetings/series/MeetingSeriesComposer'

export function MeetingSeriesCreatePage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('meetings.eyebrow')}
        title={t('meetings.series.createPage.title')}
        description={t('meetings.series.createPage.description')}
      />
      <MeetingSeriesComposer />
    </div>
  )
}
