import { describe, expect, it } from "vitest";

import {
  isValidZoomJoinUrl,
  normalizeZoomJoinUrl,
} from "../../src/modules/meetings/meeting-online-location.js";
import { createMeetingBodySchema } from "../../src/modules/meetings/meeting-workflow.schemas.js";
import {
  createMeetingRescheduleBodySchema,
  createMeetingTemplateBodySchema,
} from "../../src/modules/meetings/meeting-workspace.schemas.js";

describe("Zoom Meeting location rules", () => {
  it("accepts Zoom join links on zoom.us and organization vanity subdomains", () => {
    expect(isValidZoomJoinUrl("https://zoom.us/j/123456789?pwd=abc")).toBe(true);
    expect(isValidZoomJoinUrl("https://qnh.zoom.us/j/987654321")).toBe(true);
    expect(normalizeZoomJoinUrl("  https://qnh.zoom.us/j/987654321  ")).toBe(
      "https://qnh.zoom.us/j/987654321",
    );
  });

  it("rejects non-HTTPS, non-Zoom, and root-only URLs", () => {
    expect(isValidZoomJoinUrl("http://zoom.us/j/123")).toBe(false);
    expect(isValidZoomJoinUrl("https://example.com/j/123")).toBe(false);
    expect(isValidZoomJoinUrl("https://zoom.us/")).toBe(false);
  });

  it("requires a room for Room Meetings and forbids a Zoom link", () => {
    const valid = createMeetingBodySchema.safeParse({
      title: "Room review",
      meetingMode: "ROOM",
      roomId: 4,
      onlineJoinUrl: null,
      startAtUtc: "2026-10-10T07:00:00.000Z",
      endAtUtc: "2026-10-10T08:00:00.000Z",
      organizerAttending: true,
      attendeeUserIds: [],
      agendaItems: [],
    });
    expect(valid.success).toBe(true);

    expect(
      createMeetingBodySchema.safeParse({
        title: "Invalid room review",
        meetingMode: "ROOM",
        roomId: null,
        onlineJoinUrl: "https://zoom.us/j/123456789",
        startAtUtc: "2026-10-10T07:00:00.000Z",
        endAtUtc: "2026-10-10T08:00:00.000Z",
        organizerAttending: true,
        attendeeUserIds: [],
        agendaItems: [],
      }).success,
    ).toBe(false);
  });

  it("requires a Zoom link and forbids a physical room for Zoom Meetings", () => {
    const valid = createMeetingBodySchema.safeParse({
      title: "Online review",
      meetingMode: "ZOOM",
      roomId: null,
      onlineJoinUrl: "https://qnh.zoom.us/j/123456789?pwd=abc",
      startAtUtc: "2026-10-10T07:00:00.000Z",
      endAtUtc: "2026-10-10T08:00:00.000Z",
      organizerAttending: true,
      attendeeUserIds: [20],
      agendaItems: [],
    });
    expect(valid.success).toBe(true);

    expect(
      createMeetingBodySchema.safeParse({
        title: "Invalid online review",
        meetingMode: "ZOOM",
        roomId: 4,
        onlineJoinUrl: null,
        startAtUtc: "2026-10-10T07:00:00.000Z",
        endAtUtc: "2026-10-10T08:00:00.000Z",
        organizerAttending: true,
        attendeeUserIds: [20],
        agendaItems: [],
      }).success,
    ).toBe(false);
  });

  it("applies the same location rules to reschedules", () => {
    expect(
      createMeetingRescheduleBodySchema.safeParse({
        meetingRowVersion: "0x0000000000000001",
        meetingMode: "ZOOM",
        roomId: null,
        onlineJoinUrl: "https://zoom.us/j/123456789",
        startAtUtc: "2026-10-10T09:00:00.000Z",
        endAtUtc: "2026-10-10T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("lets a Template remember Zoom type but not a reusable join credential", () => {
    expect(
      createMeetingTemplateBodySchema.safeParse({
        name: "Online weekly review",
        title: "Online weekly review",
        description: null,
        durationMinutes: 60,
        meetingMode: "ZOOM",
        defaultRoomId: null,
        organizerAttending: true,
        attendeeUserIds: [20],
      }).success,
    ).toBe(true);

    expect(
      createMeetingTemplateBodySchema.safeParse({
        name: "Invalid Zoom template",
        title: "Online weekly review",
        description: null,
        durationMinutes: 60,
        meetingMode: "ZOOM",
        defaultRoomId: 4,
        organizerAttending: true,
        attendeeUserIds: [20],
      }).success,
    ).toBe(false);
  });
});
