import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { toApiClientError } from '@/lib/api-error'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import { useAdjustAndApproveMeetingRequest } from '../hooks/use-meetings'
import type { MeetingSummary } from '../types/meeting.types'
import { CoordinatorScheduleEditorDialog } from './CoordinatorScheduleEditorDialog'

interface CoordinatorMeetingScheduleDialogProps {
  meeting: MeetingSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CoordinatorMeetingScheduleDialog({
  meeting,
  open,
  onOpenChange,
}: CoordinatorMeetingScheduleDialogProps) {
  const { t } = useTranslation()
  const rooms = useActiveMeetingRooms()
  const adjustAndApprove = useAdjustAndApproveMeetingRequest()

  async function save(input: {
    roomId: number
    startAtUtc: string
    endAtUtc: string
    schedulingNotes: string | null
  }) {
    try {
      await adjustAndApprove.mutateAsync({
        meetingId: meeting.id,
        revisionId: meeting.revisionId,
        revisionRowVersion: meeting.revisionRowVersion,
        ...input,
      })
      toast.success(t('meetings.requestAdjustedAndApproved'))
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.errors.scheduleUpdate'),
        }),
      )
    }
  }

  const requestedSchedule = {
    label: t('meetings.coordinatorSchedule.requestedSchedule'),
    room: meeting.room,
    startAtUtc: meeting.startAtUtc,
    endAtUtc: meeting.endAtUtc,
    emphasis: 'requested' as const,
  }

  return (
    <CoordinatorScheduleEditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('meetings.coordinatorEditTitle')}
      description={t('meetings.coordinatorEditDescription', { title: meeting.title })}
      meetingTitle={meeting.title}
      participantCount={meeting.participantCount}
      rooms={rooms.data ?? []}
      roomsPending={rooms.isPending}
      roomsError={rooms.isError}
      onRetryRooms={() => void rooms.refetch()}
      initialRoomId={meeting.room.id}
      initialStartAtUtc={meeting.startAtUtc}
      initialEndAtUtc={meeting.endAtUtc}
      initialNotes={meeting.schedulingNotes}
      referenceSchedules={[requestedSchedule]}
      comparisonBaseline={requestedSchedule}
      savePending={adjustAndApprove.isPending}
      saveLabel={t('meetings.coordinatorSchedule.adjustAndApprove')}
      onSave={save}
    />
  )
}
