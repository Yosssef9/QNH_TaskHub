import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  acquireRoomLock: vi.fn(),
}));

vi.mock("../../src/modules/meetings/meeting-scheduling.repository.js", () => ({
  meetingSchedulingRepository: repository,
}));

import { meetingSchedulingService } from "../../src/modules/meetings/meeting-scheduling.service.js";

describe("Meeting Series room-lock ordering", () => {
  beforeEach(() => {
    repository.acquireRoomLock.mockReset();
    repository.acquireRoomLock.mockResolvedValue(0);
  });

  it("acquires unique room locks in deterministic ascending order", async () => {
    const transaction = {} as never;

    await meetingSchedulingService.acquireRoomLocksInTransaction(transaction, [9, 2, 9, 5]);

    expect(repository.acquireRoomLock.mock.calls.map((call) => call[1])).toEqual([2, 5, 9]);
  });

  it("rejects the batch if any room lock cannot be acquired", async () => {
    repository.acquireRoomLock
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(-1);

    await expect(
      meetingSchedulingService.acquireRoomLocksInTransaction({} as never, [2, 5]),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "MEETING_ROOM_SCHEDULE_BUSY",
    });
  });
});
