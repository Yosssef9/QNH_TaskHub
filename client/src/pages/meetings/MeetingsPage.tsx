import { CalendarDays, DoorOpen, Plus, ShieldCheck, UsersRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { TextareaField } from '@/components/shared/Input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { CoordinatorMeetingScheduleDialog } from '@/features/meetings/components/CoordinatorMeetingScheduleDialog'
import { MeetingEditorDialog } from '@/features/meetings/components/MeetingEditorDialog'
import { MeetingSummaryCard } from '@/features/meetings/components/MeetingSummaryCard'
import { useActiveMeetingRooms } from '@/features/meetings/hooks/use-meeting-rooms'
import {
  useApproveMeetingRequest,
  useCoordinatorMeetingQueue,
  useMyMeetingRequests,
  useMyMeetings,
  useRejectMeetingRequest,
} from '@/features/meetings/hooks/use-meetings'
import type { MeetingSummary } from '@/features/meetings/types/meeting.types'
import { toApiClientError } from '@/lib/api-error'

function SectionState({
  pending,
  error,
  empty,
  emptyTitle,
  emptyDescription,
  onRetry,
  children,
}: {
  pending: boolean
  error: boolean
  empty: boolean
  emptyTitle: string
  emptyDescription: string
  onRetry: () => void
  children: ReactNode
}) {
  if (pending) return <LoadingState className="min-h-32" />
  if (error) return <ErrorState className="min-h-32" onRetry={onRetry} />
  if (empty) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={emptyTitle}
        description={emptyDescription}
        className="min-h-40"
      />
    )
  }
  return <div className="grid gap-4 xl:grid-cols-2">{children}</div>
}

export function MeetingsPage() {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const rooms = useActiveMeetingRooms()
  const access = currentUser.data?.access
  const canCoordinate = access?.meetingCoordinateEnabled === true
  const canOrganize = access?.meetingOrganizeEnabled === true || canCoordinate

  const myMeetings = useMyMeetings()
  const myRequests = useMyMeetingRequests(canOrganize)
  const coordinatorQueue = useCoordinatorMeetingQueue(canCoordinate)
  const approveRequest = useApproveMeetingRequest()
  const rejectRequest = useRejectMeetingRequest()

  const [createOpen, setCreateOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<MeetingSummary | null>(null)
  const [approvingMeeting, setApprovingMeeting] = useState<MeetingSummary | null>(null)
  const [rejectingMeeting, setRejectingMeeting] = useState<MeetingSummary | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  async function approve() {
    if (!approvingMeeting) return
    try {
      await approveRequest.mutateAsync({
        meetingId: approvingMeeting.id,
        revisionId: approvingMeeting.revisionId,
        revisionRowVersion: approvingMeeting.revisionRowVersion,
      })
      toast.success(t('meetings.requestApproved'))
      setApprovingMeeting(null)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.errors.approve'),
        }),
      )
    }
  }

  async function reject() {
    if (!rejectingMeeting) return
    try {
      await rejectRequest.mutateAsync({
        meetingId: rejectingMeeting.id,
        revisionId: rejectingMeeting.revisionId,
        revisionRowVersion: rejectingMeeting.revisionRowVersion,
        reason: rejectionReason.trim() || null,
      })
      toast.success(t('meetings.requestRejected'))
      setRejectingMeeting(null)
      setRejectionReason('')
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.errors.reject'),
        }),
      )
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('meetings.eyebrow')}
        title={t('meetings.title')}
        description={t('meetings.description')}
        actions={
          canOrganize ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" className="size-4" />
              {t(canCoordinate ? 'meetings.scheduleMeeting' : 'meetings.requestMeeting')}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.38fr)]">
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{t('meetings.myMeetingsTitle')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('meetings.myMeetingsDescription')}
            </p>
          </div>
          <SectionState
            pending={myMeetings.isPending}
            error={myMeetings.isError}
            empty={(myMeetings.data?.length ?? 0) === 0}
            emptyTitle={t('meetings.emptyTitle')}
            emptyDescription={t('meetings.emptyDescription')}
            onRetry={() => void myMeetings.refetch()}
          >
            {(myMeetings.data ?? []).map((meeting) => (
              <MeetingSummaryCard key={meeting.id} meeting={meeting} />
            ))}
          </SectionState>
        </section>

        <Card className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">{t('meetings.accessTitle')}</h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                {t('meetings.accessDescription')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canOrganize ? (
              <Badge variant="secondary">
                <UsersRound aria-hidden="true" className="me-1 size-3.5" />
                {t('meetings.organizer')}
              </Badge>
            ) : null}
            {canCoordinate ? (
              <Badge variant="default">
                <ShieldCheck aria-hidden="true" className="me-1 size-3.5" />
                {t('meetings.coordinator')}
              </Badge>
            ) : null}
            {!canOrganize && !canCoordinate ? (
              <Badge variant="secondary">{t('meetings.participant')}</Badge>
            ) : null}
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2">
              <DoorOpen aria-hidden="true" className="text-muted-foreground size-4" />
              <h3 className="text-sm font-medium">{t('meetings.availableRooms')}</h3>
            </div>

            {rooms.isPending ? (
              <LoadingState className="mt-3 min-h-28" />
            ) : rooms.isError ? (
              <ErrorState className="mt-3" onRetry={() => void rooms.refetch()} />
            ) : rooms.data.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">
                {t('meetings.noActiveRooms')}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {rooms.data.slice(0, 5).map((room) => (
                  <div
                    key={room.id}
                    className="bg-muted/45 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {i18n.language.startsWith('ar') ? room.nameAr : room.nameEn}
                      </p>
                      {room.locationText ? (
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                          {room.locationText}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t('meetings.capacityValue', { count: room.capacity })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {canOrganize ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{t('meetings.myRequestsTitle')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('meetings.myRequestsDescription')}
            </p>
          </div>
          <SectionState
            pending={myRequests.isPending}
            error={myRequests.isError}
            empty={(myRequests.data?.length ?? 0) === 0}
            emptyTitle={t('meetings.noRequestsTitle')}
            emptyDescription={t('meetings.noRequestsDescription')}
            onRetry={() => void myRequests.refetch()}
          >
            {(myRequests.data ?? []).map((meeting) => (
              <MeetingSummaryCard key={meeting.id} meeting={meeting} />
            ))}
          </SectionState>
        </section>
      ) : null}

      {canCoordinate ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{t('meetings.coordinationQueueTitle')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('meetings.coordinationQueueDescription')}
            </p>
          </div>
          <SectionState
            pending={coordinatorQueue.isPending}
            error={coordinatorQueue.isError}
            empty={(coordinatorQueue.data?.length ?? 0) === 0}
            emptyTitle={t('meetings.queueEmptyTitle')}
            emptyDescription={t('meetings.queueEmptyDescription')}
            onRetry={() => void coordinatorQueue.refetch()}
          >
            {(coordinatorQueue.data ?? []).map((meeting) => (
              <MeetingSummaryCard
                key={meeting.id}
                meeting={meeting}
                coordinatorActions
                approving={approveRequest.isPending && approvingMeeting?.id === meeting.id}
                rejecting={rejectRequest.isPending && rejectingMeeting?.id === meeting.id}
                onEditSchedule={() => setEditingSchedule(meeting)}
                onApprove={() => setApprovingMeeting(meeting)}
                onReject={() => {
                  setRejectingMeeting(meeting)
                  setRejectionReason('')
                }}
              />
            ))}
          </SectionState>
        </section>
      ) : null}

      {createOpen ? (
        <MeetingEditorDialog
          open
          mode={canCoordinate ? 'DIRECT' : 'REQUEST'}
          onOpenChange={setCreateOpen}
        />
      ) : null}

      {editingSchedule ? (
        <CoordinatorMeetingScheduleDialog
          key={`${editingSchedule.id}-${editingSchedule.revisionRowVersion}`}
          meeting={editingSchedule}
          open
          onOpenChange={(open) => {
            if (!open) setEditingSchedule(null)
          }}
        />
      ) : null}

      <ConfirmModal
        open={approvingMeeting !== null}
        title={t('meetings.approveTitle')}
        message={t('meetings.approveDescription', { title: approvingMeeting?.title ?? '' })}
        confirmText={t('meetings.approve')}
        cancelText={t('common.cancel')}
        loading={approveRequest.isPending}
        onConfirm={() => void approve()}
        onCancel={() => setApprovingMeeting(null)}
      />

      <ConfirmModal
        open={rejectingMeeting !== null}
        title={t('meetings.rejectTitle')}
        message={t('meetings.rejectDescription', { title: rejectingMeeting?.title ?? '' })}
        confirmText={t('meetings.reject')}
        cancelText={t('common.cancel')}
        danger
        loading={rejectRequest.isPending}
        onConfirm={() => void reject()}
        onCancel={() => {
          setRejectingMeeting(null)
          setRejectionReason('')
        }}
      >
        <TextareaField
          label={t('meetings.rejectionReason')}
          value={rejectionReason}
          maxLength={1000}
          onChange={(event) => setRejectionReason(event.target.value)}
        />
      </ConfirmModal>
    </div>
  )
}
