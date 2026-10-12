import { describe, expect, it } from "vitest";

import { buildOutlookEventPayload } from "../../src/modules/outlook-calendar/outlook-calendar.event.js";
import type { OutlookMeetingProjection } from "../../src/modules/outlook-calendar/outlook-calendar.types.js";

function meeting(overrides: Partial<OutlookMeetingProjection> = {}): OutlookMeetingProjection {
  return {
    meetingId: 12,
    title: "JCI Meeting",
    description: "Discuss <safety> & quality",
    status: "SCHEDULED",
    organizerUserId: 1080,
    organizerName: "Youssef Ibrahim",
    organizerEmail: "youssef@qnhospital.com.sa",
    revisionId: 14,
    meetingMode: "ROOM",
    roomNameAr: "مكتب تقنية المعلومات",
    roomNameEn: "IT Office",
    roomLocationText: "Second floor",
    onlineJoinUrl: null,
    startAtUtc: "2026-10-04T07:00:00.000Z",
    endAtUtc: "2026-10-04T08:00:00.000Z",
    attendees: [
      { userId: 573, userName: "Yasser Hamza", email: "yasser@qnhospital.com.sa" },
      { userId: 750, userName: "Sami Mubarak", email: null },
    ],
    ...overrides,
  };
}

describe("Outlook event payload", () => {
  it("maps Room Meetings and excludes participants without email without exposing their names", () => {
    const built = buildOutlookEventPayload(meeting(), {
      meetingUrl: "http://taskhub.local/TaskHub/meetings/12",
      transactionId: "b646a5ac-4bff-4ae0-a587-1f82731cb839",
    });

    expect(built.payload.location.displayName).toBe("IT Office / مكتب تقنية المعلومات — Second floor");
    expect(built.payload.attendees).toHaveLength(1);
    expect(built.state.missingCount).toBe(1);
    expect(built.payload.body.content).not.toContain("Sami Mubarak");
    expect(built.payload.body.content).toContain("1 TaskHub participant(s)");
    expect(built.payload.body.content).toContain("Discuss &lt;safety&gt; &amp; quality");
    expect(built.payload.transactionId).toBeTruthy();
  });

  it("creates the Outlook event using Riyadh local time while keeping the authoritative projection in UTC", () => {
    const built = buildOutlookEventPayload(
      meeting({
        startAtUtc: "2026-10-12T11:00:00.000Z",
        endAtUtc: "2026-10-12T12:00:00.000Z",
      }),
      { meetingUrl: "https://taskhub.local/meetings/12" },
    );

    expect(built.payload.start).toEqual({
      dateTime: "2026-10-12T14:00:00.000",
      timeZone: "Arab Standard Time",
    });
    expect(built.payload.end).toEqual({
      dateTime: "2026-10-12T15:00:00.000",
      timeZone: "Arab Standard Time",
    });
    expect(JSON.parse(built.state.json)).toMatchObject({
      startAtUtc: "2026-10-12T11:00:00.000Z",
      endAtUtc: "2026-10-12T12:00:00.000Z",
    });
  });

  it("converts dates across midnight and retains milliseconds", () => {
    const built = buildOutlookEventPayload(
      meeting({
        startAtUtc: "2026-12-31T22:30:15.123Z",
        endAtUtc: "2026-12-31T23:30:15.123Z",
      }),
      { meetingUrl: "https://taskhub.local/meetings/12" },
    );

    expect(built.payload.start).toEqual({
      dateTime: "2027-01-01T01:30:15.123",
      timeZone: "Arab Standard Time",
    });
    expect(built.payload.end).toEqual({
      dateTime: "2027-01-01T02:30:15.123",
      timeZone: "Arab Standard Time",
    });
  });

  it("keeps Zoom as an external Zoom location and link rather than a Teams meeting", () => {
    const built = buildOutlookEventPayload(
      meeting({ meetingMode: "ZOOM", roomNameAr: null, roomNameEn: null, roomLocationText: null, onlineJoinUrl: "https://zoom.us/j/123" }),
      { meetingUrl: "http://taskhub.local/TaskHub/meetings/12" },
    );

    expect(built.payload.location.displayName).toBe("Zoom");
    expect(built.payload.body.content).toContain("https://zoom.us/j/123");
    expect(built.payload).not.toHaveProperty("isOnlineMeeting");
  });
});
