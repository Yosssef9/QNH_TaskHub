import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { PageHeader } from '@/components/shared/PageHeader'
import { MeetingCollectionState } from '@/features/meetings/components/MeetingCollectionState'
import { MeetingSummaryCard } from '@/features/meetings/components/MeetingSummaryCard'
import { useMyMeetingRequests } from '@/features/meetings/hooks/use-meetings'

export function MeetingRequestsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const requests = useMyMeetingRequests(true)

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('meetings.eyebrow')}
        title={t('meetings.myRequestsTitle')}
        description={t('meetings.myRequestsDescription')}
      />

      <MeetingCollectionState
        pending={requests.isPending}
        error={requests.isError}
        empty={(requests.data?.length ?? 0) === 0}
        emptyTitle={t('meetings.noRequestsTitle')}
        emptyDescription={t('meetings.noRequestsDescription')}
        onRetry={() => void requests.refetch()}
      >
        {(requests.data ?? []).map((meeting) => (
          <MeetingSummaryCard
            key={meeting.id}
            meeting={meeting}
            onOpen={() => navigate(`/meetings/${meeting.id}`)}
          />
        ))}
      </MeetingCollectionState>
    </div>
  )
}
