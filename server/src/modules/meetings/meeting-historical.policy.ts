import { AppError } from "../../shared/errors/app-error.js";
import { assertSchedulableMeetingWindow, assertValidMeetingScheduleWindow } from "./meeting-scheduling.policy.js";

/** Only a coordinator's direct creation path may request a historical classification. */
export function classifyDirectMeetingWindow(startAtUtc: Date, endAtUtc: Date, nowUtc = new Date()): boolean {
  assertValidMeetingScheduleWindow(startAtUtc, endAtUtc);
  if (startAtUtc.getTime() > nowUtc.getTime()) {
    assertSchedulableMeetingWindow(startAtUtc, endAtUtc, nowUtc);
    return false;
  }
  if (endAtUtc.getTime() > nowUtc.getTime()) {
    throw new AppError({ statusCode: 409, code: "MEETING_ALREADY_IN_PROGRESS",
      message: "Historical Meetings must have finished. Choose an end time in the past." });
  }
  return true;
}
