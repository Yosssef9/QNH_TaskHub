import { AppError } from "../../shared/errors/app-error.js";
import type { MeetingReportData, MeetingReportRequest, MeetingReportSources, MeetingReportStage } from "./meeting-report.types.js";
import type { MeetingDetail } from "../meetings/meeting-workspace.types.js";

export function meetingReportStage(detail: MeetingDetail, now: Date): MeetingReportStage {
  const { meeting } = detail;
  if (meeting.status !== "SCHEDULED") return meeting.status;
  if (Date.parse(meeting.startAtUtc) > now.getTime()) return "BEFORE_START";
  if (Date.parse(meeting.endAtUtc) > now.getTime()) return "IN_PROGRESS";
  return "ENDED";
}

/** Collect live, authorized data. An empty section is valid; a failed query is not empty data. */
export function createMeetingReportBuilder(sources: MeetingReportSources, clock = () => new Date()) {
  return async (request: MeetingReportRequest): Promise<MeetingReportData> => {
    if (!Number.isSafeInteger(request.meetingId) || request.meetingId <= 0) {
      throw new AppError({ statusCode: 400, code: "VALIDATION_ERROR", message: "A valid Meeting ID is required." });
    }
    const { actor, access, meetingId } = request;
    // Do not run other data reads or start Chromium before the visibility check.
    await sources.authorize(actor.userId, access, meetingId);
    const [detail, followUp, actions, attachments, family] = await Promise.all([
      sources.detail(actor.userId, access, meetingId),
      sources.followUp(actor.userId, access, meetingId),
      sources.actionItems(actor.userId, access, meetingId),
      sources.attachments(actor.userId, access, meetingId),
      sources.relatedMeetings(actor.userId, access, meetingId),
    ]);
    await sources.authorize(actor.userId, access, meetingId);

    const generatedAt = clock();
    const attendanceSummary = { total: detail.attendance.length, NOT_MARKED: 0, ATTENDED: 0, ABSENT: 0 };
    for (const row of detail.attendance) attendanceSummary[row.status] += 1;
    // Derive totals from the exact Action Item list being printed, rather than a separately timed query.
    const reportFollowUp = {
      ...followUp,
      summary: {
        decisions: followUp.decisions.length,
        actionItems: actions.items.length,
        completed: actions.items.filter((item) => item.status === "DONE").length,
        overdue: actions.items.filter((item) => item.isOverdue).length,
      },
    };
    return {
      generationMode: request.generationMode ?? "MANUAL",
      generatedAtUtc: generatedAt.toISOString(),
      generatedBy: actor,
      language: request.language,
      timeFormat: request.timeFormat,
      timeZone: request.timeZone,
      stage: meetingReportStage(detail, generatedAt),
      detail,
      attendanceSummary,
      followUp: reportFollowUp,
      actionItems: actions.items,
      attachments,
      // Source service already filters each related Meeting. Do not print the current Meeting twice.
      relatedMeetings: family.items.filter((item) => item.id !== meetingId && !item.isCurrent),
    };
  };
}

