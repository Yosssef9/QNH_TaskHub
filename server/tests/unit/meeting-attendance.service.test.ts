import { beforeEach, describe, expect, it, vi } from "vitest";

const workspaceRepository = vi.hoisted(() => ({
  findAccessContext: vi.fn(),
  approvedStart: vi.fn(),
  findAttendanceParticipantForUpdate: vi.fn(),
  listAttendanceForUpdate: vi.fn(),
  updateAttendance: vi.fn(),
  bulkUpdateAttendance: vi.fn(),
  listAttendance: vi.fn(),
  listAgendaItems: vi.fn(),
  listRevisions: vi.fn(),
  listActivity: vi.fn(),
}));

const workflowRepository = vi.hoisted(() => ({
  findSummary: vi.fn(),
  listRelatedMeetingFamily: vi.fn(),
}));

const schedulingRepository = vi.hoisted(() => ({
  addActivity: vi.fn(),
}));

vi.mock("../../src/database/transaction.js", () => ({
  withTransaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}),
}));

vi.mock("../../src/modules/meetings/meeting-workspace.repository.js", () => ({
  meetingWorkspaceRepository: workspaceRepository,
  mapMeetingAttachmentRecord: vi.fn(),
}));

vi.mock("../../src/modules/meetings/meeting-workflow.repository.js", () => ({
  meetingWorkflowRepository: workflowRepository,
}));

vi.mock("../../src/modules/meetings/meeting-scheduling.repository.js", () => ({
  meetingSchedulingRepository: schedulingRepository,
}));

import type { TaskHubAccess } from "../../src/modules/auth/auth.types.js";
import { meetingWorkspaceService } from "../../src/modules/meetings/meeting-workspace.service.js";
import type { MeetingSummary } from "../../src/modules/meetings/meeting-workflow.types.js";

const access: TaskHubAccess = {
  roleCode: "USER",
  permissions: [],
  meetingOrganizeEnabled: false,
  meetingCoordinateEnabled: false,
};

function context(actorUserId = 100) {
  return {
    meetingId: 7,
    organizerUserId: 100,
    status: "SCHEDULED" as const,
    currentRevisionId: 70,
    meetingRowVersion: "0x0000000000000001",
    isAttendee: actorUserId !== 100,
    hasPendingReschedule: false,
  };
}

function summary(): MeetingSummary {
  return {
    id: 7,
    title: "Operations review",
    description: null,
    status: "SCHEDULED",
    organizer: { userId: 100, userCode: "U100", userName: "Organizer" },
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
    startAtUtc: "2020-01-01T08:00:00.000Z",
    endAtUtc: "2020-01-01T09:00:00.000Z",
    schedulingNotes: null,
    participantCount: 2,
    organizerAttending: true,
    attendees: [{ userId: 200, userCode: "U200", userName: "Attendee" }],
    hasPendingReschedule: false,
    revisionId: 70,
    meetingRowVersion: "0x0000000000000001",
    revisionRowVersion: "0x0000000000000002",
  };
}

function arrangeDetail() {
  workflowRepository.findSummary.mockResolvedValue(summary());
  workspaceRepository.listAgendaItems.mockResolvedValue([]);
  workspaceRepository.listRevisions.mockResolvedValue([]);
  workspaceRepository.listActivity.mockResolvedValue([]);
  workspaceRepository.listAttendance.mockResolvedValue([
    {
      participant: { userId: 100, userCode: "U100", userName: "Organizer" },
      role: "ORGANIZER",
      status: "ATTENDED",
      markedBy: { userId: 100, userCode: "U100", userName: "Organizer" },
      markedAtUtc: "2020-01-01T08:01:00.000Z",
    },
    {
      participant: { userId: 200, userCode: "U200", userName: "Attendee" },
      role: "ATTENDEE",
      status: "NOT_MARKED",
      markedBy: null,
      markedAtUtc: null,
    },
  ]);
}

beforeEach(() => {
  for (const mock of [
    ...Object.values(workspaceRepository),
    ...Object.values(workflowRepository),
    ...Object.values(schedulingRepository),
  ]) {
    mock.mockReset();
  }
  workspaceRepository.findAccessContext.mockImplementation(
    async (_meetingId: number, actorUserId: number) => context(actorUserId),
  );
  workspaceRepository.approvedStart.mockResolvedValue(new Date("2020-01-01T08:00:00.000Z"));
  arrangeDetail();
});

describe("Meeting attendance", () => {
  it("rejects attendance changes from a non-Organizer Meeting attendee", async () => {
    await expect(
      meetingWorkspaceService.updateAttendance(200, access, 7, {
        participantUserId: 200,
        status: "ATTENDED",
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "MEETING_ORGANIZER_REQUIRED" });

    expect(workspaceRepository.updateAttendance).not.toHaveBeenCalled();
  });

  it("rejects Organizer attendance changes before the approved Meeting start", async () => {
    workspaceRepository.approvedStart.mockResolvedValue(new Date("2999-01-01T08:00:00.000Z"));

    await expect(
      meetingWorkspaceService.updateAttendance(100, access, 7, {
        participantUserId: 200,
        status: "ABSENT",
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "MEETING_ATTENDANCE_NOT_STARTED" });

    expect(workspaceRepository.updateAttendance).not.toHaveBeenCalled();
  });

  it("lets the Organizer record one participant and audits the transition", async () => {
    workspaceRepository.findAttendanceParticipantForUpdate.mockResolvedValue({
      participantUserId: 200,
      participantUserCode: "U200",
      participantUserName: "Attendee",
      role: "ATTENDEE",
      status: "NOT_MARKED",
    });
    workspaceRepository.updateAttendance.mockResolvedValue(true);

    const detail = await meetingWorkspaceService.updateAttendance(100, access, 7, {
      participantUserId: 200,
      status: "ABSENT",
    });

    expect(workspaceRepository.updateAttendance).toHaveBeenCalledWith(
      {},
      7,
      200,
      100,
      "ABSENT",
    );
    expect(schedulingRepository.addActivity).toHaveBeenCalledWith(
      {},
      7,
      100,
      "ATTENDANCE_UPDATED",
      expect.objectContaining({
        scope: "PARTICIPANT",
        participantUserId: 200,
        fromStatus: "NOT_MARKED",
        toStatus: "ABSENT",
      }),
    );
    expect(detail.attendance).toHaveLength(2);
    expect(detail.permissions.canManageAttendance).toBe(true);
  });

  it("supports Mark all attended as one audited bulk operation", async () => {
    workspaceRepository.listAttendanceForUpdate.mockResolvedValue([
      {
        participantUserId: 100,
        participantUserCode: "U100",
        participantUserName: "Organizer",
        role: "ORGANIZER",
        status: "ATTENDED",
      },
      {
        participantUserId: 200,
        participantUserCode: "U200",
        participantUserName: "Attendee",
        role: "ATTENDEE",
        status: "NOT_MARKED",
      },
    ]);
    workspaceRepository.bulkUpdateAttendance.mockResolvedValue(1);

    await meetingWorkspaceService.bulkUpdateAttendance(100, access, 7, { status: "ATTENDED" });

    expect(workspaceRepository.bulkUpdateAttendance).toHaveBeenCalledWith(
      {},
      7,
      100,
      "ATTENDED",
    );
    expect(schedulingRepository.addActivity).toHaveBeenCalledWith(
      {},
      7,
      100,
      "ATTENDANCE_UPDATED",
      expect.objectContaining({ scope: "ALL", changedCount: 1, toStatus: "ATTENDED" }),
    );
  });
});
