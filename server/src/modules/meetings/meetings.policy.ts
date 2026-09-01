import type { TaskHubAccess } from "../auth/auth.types.js";
import type { MeetingPermissionCode } from "./meetings.types.js";

export function hasMeetingPermission(
  access: TaskHubAccess,
  permission: MeetingPermissionCode,
): boolean {
  if (permission === "MEETING_COORDINATE") {
    return access.meetingCoordinateEnabled === true;
  }

  return access.meetingOrganizeEnabled === true || access.meetingCoordinateEnabled === true;
}
