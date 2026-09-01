import { describe, expect, it } from "vitest";

import {
  createMeetingBodySchema,
  decideMeetingRequestBodySchema,
  meetingScheduleQuerySchema,
  updateMeetingScheduleBodySchema,
} from "../../src/modules/meetings/meeting-workflow.schemas.js";

describe("Meeting workflow schemas", () => {
  it("accepts a Meeting request with unique-looking attendee IDs and a valid time window", () => {
    const parsed = createMeetingBodySchema.parse({
      title: "Operations review",
      description: "Monthly review",
      roomId: 3,
      startAtUtc: "2026-09-03T06:00:00.000Z",
      endAtUtc: "2026-09-03T07:00:00.000Z",
      attendeeUserIds: [11, 12],
    });

    expect(parsed.title).toBe("Operations review");
    expect(parsed.attendeeUserIds).toEqual([11, 12]);
  });

  it("rejects a Meeting whose end is not after its start", () => {
    const parsed = createMeetingBodySchema.safeParse({
      title: "Invalid meeting",
      roomId: 3,
      startAtUtc: "2026-09-03T07:00:00.000Z",
      endAtUtc: "2026-09-03T07:00:00.000Z",
      attendeeUserIds: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("requires row-version concurrency tokens for Coordinator changes", () => {
    expect(
      updateMeetingScheduleBodySchema.safeParse({
        revisionId: 9,
        revisionRowVersion: "bad-version",
        roomId: 2,
        startAtUtc: "2026-09-03T06:00:00.000Z",
        endAtUtc: "2026-09-03T07:00:00.000Z",
      }).success,
    ).toBe(false);

    expect(
      decideMeetingRequestBodySchema.safeParse({
        revisionId: 9,
        revisionRowVersion: "0x0000000000000001",
      }).success,
    ).toBe(true);
  });

  it("bounds schedule reads so the endpoint cannot be used as an unbounded dump", () => {
    expect(
      meetingScheduleQuerySchema.safeParse({
        fromAtUtc: "2026-09-01T00:00:00.000Z",
        toAtUtc: "2026-12-31T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
