import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { toApiClientError } from '@/lib/api-error'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import { useAdjustAndApproveMeetingRequest } from '../hooks/use-meetings'
import { participantUserIdsFromMeeting } from '../meeting-participant-availability'
import type { MeetingMode, MeetingSummary } from '../types/meeting.types'
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
    meetingMode: MeetingMode
    roomId: number | null
    onlineJoinUrl: string | null
    startAtUtc: string
    endAtUtc: string
    schedulingNotes: string | null
  }) {
    if (input.meetingMode !== 'ROOM' || input.roomId === null) return
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
    meetingMode: 'ROOM' as const,
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
      participantUserIds={participantUserIdsFromMeeting(meeting)}
      rooms={rooms.data ?? []}
      roomsPending={rooms.isPending}
      roomsError={rooms.isError}
      onRetryRooms={() => void rooms.refetch()}
      initialRoomId={meeting.room?.id ?? null}
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
