import type { TaskHubAccess } from '@/features/auth/types/auth.types'

export function canOrganizeRoomMeetings(access: TaskHubAccess | null | undefined): boolean {
  return access?.meetingRoomOrganizeEnabled === true || access?.meetingCoordinateEnabled === true
}

export function canOrganizeZoomMeetings(access: TaskHubAccess | null | undefined): boolean {
  return access?.meetingZoomOrganizeEnabled === true
}

export function canOrganizeAnyMeetings(access: TaskHubAccess | null | undefined): boolean {
  return (
    canOrganizeRoomMeetings(access) ||
    canOrganizeZoomMeetings(access) ||
    access?.meetingOrganizeEnabled === true
  )
}

export function canCoordinateMeetings(access: TaskHubAccess | null | undefined): boolean {
  return access?.meetingCoordinateEnabled === true
}
