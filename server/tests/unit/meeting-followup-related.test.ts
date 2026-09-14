import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskHubAccess } from "../../src/modules/auth/auth.types.js";
import { meetingFollowUpService } from "../../src/modules/meeting-followup/meeting-followup.service.js";
import { meetingWorkspaceRepository } from "../../src/modules/meetings/meeting-workspace.repository.js";
import { meetingWorkflowRepository } from "../../src/modules/meetings/meeting-workflow.repository.js";
import type { MeetingSummary } from "../../src/modules/meetings/meeting-workflow.types.js";

const baseAccess: TaskHubAccess = {
  roleCode: "USER",
  permissions: [],
  meetingOrganizeEnabled: false,
  meetingCoordinateEnabled: false,
};

function meeting(id: number, organizerUserId: number, status: MeetingSummary["status"]): MeetingSummary {
  return {
    id,
    title: `Meeting ${id}`,
    description: null,
    status,
    organizer: {
      userId: organizerUserId,
      userCode: `U${organizerUserId}`,
      userName: `User ${organizerUserId}`,
    },
    room: {
      id: 1,
      code: "BOARD",
      nameAr: "قاعة الاجتماعات",
      nameEn: "Board Room",
      locationText: null,
      colorKey: "BLUE",
      capacity: 12,
      equipmentNotes: null,
      isActive: true,
      rowVersion: "0x0000000000000001",
    },
    startAtUtc: `2026-09-${String(10 + id).padStart(2, "0")}T06:00:00.000Z`,
    endAtUtc: `2026-09-${String(10 + id).padStart(2, "0")}T07:00:00.000Z`,
    schedulingNotes: null,
    participantCount: 2,
    organizerAttending: true,
    attendees: [],
    hasPendingReschedule: false,
    revisionId: id * 10,
    meetingRowVersion: "0x0000000000000001",
    revisionRowVersion: "0x0000000000000001",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Meeting Follow-up related Meeting visibility", () => {
  it("returns only family members independently visible to a normal attendee", async () => {
    vi.spyOn(meetingWorkspaceRepository, "findAccessContext").mockResolvedValue({
      meetingId: 2,
      organizerUserId: 100,
      status: "SCHEDULED",
      currentRevisionId: 20,
      meetingRowVersion: "0x0000000000000001",
      isAttendee: true,
      hasPendingReschedule: false,
    });
    vi.spyOn(meetingWorkflowRepository, "listRelatedMeetingFamily").mockResolvedValue({
      rootMeetingId: 1,
      items: [
        { meeting: meeting(1, 100, "SCHEDULED"), isAttendee: true },
        { meeting: meeting(2, 100, "SCHEDULED"), isAttendee: true },
        { meeting: meeting(3, 300, "SCHEDULED"), isAttendee: false },
        { meeting: meeting(4, 400, "PENDING_APPROVAL"), isAttendee: true },
      ],
    });

    const result = await meetingFollowUpService.relatedMeetings(200, baseAccess, 2);

    expect(result.items.map((item) => item.id)).toEqual([1, 2]);
    expect(result.items[1]?.isCurrent).toBe(true);
    expect(result).not.toHaveProperty("hiddenCount");
  });

  it("lets a Coordinator see the family through existing Meeting coordination authority", async () => {
    vi.spyOn(meetingWorkspaceRepository, "findAccessContext").mockResolvedValue({
      meetingId: 2,
      organizerUserId: 100,
      status: "SCHEDULED",
      currentRevisionId: 20,
      meetingRowVersion: "0x0000000000000001",
      isAttendee: false,
      hasPendingReschedule: false,
    });
    vi.spyOn(meetingWorkflowRepository, "listRelatedMeetingFamily").mockResolvedValue({
      rootMeetingId: 1,
      items: [
        { meeting: meeting(1, 100, "SCHEDULED"), isAttendee: false },
        { meeting: meeting(2, 100, "SCHEDULED"), isAttendee: false },
        { meeting: meeting(3, 300, "PENDING_APPROVAL"), isAttendee: false },
      ],
    });

    const result = await meetingFollowUpService.relatedMeetings(
      200,
      { ...baseAccess, meetingCoordinateEnabled: true },
      2,
    );

    expect(result.items.map((item) => item.id)).toEqual([1, 2, 3]);
  });
});
