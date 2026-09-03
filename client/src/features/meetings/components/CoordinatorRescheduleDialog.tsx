import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { toApiClientError } from '@/lib/api-error'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import { useAdjustAndApproveMeetingReschedule } from '../hooks/use-meetings'
import type { MeetingRescheduleQueueItem } from '../types/meeting.types'
import { CoordinatorScheduleEditorDialog } from './CoordinatorScheduleEditorDialog'

export function CoordinatorRescheduleDialog({
  item,
  open,
  onOpenChange,
}: {
  item: MeetingRescheduleQueueItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const mutation = useAdjustAndApproveMeetingReschedule()
  const rooms = useActiveMeetingRooms()
  const revision = item.requestedRevision

  async function save(input: {
    roomId: number
    startAtUtc: string
    endAtUtc: string
    schedulingNotes: string | null
  }) {
    try {
      await mutation.mutateAsync({
        meetingId: item.meeting.id,
        revisionId: revision.id,
        revisionRowVersion: revision.rowVersion,
        ...input,
      })
      toast.success(t('meetings.workspace.rescheduleAdjustedAndApproved'))
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.workspace.rescheduleApproveError'),
        }),
      )
    }
  }

  const currentSchedule = {
    label: t('meetings.coordinatorSchedule.currentSchedule'),
    room: item.meeting.room,
    startAtUtc: item.meeting.startAtUtc,
    endAtUtc: item.meeting.endAtUtc,
  }

  const organizerRequest = {
    label: t('meetings.coordinatorSchedule.organizerRequest'),
    room: revision.room,
    startAtUtc: revision.startAtUtc,
    endAtUtc: revision.endAtUtc,
    emphasis: 'requested' as const,
  }

  return (
    <CoordinatorScheduleEditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('meetings.workspace.coordinatorRescheduleTitle')}
      description={t('meetings.coordinatorSchedule.rescheduleDescription')}
      meetingTitle={item.meeting.title}
      participantCount={item.meeting.participantCount}
      rooms={rooms.data ?? []}
      roomsPending={rooms.isPending}
      roomsError={rooms.isError}
      onRetryRooms={() => void rooms.refetch()}
      initialRoomId={revision.room.id}
      initialStartAtUtc={revision.startAtUtc}
      initialEndAtUtc={revision.endAtUtc}
      initialNotes={revision.schedulingNotes}
      referenceSchedules={[currentSchedule, organizerRequest]}
      comparisonBaseline={currentSchedule}
      excludeMeetingId={item.meeting.id}
      savePending={mutation.isPending}
      saveLabel={t('meetings.coordinatorSchedule.adjustAndApprove')}
      onSave={save}
    />
  )
}
