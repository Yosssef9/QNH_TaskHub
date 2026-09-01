import { describe, expect, it } from "vitest";

import {
  assertParticipantCount,
  assertScheduleWindow,
  hasRoomCapacity,
} from "../../src/modules/meetings/meeting-scheduling.policy.js";

describe("Meeting scheduling policy", () => {
  it("allows participant counts that fit the room exactly", () => {
    expect(hasRoomCapacity(10, 10)).toBe(true);
  });

  it("rejects participant counts above room capacity", () => {
    expect(hasRoomCapacity(10, 11)).toBe(false);
  });

  it("requires the Meeting end to be after its start", () => {
    expect(() =>
      assertScheduleWindow(new Date("2026-09-01T08:00:00Z"), new Date("2026-09-01T08:00:00Z")),
    ).toThrowError(expect.objectContaining({ code: "INVALID_MEETING_SCHEDULE_WINDOW" }));
  });

  it("requires at least one participant", () => {
    expect(() => assertParticipantCount(0)).toThrowError(
      expect.objectContaining({ code: "INVALID_MEETING_PARTICIPANT_COUNT" }),
    );
  });
});
