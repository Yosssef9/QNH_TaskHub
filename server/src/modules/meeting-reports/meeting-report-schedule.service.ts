import { env } from "../../config/env.js";
import { requireMeetingContentAccess } from "../meetings/meeting-content-access.js";
import { meetingReportAutomationRuntime } from "./meeting-report-email.service.js";
import { createMeetingReportScheduleReader } from "./meeting-report-schedule.reader.js";
import { meetingReportScheduleRepository } from "./meeting-report-schedule.repository.js";

export const meetingReportScheduleService = {
  get: createMeetingReportScheduleReader({
    authorize: requireMeetingContentAccess,
    runtime: meetingReportAutomationRuntime,
    snapshot: (meetingId) => meetingReportScheduleRepository.snapshot(meetingId),
  }, {
    automaticDeliveryEnabled: false, // Overridden by effective runtime configuration after authorization.
    timeZone: env.APP_TIME_ZONE,
  }),
};

