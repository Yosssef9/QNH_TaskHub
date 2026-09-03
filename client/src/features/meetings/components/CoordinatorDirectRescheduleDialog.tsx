import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { toApiClientError } from '@/lib/api-error'

import { useActiveMeetingRooms } from '../hooks/use-meeting-rooms'
import { useDirectCoordinatorReschedule } from '../hooks/use-meetings'
import type { MeetingDetail } from '../types/meeting.types'
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
  const rooms = useActiveMeetingRooms()
  const mutation = useDirectCoordinatorReschedule()
  const meeting = detail.meeting

  async function save(input: {
    roomId: number
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
    room: meeting.room,
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
      rooms={rooms.data ?? []}
      roomsPending={rooms.isPending}
      roomsError={rooms.isError}
      onRetryRooms={() => void rooms.refetch()}
      initialRoomId={meeting.room.id}
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
