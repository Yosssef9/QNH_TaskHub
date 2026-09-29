import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { renderMeetingLifecycleEmail } from "../../src/modules/email/templates/meeting-lifecycle-email.js";
import { renderMeetingSeriesScheduledEmail } from "../../src/modules/email/templates/meeting-series-scheduled-email.js";

const context = {
  taskHubUrl: "https://example.invalid/TaskHub/",
  logoUrl: "cid:qnh-taskhub-logo@qnhospital.com",
};

function lifecyclePayload() {
  return {
    meetingId: 127,
    revisionId: 14,
    meetingTitle: "Monthly Operations Review",
    organizerName: "Youssef Ibrahim",
    changedByName: "Coordinator",
    timeFormat: "12H" as const,
    roomNameAr: "القاعة الرئيسية",
    roomNameEn: "Main Board Room",
    startAtUtc: "2026-09-28T07:00:00.000Z",
    endAtUtc: "2026-09-28T08:00:00.000Z",
    previousRoomNameAr: null,
    previousRoomNameEn: null,
    previousStartAtUtc: null,
    previousEndAtUtc: null,
    href: "/meetings/127",
  };
}

describe("Meeting schedule conflict email presentation", () => {
  it("adds a privacy-safe warning to an invitation when the recipient has a conflict", () => {
    const document = renderMeetingLifecycleEmail("MEETING_INVITED", {
      ...lifecyclePayload(),
      scheduleConflict: {
        conflictCount: 2,
        overlaps: [
          { startAtUtc: "2026-09-28T07:30:00.000Z", endAtUtc: "2026-09-28T08:30:00.000Z" },
          { startAtUtc: "2026-09-28T07:45:00.000Z", endAtUtc: "2026-09-28T08:15:00.000Z" },
        ],
      },
    }, "en", context);

    assert.match(document.text, /Schedule conflict/);
    assert.match(document.text, /Conflicting time/);
    assert.match(document.text, /informational only/);
    assert.doesNotMatch(document.text, /Conflicting Meeting title|Other Meeting room/i);
    assert.match(document.html, /#FFF8E8/);
  });

  it("does not add the warning to a conflict-free invitation", () => {
    const document = renderMeetingLifecycleEmail("MEETING_INVITED", {
      ...lifecyclePayload(),
      scheduleConflict: null,
    }, "en", context);
    assert.doesNotMatch(document.text, /Schedule conflict/);
  });

  it("renders the reschedule warning in Arabic", () => {
    const document = renderMeetingLifecycleEmail("MEETING_RESCHEDULED", {
      ...lifecyclePayload(),
      scheduleConflict: {
        conflictCount: 1,
        overlaps: [{ startAtUtc: "2026-09-28T07:30:00.000Z", endAtUtc: "2026-09-28T08:30:00.000Z" }],
      },
    }, "ar", context);
    assert.match(document.text, /تعارض في الموعد/);
    assert.match(document.html, /dir="rtl"/);
  });

  it("uses the Zoom join URL as the invitation action for an authorized Zoom recipient", () => {
    const document = renderMeetingLifecycleEmail("MEETING_INVITED", {
      ...lifecyclePayload(),
      meetingMode: "ZOOM",
      roomNameAr: null,
      roomNameEn: null,
      onlineJoinUrl: "https://qnh.zoom.us/j/123456789?pwd=abc",
      scheduleConflict: null,
    }, "en", context);

    assert.match(document.text, /Zoom Meeting/);
    assert.match(document.text, /Join Zoom Meeting: https:\/\/qnh\.zoom\.us\/j\/123456789\?pwd=abc/);
    assert.match(document.html, /Join Zoom Meeting/);
    assert.match(document.html, /https:\/\/qnh\.zoom\.us\/j\/123456789\?pwd=abc/);
  });

  it("marks only conflicting Series occurrences and keeps the grouped message recipient-specific", () => {
    const document = renderMeetingSeriesScheduledEmail({
      seriesId: 9,
      seriesTitle: "Weekly Operations",
      organizerName: "Youssef Ibrahim",
      recipientName: "Sara Ali",
      timeFormat: "24H",
      meetingCount: 2,
      opensSeries: false,
      href: "/meetings/501",
      meetings: [
        {
          meetingId: 501,
          sequenceNumber: 1,
          title: "Weekly Operations",
          startAtUtc: "2026-10-01T07:00:00.000Z",
          endAtUtc: "2026-10-01T08:00:00.000Z",
          roomNameAr: "قاعة أ",
          roomNameEn: "Room A",
          scheduleConflict: {
            conflictCount: 1,
            overlaps: [{ startAtUtc: "2026-10-01T07:30:00.000Z", endAtUtc: "2026-10-01T08:30:00.000Z" }],
          },
        },
        {
          meetingId: 502,
          sequenceNumber: 2,
          title: "Weekly Operations",
          startAtUtc: "2026-10-08T07:00:00.000Z",
          endAtUtc: "2026-10-08T08:00:00.000Z",
          roomNameAr: "قاعة أ",
          roomNameEn: "Room A",
          scheduleConflict: null,
        },
      ],
    }, "en", context);

    assert.match(document.text, /#1 .*Schedule conflict/);
    assert.doesNotMatch(document.text, /#2 .*Schedule conflict/);
    assert.match(document.text, /Conflicting time/);
  });
});
