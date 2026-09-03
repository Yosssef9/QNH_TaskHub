import { describe, expect, it } from "vitest";

import {
  createMeetingRoomBodySchema,
  meetingAvailabilityBodySchema,
} from "../../src/modules/meetings/meetings.schemas.js";

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


describe("Meeting Room schema", () => {
  const baseRoom = {
    code: "ROOM-A",
    nameAr: "قاعة أ",
    nameEn: "Room A",
    locationText: null,
    capacity: 12,
    equipmentNotes: null,
    isActive: true,
  };

  it("accepts an explicit supported room color", () => {
    const result = createMeetingRoomBodySchema.safeParse({
      ...baseRoom,
      colorKey: "PURPLE",
    });

    expect(result.success).toBe(true);
  });

  it("accepts no room color so the server can auto-assign one", () => {
    const result = createMeetingRoomBodySchema.safeParse({
      ...baseRoom,
      colorKey: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a room color outside the controlled palette", () => {
    const result = createMeetingRoomBodySchema.safeParse({
      ...baseRoom,
      colorKey: "NEON_ORANGE",
    });

    expect(result.success).toBe(false);
  });
});
