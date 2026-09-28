import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { meetingActionItemsService } from "../meeting-action-items/meeting-action-items.service.js";
import { meetingFollowUpService } from "../meeting-followup/meeting-followup.service.js";
import { requireMeetingContentAccess } from "../meetings/meeting-content-access.js";
import { meetingWorkspaceService } from "../meetings/meeting-workspace.service.js";
import { loadMeetingReportLogo } from "./meeting-report.assets.js";
import { createMeetingReportBuilder } from "./meeting-report.builder.js";
import { createMeetingReportLimiter } from "./meeting-report.limits.js";
import { createMeetingReportRenderer } from "./meeting-report.renderer.js";
import { renderMeetingReportDocument } from "./meeting-report.template.js";
import type { MeetingReportData, MeetingReportPdf, MeetingReportRequest } from "./meeting-report.types.js";

const buildReport = createMeetingReportBuilder({
  authorize: requireMeetingContentAccess,
  detail: (actor, access, id) => meetingWorkspaceService.getDetail(actor, access, id),
  followUp: (actor, access, id) => meetingFollowUpService.get(actor, access, id),
  actionItems: (actor, access, id) => meetingActionItemsService.list(actor, access, id),
  attachments: (actor, access, id) => meetingWorkspaceService.listAttachments(actor, access, id),
  relatedMeetings: (actor, access, id) => meetingFollowUpService.relatedMeetings(actor, access, id),
});
const limiter = createMeetingReportLimiter(env.MEETING_REPORT_MAX_CONCURRENT);
const renderPdf = createMeetingReportRenderer({
  executablePath: env.MEETING_REPORT_BROWSER_EXECUTABLE,
  channel: env.MEETING_REPORT_BROWSER_CHANNEL,
  timeoutMs: env.MEETING_REPORT_TIMEOUT_MS,
});

/** Shared engine for manual download and automatic mail. No persistent PDF files are created. */
async function generate(request: MeetingReportRequest, signal?: AbortSignal, expected?: { revisionId: number; scheduledEndAtUtc: string }): Promise<{ pdf: MeetingReportPdf; data: MeetingReportData }> {
  return limiter.run(request.actor.userId, async () => {
    const data = await buildReport(request);
    if (expected && (data.detail.meeting.revisionId !== expected.revisionId ||
        Date.parse(data.detail.meeting.endAtUtc) !== Date.parse(expected.scheduledEndAtUtc) || data.stage !== "ENDED")) {
      throw new AppError({ statusCode: 409, code: "MEETING_REPORT_SCHEDULE_CHANGED", message: "The approved schedule changed during report collection." });
    }
    if (signal?.aborted) throw new AppError({ statusCode: 499, code: "MEETING_REPORT_ABORTED", message: "Report generation was cancelled." });
    const logoDataUrl = await loadMeetingReportLogo(env.MEETING_REPORT_LOGO_PATH);
    const buffer = await renderPdf(renderMeetingReportDocument(data, { logoDataUrl }), signal);
    await requireMeetingContentAccess(request.actor.userId, request.access, request.meetingId);
    return { pdf: { buffer, fileName: `Meeting-${request.meetingId}-Report-${request.language.toUpperCase()}.pdf` }, data };
  });
}

export const meetingReportService = {
  async exportPdf(request: MeetingReportRequest, signal?: AbortSignal): Promise<MeetingReportPdf> {
    return (await generate(request, signal)).pdf;
  },

  async exportForEmail(request: MeetingReportRequest, expected: { revisionId: number; scheduledEndAtUtc: string }, signal?: AbortSignal) {
    return generate({ ...request, generationMode: "AUTOMATIC" }, signal, expected);
  },
};

