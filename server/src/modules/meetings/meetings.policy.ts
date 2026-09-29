import type { TaskHubAccess } from "../auth/auth.types.js";
import type { MeetingPermissionCode } from "./meetings.types.js";

export function hasMeetingPermission(
  access: TaskHubAccess,
  permission: MeetingPermissionCode,
): boolean {
  if (permission === "MEETING_COORDINATE") {
    return access.meetingCoordinateEnabled === true;
  }

  if (permission === "MEETING_ORGANIZE_ZOOM") {
    return access.meetingZoomOrganizeEnabled === true;
  }

  if (permission === "MEETING_ORGANIZE_ROOM") {
    return access.meetingRoomOrganizeEnabled === true || access.meetingCoordinateEnabled === true;
  }

  return (
    access.meetingRoomOrganizeEnabled === true ||
    access.meetingZoomOrganizeEnabled === true ||
    access.meetingOrganizeEnabled === true ||
    access.meetingCoordinateEnabled === true
  );
}

export type MeetingScheduleVisibility = "FULL" | "PREVIEW" | "BUSY" | "NONE";

export function meetingScheduleVisibility(
  access: TaskHubAccess,
  relationship: { isOrganizer: boolean; isAttendee: boolean },
): MeetingScheduleVisibility {
  if (access.meetingCoordinateEnabled === true) return "FULL";
  if (relationship.isOrganizer || relationship.isAttendee) return "FULL";

  // Only physical-room organizers need unrelated occupancy previews.
  if (access.meetingRoomOrganizeEnabled === true) return "PREVIEW";

  return "NONE";
}
