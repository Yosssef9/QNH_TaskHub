import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskHubAccess } from "../../src/modules/auth/auth.types.js";
import { meetingWorkspaceRepository } from "../../src/modules/meetings/meeting-workspace.repository.js";
import { meetingWorkspaceService } from "../../src/modules/meetings/meeting-workspace.service.js";
import { meetingWorkflowRepository } from "../../src/modules/meetings/meeting-workflow.repository.js";
import type { MeetingSummary } from "../../src/modules/meetings/meeting-workflow.types.js";

const access: TaskHubAccess = {
  roleCode: "USER",
  permissions: [],
  meetingOrganizeEnabled: false,
  meetingCoordinateEnabled: false,
};

function summary(id: number, organizerUserId = 100): MeetingSummary {
  return {
    id,
    title: `Meeting ${id}`,
    description: null,
    status: "SCHEDULED",
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
    startAtUtc: "2026-09-10T06:00:00.000Z",
    endAtUtc: "2026-09-10T07:00:00.000Z",
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

function arrangeDetail(childIsAttendee: boolean) {
  vi.spyOn(meetingWorkspaceRepository, "findAccessContext").mockResolvedValue({
    meetingId: 1,
    organizerUserId: 100,
    status: "SCHEDULED",
    currentRevisionId: 10,
    meetingRowVersion: "0x0000000000000001",
    isAttendee: true,
    hasPendingReschedule: false,
  });
  vi.spyOn(meetingWorkflowRepository, "findSummary").mockResolvedValue(summary(1));
  vi.spyOn(meetingWorkspaceRepository, "listAgendaItems").mockResolvedValue([]);
  vi.spyOn(meetingWorkspaceRepository, "listRevisions").mockResolvedValue([]);
  vi.spyOn(meetingWorkspaceRepository, "listActivity").mockResolvedValue([
    {
      id: 1,
      activityType: "FOLLOW_UP_MEETING_CREATED",
      actor: { userId: 100, userCode: "U100", userName: "User 100" },
      changes: { followUpMeetingId: 2, followUpMeetingTitle: "Private child" },
      createdAtUtc: "2026-09-10T07:00:00.000Z",
    },
    {
      id: 2,
      activityType: "AGENDA_UPDATED",
      actor: { userId: 100, userCode: "U100", userName: "User 100" },
      changes: { topicCount: 2 },
      createdAtUtc: "2026-09-10T06:30:00.000Z",
    },
  ]);
  vi.spyOn(meetingWorkflowRepository, "listRelatedMeetingFamily").mockResolvedValue({
    rootMeetingId: 1,
    items: [
      { meeting: summary(1), isAttendee: true },
      { meeting: summary(2, 300), isAttendee: childIsAttendee },
    ],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Meeting workspace related activity privacy", () => {
  it("suppresses follow-up activity when the referenced Meeting is hidden", async () => {
    arrangeDetail(false);

    const detail = await meetingWorkspaceService.getDetail(200, access, 1);

    expect(detail.activity.map((item) => item.activityType)).toEqual(["AGENDA_UPDATED"]);
  });

  it("keeps follow-up activity when the referenced Meeting is independently visible", async () => {
    arrangeDetail(true);

    const detail = await meetingWorkspaceService.getDetail(200, access, 1);

    expect(detail.activity.map((item) => item.activityType)).toEqual([
      "FOLLOW_UP_MEETING_CREATED",
      "AGENDA_UPDATED",
    ]);
  });
});
