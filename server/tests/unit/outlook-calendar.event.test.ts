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
