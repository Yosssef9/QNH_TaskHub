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

  it("shows exact unmatched attendee addresses even when counts match", () => {
    const event = graphEvent();
    event.attendees = event.attendees.map((attendee) => ({
      ...attendee,
      emailAddress: {
        ...attendee.emailAddress,
        address: attendee.emailAddress.address.replace(".com.sa", ".com"),
      },
    }));

    const observed = observeOutlookEvent(event, projection, meetingUrl);
    const differences = compareOutlookEvent(projection, observed.projection, meetingUrl);
    expect(differences).toEqual([{
      field: "ATTENDEES",
      taskHubValue: "2",
      outlookValue: "2",
      onlyInTaskHub: ["sami@qnhospital.com.sa", "yasser@qnhospital.com.sa"],
      onlyInOutlook: ["sami@qnhospital.com", "yasser@qnhospital.com"],
    }]);
  });

  it("reports a single added attendee without inventing changes on the other side", () => {
    const event = graphEvent();
    event.attendees = [
      ...event.attendees,
      { emailAddress: { address: "extra@qnhospital.com.sa", name: "Extra" }, status: { response: "none" } },
    ];
    const observed = observeOutlookEvent(event, projection, meetingUrl);
    const diff = compareOutlookEvent(projection, observed.projection, meetingUrl);
    expect(diff.find((item) => item.field === "ATTENDEES")).toMatchObject({
      taskHubValue: "2",
      outlookValue: "3",
      onlyInTaskHub: [],
      onlyInOutlook: ["extra@qnhospital.com.sa"],
    });
  });

  it("returns actual TaskHub description and Outlook text preview instead of vague labels", () => {
    const event = graphEvent();
    event.body.content = "<p>Manually replaced in Outlook</p>";
    const observed = observeOutlookEvent(event, projection, meetingUrl);
    const serialized = JSON.stringify(observed.projection);
    const differences = compareOutlookEvent(projection, observed.projection, meetingUrl);
    expect(differences.find((item) => item.field === "DESCRIPTION")).toEqual({
      field: "DESCRIPTION",
      taskHubValue: "Review the action plan",
      outlookValue: "Manually replaced in Outlook",
    });
    expect(JSON.parse(serialized).bodyTextPreview).toBe("Manually replaced in Outlook");
  });

  it("preserves compatibility with older stored Outlook observations without a body preview", () => {
    const event = graphEvent();
    event.body.content = "<p>Updated elsewhere</p>";
    const oldProjection = observeOutlookEvent(event, projection, meetingUrl).projection;
    delete oldProjection.bodyTextPreview;
    const diff = compareOutlookEvent(projection, oldProjection, meetingUrl);
    expect(diff.find((item) => item.field === "DESCRIPTION")).toMatchObject({
      field: "DESCRIPTION",
      outlookValueUnavailable: true,
    });
  });

  it("detects removal of TaskHub-managed body content", () => {
    const event = graphEvent();
    event.body.content = "<p>Manually replaced in Outlook</p>";

    const observed = observeOutlookEvent(event, projection, meetingUrl);
    expect(compareOutlookEvent(projection, observed.projection, meetingUrl).map((item) => item.field))
      .toEqual(["TASKHUB_LINK", "DESCRIPTION"]);
  });
});
