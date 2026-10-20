import { describe, expect, it } from "vitest";
import { updateHistoricalMeetingBodySchema } from "../../src/modules/meetings/meeting-historical-edit.schemas.js";
import { classifyDirectMeetingWindow } from "../../src/modules/meetings/meeting-historical.policy.js";

const input = {
  meetingRowVersion: "0x0000000000000001",
  revisionRowVersion: "0x0000000000000002",
  title: "Retrospective Meeting",
  description: null,
  meetingMode: "ROOM" as const,
  roomId: 1,
  onlineJoinUrl: null,
  startAtUtc: "2025-01-01T09:00:00Z",
  endAtUtc: "2025-01-01T10:00:00Z",
  organizerAttending: true,
  attendeeUserIds: [10],
  agendaItems: [
    { id: 100, topic: "Linked task topic", presenterUserId: 10, plannedDurationMinutes: 15 },
    { id: null, topic: "New topic", presenterUserId: null, plannedDurationMinutes: null },
  ],
};

describe("historical Meeting editing contract", () => {
  it("accepts persisted agenda IDs so an edit cannot silently recreate related topics", () => {
    const result = updateHistoricalMeetingBodySchema.parse(input);
    expect(result.agendaItems[0]?.id).toBe(100);
    expect(result.agendaItems[1]?.id).toBeNull();
  });

  it("rejects duplicate-invalid row versions and oversized titles", () => {
    expect(updateHistoricalMeetingBodySchema.safeParse({ ...input, meetingRowVersion: "invalid" }).success).toBe(false);
    expect(updateHistoricalMeetingBodySchema.safeParse({ ...input, title: "x".repeat(251) }).success).toBe(false);
  });

  it("requires historical schedules to have ended already", () => {
    expect(classifyDirectMeetingWindow(new Date(input.startAtUtc), new Date(input.endAtUtc), new Date("2025-02-01"))).toBe(true);
    expect(() => classifyDirectMeetingWindow(new Date("2025-02-01T11:00:00Z"), new Date("2025-02-01T12:00:00Z"), new Date("2025-02-01T11:30:00Z"))).toThrow();
    expect(classifyDirectMeetingWindow(new Date("2025-03-01T09:00:00Z"), new Date("2025-03-01T10:00:00Z"), new Date("2025-02-01"))).toBe(false);
  });
});
