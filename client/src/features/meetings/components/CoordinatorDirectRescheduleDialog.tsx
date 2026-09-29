import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { toApiClientError } from '@/lib/api-error'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import { useDirectCoordinatorReschedule } from '../hooks/use-meetings'
import { participantUserIdsFromMeeting } from '../meeting-participant-availability'
import type { MeetingDetail, MeetingMode } from '../types/meeting.types'
import { canOrganizeZoomMeetings } from '../meeting-access'
import { CoordinatorScheduleEditorDialog } from './CoordinatorScheduleEditorDialog'

export function CoordinatorDirectRescheduleDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: MeetingDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const rooms = useActiveMeetingRooms()
  const mutation = useDirectCoordinatorReschedule()
  const meeting = detail.meeting

  async function save(input: {
    meetingMode: MeetingMode
    roomId: number | null
    onlineJoinUrl: string | null
    startAtUtc: string
    endAtUtc: string
    schedulingNotes: string | null
  }) {
    try {
      await mutation.mutateAsync({
        meetingId: meeting.id,
        meetingRowVersion: meeting.meetingRowVersion,
        ...input,
      })
      toast.success(t('meetings.workspace.directRescheduled'))
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.workspace.directRescheduleError'),
        }),
      )
    }
  }

  const currentSchedule = {
    label: t('meetings.coordinatorSchedule.currentSchedule'),
    meetingMode: meeting.meetingMode,
    room: meeting.room,
    onlineJoinUrl: meeting.onlineJoinUrl,
    startAtUtc: meeting.startAtUtc,
    endAtUtc: meeting.endAtUtc,
  }

  return (
    <CoordinatorScheduleEditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('meetings.workspace.directRescheduleTitle')}
      description={t('meetings.workspace.directRescheduleDescription')}
      meetingTitle={meeting.title}
      participantCount={meeting.participantCount}
      participantUserIds={participantUserIdsFromMeeting(meeting)}
      rooms={rooms.data ?? []}
      roomsPending={rooms.isPending}
      roomsError={rooms.isError}
      onRetryRooms={() => void rooms.refetch()}
      initialMeetingMode={meeting.meetingMode}
      initialRoomId={meeting.room?.id ?? null}
      initialOnlineJoinUrl={meeting.onlineJoinUrl}
      allowZoom={canOrganizeZoomMeetings(currentUser.data?.access)}
      initialStartAtUtc={meeting.startAtUtc}
      initialEndAtUtc={meeting.endAtUtc}
      initialNotes={null}
      referenceSchedules={[currentSchedule]}
      comparisonBaseline={currentSchedule}
      excludeMeetingId={meeting.id}
      savePending={mutation.isPending}
      saveLabel={t('meetings.workspace.rescheduleMeetingNow')}
      onSave={save}
    />
  )
}
