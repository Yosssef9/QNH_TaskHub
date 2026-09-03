import { CalendarPlus2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { MeetingEditorDialog } from '@/features/meetings/components/MeetingEditorDialog'
import { MyMeetingsDashboard } from '@/features/meetings/components/MyMeetingsDashboard'
import { useMyMeetings } from '@/features/meetings/hooks/use-meetings'

export function MeetingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentUser = useCurrentUser()
  const myMeetings = useMyMeetings()
  const [createOpen, setCreateOpen] = useState(false)

  const canCoordinate = currentUser.data?.access.meetingCoordinateEnabled === true
  const canOrganize = currentUser.data?.access.meetingOrganizeEnabled === true || canCoordinate
  const currentUserId = currentUser.data?.user.userId ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('meetings.eyebrow')}
        title={t('meetings.myMeetingsTitle')}
        description={t('meetings.myMeetingsDescription')}
        actions={
          canOrganize ? (
            <Button onClick={() => setCreateOpen(true)}>
              <CalendarPlus2 aria-hidden="true" className="size-4" />
              {t('meetings.createMeeting')}
            </Button>
          ) : undefined
        }
      />

      {myMeetings.isPending || currentUser.isPending ? (
        <LoadingState className="min-h-56" />
      ) : myMeetings.isError || currentUser.isError ? (
        <ErrorState
          className="min-h-56"
          onRetry={() => {
            if (myMeetings.isError) void myMeetings.refetch()
            if (currentUser.isError) void currentUser.refetch()
          }}
        />
      ) : currentUserId === null ? (
        <ErrorState className="min-h-56" />
      ) : (myMeetings.data?.length ?? 0) === 0 ? (
        <EmptyState
          title={t('meetings.emptyTitle')}
          description={t('meetings.emptyDescription')}
          className="min-h-56"
        />
      ) : (
        <MyMeetingsDashboard
          meetings={myMeetings.data ?? []}
          currentUserId={currentUserId}
          onOpenMeeting={(meetingId) => navigate(`/meetings/${meetingId}`)}
        />
      )}

      {createOpen ? (
        <MeetingEditorDialog
          open
          mode={canCoordinate ? 'DIRECT' : 'REQUEST'}
          onOpenChange={(open) => setCreateOpen(open)}
        />
      ) : null}
    </div>
  )
}
