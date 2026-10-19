import { describe, expect, it } from "vitest";
import { classifyDirectMeetingWindow } from "../../src/modules/meetings/meeting-historical.policy.js";
import { assertSchedulableMeetingWindow } from "../../src/modules/meetings/meeting-scheduling.policy.js";
import { reportEmailDisposition } from "../../src/modules/meeting-reports/meeting-report-email.policy.js";

const now = new Date("2026-10-19T09:00:00.000Z");
const date = (value: string) => new Date(value);

describe("Historical Meeting policy", () => {
  it("recognizes a fully completed Room or Zoom window without a client-provided historical flag", () => {
    expect(classifyDirectMeetingWindow(date("2026-10-18T10:00:00.000Z"), date("2026-10-18T11:00:00.000Z"), now)).toBe(true);
  });
  it("leaves future windows on the ordinary approval path", () => {
    expect(classifyDirectMeetingWindow(date("2026-10-20T10:00:00.000Z"), date("2026-10-20T11:00:00.000Z"), now)).toBe(false);
  });
  it("blocks an in-progress window even for a coordinator", () => {
    expect(() => classifyDirectMeetingWindow(date("2026-10-19T08:00:00.000Z"), date("2026-10-19T10:00:00.000Z"), now)).toThrow();
  });
  it("rejects invalid or non-quarter-hour historical schedules", () => {
    expect(() => classifyDirectMeetingWindow(date("2026-10-18T10:10:00.000Z"), date("2026-10-18T11:00:00.000Z"), now)).toThrow();
    expect(() => classifyDirectMeetingWindow(date("2026-10-18T11:00:00.000Z"), date("2026-10-18T10:00:00.000Z"), now)).toThrow();
  });
  it("preserves the past-date prohibition on ordinary schedules", () => {
    expect(() => assertSchedulableMeetingWindow(date("2026-10-18T10:00:00.000Z"), date("2026-10-18T11:00:00.000Z"), now)).toThrow();
  });
  it("prevents already-queued automatic PDF emails from being sent", () => {
    const state = {
      meetingId: 123, status: "SCHEDULED", isHistoricalEntry: true,
      revisionId: 2, startAtUtc: "2026-10-19T04:00:00.000Z",
      endAtUtc: "2026-10-19T05:00:00.000Z", observedAtUtc: now.toISOString(),
      activatedAtUtc: "2026-10-01T00:00:00.000Z", isRecipient: true,
      portalActive: true, portalUserCode: "300", ownerUserId: 20,
    };
    expect(reportEmailDisposition({meetingId: 123, recipientUserId: 20, revisionId: 2, scheduledEndAtUtc: state.endAtUtc}, state))
      .toEqual({kind: "SKIP", reason: "HISTORICAL_MEETING_NO_EMAIL"});
  });
});
