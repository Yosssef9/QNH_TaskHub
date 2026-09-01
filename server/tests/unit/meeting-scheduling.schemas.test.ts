import { describe, expect, it } from "vitest";

import { meetingAvailabilityBodySchema } from "../../src/modules/meetings/meetings.schemas.js";

describe("Meeting availability schema", () => {
  it("accepts a valid UTC/offset schedule window", () => {
    const result = meetingAvailabilityBodySchema.safeParse({
      roomId: 4,
      startAtUtc: "2026-09-01T08:00:00Z",
      endAtUtc: "2026-09-01T10:00:00Z",
      participantCount: 8,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an end time that is not after the start", () => {
    const result = meetingAvailabilityBodySchema.safeParse({
      roomId: 4,
      startAtUtc: "2026-09-01T10:00:00Z",
      endAtUtc: "2026-09-01T09:00:00Z",
      participantCount: 8,
    });

    expect(result.success).toBe(false);
  });
});
