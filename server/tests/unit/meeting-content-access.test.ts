import { describe, expect, it } from "vitest";

import type { TaskHubAccess } from "../../src/modules/auth/auth.types.js";
import {
  canReadMeetingByRelationship,
  canReadMeetingContent,
} from "../../src/modules/meetings/meeting-content-access.js";
import type { MeetingAccessContext } from "../../src/modules/meetings/meeting-workspace.repository.js";

const baseAccess: TaskHubAccess = {
  roleCode: "USER",
  permissions: [],
  meetingOrganizeEnabled: false,
  meetingCoordinateEnabled: false,
};

function context(overrides: Partial<MeetingAccessContext> = {}): MeetingAccessContext {
  return {
    meetingId: 10,
    organizerUserId: 100,
    status: "SCHEDULED",
    currentRevisionId: 20,
    meetingRowVersion: "0x0000000000000001",
    isAttendee: false,
    hasPendingReschedule: false,
    ...overrides,
  };
}

describe("Meeting content access", () => {
  it("keeps Organizer visibility independent from attendance and lifecycle state", () => {
    expect(canReadMeetingContent(context({ status: "PENDING_APPROVAL" }), 100, baseAccess)).toBe(true);
    expect(canReadMeetingContent(context({ status: "CANCELLED" }), 100, baseAccess)).toBe(true);
  });

  it("allows attendees only when normal Meeting visibility is available", () => {
    expect(canReadMeetingContent(context({ isAttendee: true, status: "SCHEDULED" }), 200, baseAccess)).toBe(true);
    expect(canReadMeetingContent(context({ isAttendee: true, status: "CANCELLED" }), 200, baseAccess)).toBe(true);
    expect(canReadMeetingContent(context({ isAttendee: true, status: "PENDING_APPROVAL" }), 200, baseAccess)).toBe(false);
  });

  it("allows Coordinators but does not let ADMIN or Organizer capability imply content visibility", () => {
    expect(
      canReadMeetingContent(
        context(),
        200,
        { ...baseAccess, meetingCoordinateEnabled: true },
      ),
    ).toBe(true);
    expect(
      canReadMeetingContent(context(), 200, { ...baseAccess, meetingOrganizeEnabled: true }),
    ).toBe(false);
    expect(canReadMeetingContent(context(), 200, { ...baseAccess, roleCode: "ADMIN" })).toBe(false);
  });

  it("applies the same visibility rules to Related Meeting family members", () => {
    expect(
      canReadMeetingByRelationship(
        { organizerUserId: 100, status: "PENDING_APPROVAL", isAttendee: false },
        100,
        baseAccess,
      ),
    ).toBe(true);
    expect(
      canReadMeetingByRelationship(
        { organizerUserId: 100, status: "SCHEDULED", isAttendee: true },
        200,
        baseAccess,
      ),
    ).toBe(true);
    expect(
      canReadMeetingByRelationship(
        { organizerUserId: 100, status: "PENDING_APPROVAL", isAttendee: true },
        200,
        baseAccess,
      ),
    ).toBe(false);
    expect(
      canReadMeetingByRelationship(
        { organizerUserId: 100, status: "SCHEDULED", isAttendee: false },
        200,
        { ...baseAccess, meetingCoordinateEnabled: true },
      ),
    ).toBe(true);
    expect(
      canReadMeetingByRelationship(
        { organizerUserId: 100, status: "SCHEDULED", isAttendee: false },
        200,
        { ...baseAccess, meetingOrganizeEnabled: true },
      ),
    ).toBe(false);
  });
});
