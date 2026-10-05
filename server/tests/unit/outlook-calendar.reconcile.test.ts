import { describe, expect, it } from "vitest";

import {
  compareOutlookEvent,
  observeOutlookEvent,
} from "../../src/modules/outlook-calendar/outlook-calendar.reconcile.js";
import type { OutlookMeetingProjection } from "../../src/modules/outlook-calendar/outlook-calendar.types.js";

const projection: OutlookMeetingProjection = {
  meetingId: 12,
  title: "JCI Meeting",
  description: "Review the action plan",
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
  startAtUtc: "2026-10-05T07:00:00.000Z",
  endAtUtc: "2026-10-05T08:00:00.000Z",
  attendees: [
    { userId: 573, userName: "Yasser Hamza", email: "YASSER@qnhospital.com.sa" },
    { userId: 750, userName: "Sami Mubarak", email: "sami@qnhospital.com.sa" },
  ],
};

const meetingUrl = "http://10.0.110.28:4000/TaskHub/meetings/12";

function graphEvent() {
  return {
    id: "event-12",
    subject: "JCI Meeting",
    body: {
      contentType: "html",
      content: `<p>Review the action plan</p><p><a href="${meetingUrl}">Open Meeting in TaskHub</a></p>`,
    },
    start: { dateTime: "2026-10-05T07:00:00.0000000", timeZone: "UTC" },
    end: { dateTime: "2026-10-05T08:00:00.0000000", timeZone: "UTC" },
    location: { displayName: "IT Office / مكتب تقنية المعلومات — Second floor" },
    attendees: [
      { emailAddress: { address: "sami@qnhospital.com.sa", name: "Different display name" }, status: { response: "accepted" } },
      { emailAddress: { address: "yasser@qnhospital.com.sa", name: "Yasser Hamza" }, status: { response: "declined" } },
    ],
    changeKey: "changed-because-response-status-can-change",
  };
}

describe("Outlook Calendar reconciliation", () => {
  it("ignores attendee response status and display-name changes", () => {
    const observed = observeOutlookEvent(graphEvent(), projection, meetingUrl);
    expect(compareOutlookEvent(projection, observed.projection, meetingUrl)).toEqual([]);
  });

  it("detects TaskHub-controlled schedule, location and membership drift", () => {
    const event = graphEvent();
    event.start.dateTime = "2026-10-05T07:30:00.0000000";
    event.location.displayName = "Board Room";
    event.attendees = event.attendees.slice(0, 1);

    const observed = observeOutlookEvent(event, projection, meetingUrl);
    expect(compareOutlookEvent(projection, observed.projection, meetingUrl).map((item) => item.field))
      .toEqual(["START", "LOCATION", "ATTENDEES"]);
  });

  it("detects removal of TaskHub-managed body content", () => {
    const event = graphEvent();
    event.body.content = "<p>Manually replaced in Outlook</p>";

    const observed = observeOutlookEvent(event, projection, meetingUrl);
    expect(compareOutlookEvent(projection, observed.projection, meetingUrl).map((item) => item.field))
      .toEqual(["TASKHUB_LINK", "DESCRIPTION"]);
  });
});
