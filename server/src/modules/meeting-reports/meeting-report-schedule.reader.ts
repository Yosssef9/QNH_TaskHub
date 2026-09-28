import { AppError } from "../../shared/errors/app-error.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import { projectMeetingReportSchedule } from "./meeting-report-schedule.policy.js";
import type { MeetingReportScheduleSources } from "./meeting-report-schedule.types.js";

/** Purely read-only. No scheduler, PDF render, outbox insert or email send occurs here. */
export function createMeetingReportScheduleReader(
  sources: MeetingReportScheduleSources,
  options: { automaticDeliveryEnabled: boolean; timeZone: string },
) {
  return async (actorUserId: number, access: TaskHubAccess, meetingId: number) => {
    if (!Number.isSafeInteger(meetingId) || meetingId <= 0) {
      throw new AppError({ statusCode: 400, code: "VALIDATION_ERROR", message: "A valid Meeting ID is required." });
    }
    await sources.authorize(actorUserId, access, meetingId);
    const runtime = sources.runtime ? await sources.runtime() : undefined;
    const snapshot = await sources.snapshot(meetingId);
    if (!snapshot || snapshot.meetingId !== meetingId) {
      throw new AppError({ statusCode: 404, code: "MEETING_NOT_FOUND", message: "Meeting was not found." });
    }
    const { context } = await sources.authorize(actorUserId, access, meetingId);
    if (context.meetingRowVersion !== snapshot.meetingRowVersion || context.status !== snapshot.meetingStatus ||
        (snapshot.approvedRevisionId !== null && context.currentRevisionId !== snapshot.approvedRevisionId)) {
      throw new AppError({ statusCode: 409, code: "MEETING_REPORT_SCHEDULE_STALE", message: "The Meeting changed while report status was loading. Refresh to see its current schedule." });
    }
    return projectMeetingReportSchedule(snapshot, { ...options, ...runtime });
  };
}

