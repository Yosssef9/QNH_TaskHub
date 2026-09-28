import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  findParticipantScheduleConflicts: vi.fn(),
}));

vi.mock("../../src/modules/meetings/meeting-scheduling.repository.js", () => ({
  meetingSchedulingRepository: repository,
}));

vi.mock("../../src/database/transaction.js", () => ({
  withTransaction: vi.fn(),
}));

import { meetingParticipantAvailabilityBodySchema } from "../../src/modules/meetings/meetings.schemas.js";
import { meetingSchedulingService } from "../../src/modules/meetings/meeting-scheduling.service.js";

describe("Meeting participant availability", () => {
  beforeEach(() => {
    repository.findParticipantScheduleConflicts.mockReset();
    repository.findParticipantScheduleConflicts.mockResolvedValue([]);
  });

  it("reports no conflicts without changing scheduling eligibility", async () => {
    await expect(
      meetingSchedulingService.getParticipantAvailability({
        startAtUtc: "2026-09-28T07:00:00.000Z",
        endAtUtc: "2026-09-28T08:00:00.000Z",
        participantUserIds: [7, 8, 8],
      }),
    ).resolves.toEqual({
      startAtUtc: "2026-09-28T07:00:00.000Z",
      endAtUtc: "2026-09-28T08:00:00.000Z",
      participantCount: 2,
      conflictParticipantCount: 0,
      conflicts: [],
    });

    expect(repository.findParticipantScheduleConflicts).toHaveBeenCalledWith({
      participantUserIds: [7, 8],
      startAtUtc: new Date("2026-09-28T07:00:00.000Z"),
      endAtUtc: new Date("2026-09-28T08:00:00.000Z"),
      excludeMeetingId: null,
    });
  });

  it("groups conflicts per participant and limits disclosed overlap windows", async () => {
    repository.findParticipantScheduleConflicts.mockResolvedValue([
      { userId: 7, userCode: "U007", userName: "Sara", meetingId: 1, startAtUtc: new Date("2026-09-28T07:00:00Z"), endAtUtc: new Date("2026-09-28T07:15:00Z") },
      { userId: 7, userCode: "U007", userName: "Sara", meetingId: 2, startAtUtc: new Date("2026-09-28T07:15:00Z"), endAtUtc: new Date("2026-09-28T07:30:00Z") },
      { userId: 7, userCode: "U007", userName: "Sara", meetingId: 3, startAtUtc: new Date("2026-09-28T07:30:00Z"), endAtUtc: new Date("2026-09-28T07:45:00Z") },
      { userId: 7, userCode: "U007", userName: "Sara", meetingId: 4, startAtUtc: new Date("2026-09-28T07:45:00Z"), endAtUtc: new Date("2026-09-28T08:00:00Z") },
      { userId: 8, userCode: "U008", userName: "Ahmed", meetingId: 5, startAtUtc: new Date("2026-09-28T07:20:00Z"), endAtUtc: new Date("2026-09-28T07:40:00Z") },
    ]);

    const result = await meetingSchedulingService.getParticipantAvailability({
      startAtUtc: "2026-09-28T07:00:00.000Z",
      endAtUtc: "2026-09-28T08:00:00.000Z",
      participantUserIds: [7, 8],
      excludeMeetingId: 99,
    });

    expect(result.conflictParticipantCount).toBe(2);
    expect(result.conflicts.find((item) => item.participant.userId === 7)).toMatchObject({
      conflictCount: 4,
      participant: { userCode: "U007", userName: "Sara" },
    });
    expect(result.conflicts.find((item) => item.participant.userId === 7)?.overlaps).toHaveLength(3);
    expect(repository.findParticipantScheduleConflicts).toHaveBeenCalledWith(
      expect.objectContaining({ excludeMeetingId: 99 }),
    );
  });

  it("validates the request window and participant limit", () => {
    expect(
      meetingParticipantAvailabilityBodySchema.safeParse({
        startAtUtc: "2026-09-28T08:00:00.000Z",
        endAtUtc: "2026-09-28T07:00:00.000Z",
        participantUserIds: [7],
      }).success,
    ).toBe(false);

    expect(
      meetingParticipantAvailabilityBodySchema.safeParse({
        startAtUtc: "2026-09-28T07:00:00.000Z",
        endAtUtc: "2026-09-28T08:00:00.000Z",
        participantUserIds: Array.from({ length: 501 }, (_, index) => index + 1),
      }).success,
    ).toBe(false);
  });
});
