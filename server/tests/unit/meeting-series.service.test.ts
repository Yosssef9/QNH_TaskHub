import { beforeEach, describe, expect, it, vi } from "vitest";

const seriesRepository = vi.hoisted(() => ({
  acquireCreationRequestLock: vi.fn(),
  findByCreationRequestId: vi.fn(),
  createSeries: vi.fn(),
  addMember: vi.fn(),
  listMeetingIds: vi.fn(),
}));

const schedulingService = vi.hoisted(() => ({
  assertCoordinatorPermission: vi.fn(),
  acquireRoomLocksInTransaction: vi.fn(),
  assertLockedScheduleAvailable: vi.fn(),
  commitPendingRevisionInTransaction: vi.fn(),
  getAvailability: vi.fn(),
}));

const schedulingRepository = vi.hoisted(() => ({
  addActivity: vi.fn(),
}));

const workflow = vi.hoisted(() => ({
  prepareMeetingCreationInTransaction: vi.fn(),
  createPreparedMeetingInTransaction: vi.fn(),
}));

vi.mock("../../src/database/transaction.js", () => ({
  withTransaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}),
}));

vi.mock("../../src/modules/meetings/meeting-series.repository.js", () => ({
  meetingSeriesRepository: seriesRepository,
}));

vi.mock("../../src/modules/meetings/meeting-scheduling.service.js", () => ({
  meetingSchedulingService: schedulingService,
}));

vi.mock("../../src/modules/meetings/meeting-scheduling.repository.js", () => ({
  meetingSchedulingRepository: schedulingRepository,
}));

vi.mock("../../src/modules/meetings/meeting-workflow.service.js", () => workflow);

import {
  meetingSeriesRequestFingerprint,
  meetingSeriesService,
} from "../../src/modules/meetings/meeting-series.service.js";
import { createMeetingSeriesBodySchema } from "../../src/modules/meetings/meeting-series.schemas.js";

function input(dates = ["2027-01-05"]) {
  return createMeetingSeriesBodySchema.parse({
    creationRequestId: "7d4d41be-6a75-4ab6-8325-63539c8012a4",
    defaults: {
      title: "Series",
      description: null,
      organizerAttending: false,
      attendeeUserIds: [101],
      agendaItems: [],
      roomId: 7,
      startTime: "08:00",
      endTime: "09:00",
    },
    schedule: { mode: "CUSTOM", dates },
  });
}

function preparedFromMeetingInput(meetingInput: {
  startAtUtc: string;
  endAtUtc: string;
  attendeeUserIds: number[];
}) {
  return {
    input: meetingInput,
    startAtUtc: new Date(meetingInput.startAtUtc),
    endAtUtc: new Date(meetingInput.endAtUtc),
    selectedAttendeeUserIds: meetingInput.attendeeUserIds,
    attendeeUserIds: meetingInput.attendeeUserIds,
    agendaItems: [],
    followUpSource: null,
  };
}

describe("Meeting Series service", () => {
  beforeEach(() => {
    for (const mock of [
      ...Object.values(seriesRepository),
      ...Object.values(schedulingService),
      ...Object.values(schedulingRepository),
      ...Object.values(workflow),
    ]) {
      mock.mockReset();
    }

    schedulingService.assertCoordinatorPermission.mockResolvedValue(undefined);
    seriesRepository.acquireCreationRequestLock.mockResolvedValue(0);
    seriesRepository.findByCreationRequestId.mockResolvedValue(null);
    workflow.prepareMeetingCreationInTransaction.mockImplementation(
      async (_transaction: unknown, _actor: number, meetingInput: Parameters<typeof preparedFromMeetingInput>[0]) =>
        preparedFromMeetingInput(meetingInput),
    );
    schedulingService.acquireRoomLocksInTransaction.mockResolvedValue(undefined);
    schedulingService.assertLockedScheduleAvailable.mockResolvedValue(undefined);
    seriesRepository.createSeries.mockResolvedValue({
      seriesId: 9,
      creationRequestId: "7d4d41be-6a75-4ab6-8325-63539c8012a4",
      rowVersion: "0x0000000000000001",
    });
    workflow.createPreparedMeetingInTransaction.mockResolvedValue({
      meetingId: 77,
      revisionId: 88,
      revisionRowVersion: "0x0000000000000002",
    });
    schedulingService.commitPendingRevisionInTransaction.mockResolvedValue({
      meetingId: 77,
      revisionId: 88,
      roomId: 7,
      startAtUtc: new Date("2027-01-05T05:00:00.000Z"),
      endAtUtc: new Date("2027-01-05T06:00:00.000Z"),
      participantCount: 1,
    });
    schedulingRepository.addActivity.mockResolvedValue(undefined);
    seriesRepository.addMember.mockResolvedValue(undefined);
  });

  it("replays an existing idempotent request without creating Meetings again", async () => {
    seriesRepository.listMeetingIds.mockResolvedValue([21, 22]);

    const firstInput = input();
    seriesRepository.findByCreationRequestId.mockResolvedValue({
      seriesId: 5,
      createdByUserId: 10,
      creationRequestId: firstInput.creationRequestId,
      requestFingerprint: meetingSeriesRequestFingerprint({
        timeZone: firstInput.timeZone,
        defaults: firstInput.defaults,
        schedule: firstInput.schedule,
        exceptions: firstInput.exceptions,
      }),
      rowVersion: "0x0000000000000001",
    });

    await expect(meetingSeriesService.create(10, firstInput)).resolves.toEqual({
      seriesId: 5,
      creationRequestId: firstInput.creationRequestId,
      meetingIds: [21, 22],
      replayed: true,
    });
    expect(workflow.prepareMeetingCreationInTransaction).not.toHaveBeenCalled();
    expect(seriesRepository.createSeries).not.toHaveBeenCalled();
  });

  it("requires Coordinator permission before touching Series persistence", async () => {
    schedulingService.assertCoordinatorPermission.mockRejectedValue(
      Object.assign(new Error("forbidden"), { statusCode: 403, code: "FORBIDDEN" }),
    );

    await expect(meetingSeriesService.create(10, input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(seriesRepository.acquireCreationRequestLock).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key with different data", async () => {
    seriesRepository.findByCreationRequestId.mockResolvedValue({
      seriesId: 5,
      createdByUserId: 10,
      creationRequestId: "7d4d41be-6a75-4ab6-8325-63539c8012a4",
      requestFingerprint: "A".repeat(64),
      rowVersion: "0x0000000000000001",
    });

    await expect(meetingSeriesService.create(10, input())).rejects.toMatchObject({
      statusCode: 409,
      code: "MEETING_SERIES_IDEMPOTENCY_CONFLICT",
    });
    expect(seriesRepository.createSeries).not.toHaveBeenCalled();
  });

  it("validates the entire batch before inserting the Series or any Meeting", async () => {
    const request = input(["2027-01-05", "2027-01-06"]);
    schedulingService.assertLockedScheduleAvailable
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        Object.assign(new Error("conflict"), {
          statusCode: 409,
          code: "MEETING_ROOM_TIME_CONFLICT",
        }),
      );

    await expect(meetingSeriesService.create(10, request)).rejects.toMatchObject({
      code: "MEETING_ROOM_TIME_CONFLICT",
    });
    expect(seriesRepository.createSeries).not.toHaveBeenCalled();
    expect(workflow.createPreparedMeetingInTransaction).not.toHaveBeenCalled();
  });

  it("creates normal Meetings only after batch validation succeeds", async () => {
    const result = await meetingSeriesService.create(10, input());

    expect(schedulingService.acquireRoomLocksInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      [7],
    );
    expect(seriesRepository.createSeries).toHaveBeenCalledTimes(1);
    expect(workflow.createPreparedMeetingInTransaction).toHaveBeenCalledTimes(1);
    expect(schedulingService.commitPendingRevisionInTransaction).toHaveBeenCalledTimes(1);
    expect(schedulingRepository.addActivity).toHaveBeenCalledWith(
      expect.anything(),
      77,
      10,
      "CREATED_FROM_SERIES",
      expect.objectContaining({ seriesId: 9, sequenceNumber: 1 }),
    );
    expect(seriesRepository.addMember).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      seriesId: 9,
      creationRequestId: "7d4d41be-6a75-4ab6-8325-63539c8012a4",
      meetingIds: [77],
      replayed: false,
    });
  });
});
