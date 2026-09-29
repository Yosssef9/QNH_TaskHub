import { describe, expect, it } from "vitest";

import type { TaskHubAccess } from "../../src/modules/auth/auth.types.js";
import {
  hasMeetingPermission,
  meetingScheduleVisibility,
} from "../../src/modules/meetings/meetings.policy.js";

const base: TaskHubAccess = {
  roleCode: "USER",
  permissions: [],
  meetingOrganizeEnabled: false,
  meetingRoomOrganizeEnabled: false,
  meetingZoomOrganizeEnabled: false,
  meetingCoordinateEnabled: false,
};

describe("split Meeting Organizer permissions", () => {
  it("keeps Room and Zoom Organizer capabilities independent", () => {
    const roomOnly = { ...base, meetingRoomOrganizeEnabled: true };
    expect(hasMeetingPermission(roomOnly, "MEETING_ORGANIZE_ROOM")).toBe(true);
    expect(hasMeetingPermission(roomOnly, "MEETING_ORGANIZE_ZOOM")).toBe(false);

    const zoomOnly = { ...base, meetingZoomOrganizeEnabled: true };
    expect(hasMeetingPermission(zoomOnly, "MEETING_ORGANIZE_ROOM")).toBe(false);
    expect(hasMeetingPermission(zoomOnly, "MEETING_ORGANIZE_ZOOM")).toBe(true);
  });

  it("lets Coordinator organize Room Meetings but does not imply Zoom Organizer", () => {
    const coordinator = { ...base, meetingCoordinateEnabled: true };
    expect(hasMeetingPermission(coordinator, "MEETING_COORDINATE")).toBe(true);
    expect(hasMeetingPermission(coordinator, "MEETING_ORGANIZE_ROOM")).toBe(true);
    expect(hasMeetingPermission(coordinator, "MEETING_ORGANIZE_ZOOM")).toBe(false);
  });

  it("keeps the aggregate Organizer gate available for shared organizer-only routes", () => {
    expect(hasMeetingPermission({ ...base, meetingRoomOrganizeEnabled: true }, "MEETING_ORGANIZE")).toBe(true);
    expect(hasMeetingPermission({ ...base, meetingZoomOrganizeEnabled: true }, "MEETING_ORGANIZE")).toBe(true);
  });

  it("does not expose unrelated schedule previews to Zoom-only organizers", () => {
    expect(
      meetingScheduleVisibility(
        { ...base, meetingZoomOrganizeEnabled: true },
        { isOrganizer: false, isAttendee: false },
      ),
    ).toBe("NONE");

    expect(
      meetingScheduleVisibility(
        { ...base, meetingRoomOrganizeEnabled: true },
        { isOrganizer: false, isAttendee: false },
      ),
    ).toBe("PREVIEW");
  });
});
