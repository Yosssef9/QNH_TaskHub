import type { RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { MeetingReportParams } from "./meeting-report.schemas.js";
import { meetingReportScheduleService } from "./meeting-report-schedule.service.js";

export const getMeetingReportSchedule: RequestHandler = async (req, res) => {
  if (!req.authContext) {
    throw new AppError({ statusCode: 500, code: "AUTH_CONTEXT_MISSING", message: "Authenticated TaskHub access was not resolved." });
  }
  const { meetingId } = getValidatedRequestPart<MeetingReportParams>(req, "params");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  const data = await meetingReportScheduleService.get(req.authContext.user.userId, req.authContext.access, meetingId);
  res.status(200).json({ success: true, data });
};
