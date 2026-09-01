import { describe, expect, it } from "vitest";

import {
  cancelMeetingBodySchema,
  createMeetingRescheduleBodySchema,
  createMeetingTemplateBodySchema,
  updateMeetingTemplateBodySchema,
} from "../../src/modules/meetings/meeting-workspace.schemas.js";

describe("Meeting workspace schemas", () => {
  it("accepts a revision-based reschedule request", () => {
    const result = createMeetingRescheduleBodySchema.safeParse({
      meetingRowVersion: "0x0000000000000001",
      roomId: 7,
      startAtUtc: "2026-09-10T08:00:00.000Z",
      endAtUtc: "2026-09-10T09:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid reschedule window", () => {
    const result = createMeetingRescheduleBodySchema.safeParse({
      meetingRowVersion: "0x0000000000000001",
      roomId: 7,
      startAtUtc: "2026-09-10T09:00:00.000Z",
      endAtUtc: "2026-09-10T08:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("requires Meeting concurrency for cancellation", () => {
    expect(cancelMeetingBodySchema.safeParse({ meetingRowVersion: "bad" }).success).toBe(false);
    expect(
      cancelMeetingBodySchema.safeParse({
        meetingRowVersion: "0x0000000000000001",
        reason: "Organizer cancelled",
      }).success,
    ).toBe(true);
  });

  it("validates personal Meeting Template bounds and row-version updates", () => {
    const values = {
      name: "Monthly IT review",
      title: "IT Monthly Review",
      description: "Reusable agenda",
      durationMinutes: 60,
      defaultRoomId: 4,
      attendeeUserIds: [11, 12],
    };
    expect(createMeetingTemplateBodySchema.safeParse(values).success).toBe(true);
    expect(
      updateMeetingTemplateBodySchema.safeParse({
        ...values,
        rowVersion: "0x0000000000000002",
      }).success,
    ).toBe(true);
    expect(createMeetingTemplateBodySchema.safeParse({ ...values, durationMinutes: 0 }).success).toBe(false);
  });
});
