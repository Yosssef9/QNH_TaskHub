import type { RequestHandler } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { MeetingReportParams, MeetingReportQuery } from "./meeting-report.schemas.js";
import { meetingReportService } from "./meeting-report.service.js";

export const exportMeetingReportPdf: RequestHandler = async (req, res) => {
  if (!req.authContext) {
    throw new AppError({ statusCode: 500, code: "AUTH_CONTEXT_MISSING", message: "Authenticated TaskHub access was not resolved." });
  }
  const { meetingId } = getValidatedRequestPart<MeetingReportParams>(req, "params");
  const query = getValidatedRequestPart<MeetingReportQuery>(req, "query");
  const { user, access, preferences } = req.authContext;
  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); };
  req.once("aborted", abort);
  res.once("close", abort);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  try {
    const report = await meetingReportService.exportPdf({
      meetingId,
      actor: { userId: user.userId, userCode: user.userCode, userName: user.userName },
      access,
      language: query.language ?? (preferences.languageCode === "AR" ? "ar" : "en"),
      timeFormat: preferences.timeFormat,
      timeZone: env.APP_TIME_ZONE,
    }, controller.signal);
    if (controller.signal.aborted) return;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${report.fileName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(report.buffer);
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof AppError && error.code === "MEETING_REPORT_BUSY") res.setHeader("Retry-After", "5");
    throw error;
  } finally {
    req.off("aborted", abort);
    res.off("close", abort);
  }
};
