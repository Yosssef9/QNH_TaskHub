import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEmailState: vi.fn(),
  listSeriesRecipients: vi.fn(),
  getParticipantAvailability: vi.fn(),
  getParticipantConflictsForMeetingWindows: vi.fn(),
}));

vi.mock("../../src/config/logger.js", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../../src/database/transaction.js", () => ({ withTransaction: vi.fn() }));
vi.mock("../../src/modules/meetings/meeting-notifications.repository.js", () => ({
  meetingNotificationsRepository: {
    getEmailState: mocks.getEmailState,
    listSeriesRecipients: mocks.listSeriesRecipients,
  },
}));
vi.mock("../../src/modules/meetings/meeting-scheduling.service.js", () => ({
  meetingSchedulingService: {
    getParticipantAvailability: mocks.getParticipantAvailability,
    getParticipantConflictsForMeetingWindows: mocks.getParticipantConflictsForMeetingWindows,
  },
}));

import { meetingNotificationsService } from "../../src/modules/meetings/meeting-notifications.service.js";

function emailState(overrides: Record<string, unknown> = {}) {
  return {
    meetingId: 127,
    title: "Monthly Operations Review",
    meetingStatus: "SCHEDULED",
    organizerUserId: 10,
    organizerUserName: "Organizer",
    decisionActorName: "Coordinator",
    revisionId: 14,
    revisionType: "INITIAL",
    revisionStatus: "APPROVED",
    currentRevisionId: 14,
    roomId: 3,
    roomNameAr: "قاعة",
    roomNameEn: "Room",
    startAtUtc: new Date("2026-09-28T07:00:00Z"),
    endAtUtc: new Date("2026-09-28T08:00:00Z"),
    previousRoomNameAr: null,
    previousRoomNameEn: null,
    previousStartAtUtc: null,
    previousEndAtUtc: null,
    timeFormat: "12H",
    ownerIsOrganizer: false,
    ownerIsAttendee: true,
    ownerIsCoordinator: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEmailState.mockResolvedValue(emailState());
  mocks.getParticipantAvailability.mockResolvedValue({
    startAtUtc: "2026-09-28T07:00:00.000Z",
    endAtUtc: "2026-09-28T08:00:00.000Z",
    participantCount: 1,
    conflictParticipantCount: 1,
    conflicts: [{
      participant: { userId: 200, userCode: "U200", userName: "Sara" },
      conflictCount: 1,
      overlaps: [{ startAtUtc: "2026-09-28T07:30:00.000Z", endAtUtc: "2026-09-28T08:30:00.000Z" }],
    }],
  });
  mocks.getParticipantConflictsForMeetingWindows.mockResolvedValue([]);
});

describe("Meeting notification conflict payloads", () => {
  it("adds the attendee's own conflict to invitation payloads and excludes the invited Meeting itself", async () => {
    const payload = await meetingNotificationsService.buildEmailPayload(200, "MEETING_INVITED", 127, 14);
    assert.deepEqual(payload?.scheduleConflict, {
      conflictCount: 1,
      overlaps: [{ startAtUtc: "2026-09-28T07:30:00.000Z", endAtUtc: "2026-09-28T08:30:00.000Z" }],
    });
    assert.equal(mocks.getParticipantAvailability.mock.calls[0]![0].excludeMeetingId, 127);
    assert.deepEqual(mocks.getParticipantAvailability.mock.calls[0]![0].participantUserIds, [200]);
  });

  it("does not warn a non-attending Organizer on a reschedule email", async () => {
    mocks.getEmailState.mockResolvedValue(emailState({
      revisionType: "RESCHEDULE",
      ownerIsOrganizer: true,
      ownerIsAttendee: false,
    }));
    const payload = await meetingNotificationsService.buildEmailPayload(10, "MEETING_RESCHEDULED", 127, 14);
    assert.equal(payload?.scheduleConflict, null);
    assert.equal(mocks.getParticipantAvailability.mock.calls.length, 0);
  });

  it("rebuilds lifecycle payloads at send time instead of trusting the queued conflict snapshot", async () => {
    const payload = await meetingNotificationsService.refreshEmailPayloadAtSend(200, "MEETING_INVITED", {
      meetingId: 127,
      revisionId: 14,
      scheduleConflict: null,
    });
    assert.equal((payload?.scheduleConflict as { conflictCount: number }).conflictCount, 1);
  });

  it("batches Series conflict checks and only evaluates occurrences the recipient actually attends", async () => {
    mocks.listSeriesRecipients.mockResolvedValue([{ 
      ownerUserId: 200,
      ownerUserName: "Sara",
      organizerUserId: 10,
      organizerUserName: "Organizer",
      seriesTitle: "Weekly Operations",
      timeFormat: "12H",
      meetings: [
        { meetingId: 501, sequenceNumber: 1, title: "Weekly", startAtUtc: new Date("2026-10-01T07:00:00Z"), endAtUtc: new Date("2026-10-01T08:00:00Z"), roomNameAr: "أ", roomNameEn: "A", ownerIsAttendee: true },
        { meetingId: 502, sequenceNumber: 2, title: "Weekly", startAtUtc: new Date("2026-10-08T07:00:00Z"), endAtUtc: new Date("2026-10-08T08:00:00Z"), roomNameAr: "أ", roomNameEn: "A", ownerIsAttendee: false },
      ],
    }]);
    mocks.getParticipantConflictsForMeetingWindows.mockResolvedValue([{ 
      meetingId: 501,
      conflictCount: 1,
      overlaps: [{ startAtUtc: "2026-10-01T07:30:00.000Z", endAtUtc: "2026-10-01T08:30:00.000Z" }],
    }]);

    const payload = await meetingNotificationsService.buildSeriesEmailPayload(200, 9);
    const meetings = payload?.meetings as Array<{ meetingId: number; scheduleConflict: unknown }>;
    assert.equal(mocks.getParticipantConflictsForMeetingWindows.mock.calls[0]![0].meetings.length, 1);
    assert.equal(meetings[0]!.meetingId, 501);
    assert.notEqual(meetings[0]!.scheduleConflict, null);
    assert.equal(meetings[1]!.meetingId, 502);
    assert.equal(meetings[1]!.scheduleConflict, null);
  });
});
