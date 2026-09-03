import { describe, expect, it } from "vitest";

import {
  hasMeetingPermission,
  meetingScheduleVisibility,
} from "../../src/modules/meetings/meetings.policy.js";
import type { TaskHubAccess } from "../../src/modules/auth/auth.types.js";

const baseAccess: TaskHubAccess = {
  roleCode: "USER",
  contractsEnabled: false,
  meetingOrganizeEnabled: false,
  meetingCoordinateEnabled: false,
};

describe("Meetings policy", () => {
  it("treats Coordinator as having effective Organizer capability", () => {
    const access = { ...baseAccess, meetingCoordinateEnabled: true };
    expect(hasMeetingPermission(access, "MEETING_ORGANIZE")).toBe(true);
    expect(hasMeetingPermission(access, "MEETING_COORDINATE")).toBe(true);
  });

  it("does not let ADMIN role imply Meeting business permissions", () => {
    const access: TaskHubAccess = { ...baseAccess, roleCode: "ADMIN" };
    expect(hasMeetingPermission(access, "MEETING_ORGANIZE")).toBe(false);
    expect(hasMeetingPermission(access, "MEETING_COORDINATE")).toBe(false);
  });

  it("returns full schedule visibility for the Organizer, attendee, or Coordinator", () => {
    expect(
      meetingScheduleVisibility(baseAccess, { isOrganizer: false, isAttendee: true }),
    ).toBe("FULL");
    expect(
      meetingScheduleVisibility(baseAccess, { isOrganizer: true, isAttendee: false }),
    ).toBe("FULL");
    expect(
      meetingScheduleVisibility(
        { ...baseAccess, meetingCoordinateEnabled: true },
        { isOrganizer: false, isAttendee: false },
      ),
    ).toBe("FULL");
  });

  it("returns title-and-creator preview visibility for unrelated scheduled Meetings to Organizers", () => {
    expect(
      meetingScheduleVisibility(
        { ...baseAccess, meetingOrganizeEnabled: true },
        { isOrganizer: false, isAttendee: false },
      ),
    ).toBe("PREVIEW");
  });

  it("hides unrelated scheduled Meetings from ordinary users and ADMIN-only users", () => {
    expect(
      meetingScheduleVisibility(baseAccess, { isOrganizer: false, isAttendee: false }),
    ).toBe("NONE");
    expect(
      meetingScheduleVisibility(
        { ...baseAccess, roleCode: "ADMIN" },
        { isOrganizer: false, isAttendee: false },
      ),
    ).toBe("NONE");
  });
});

