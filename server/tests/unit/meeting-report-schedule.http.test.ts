import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMeetingReportSchedule } from "../../src/modules/meeting-reports/meeting-report-schedule.controller.js";
import { meetingReportScheduleService } from "../../src/modules/meeting-reports/meeting-report-schedule.service.js";
import { meetingReportParamsSchema, meetingReportScheduleQuerySchema } from "../../src/modules/meeting-reports/meeting-report.schemas.js";
import { projectMeetingReportSchedule } from "../../src/modules/meeting-reports/meeting-report-schedule.policy.js";
import { validateRequest } from "../../src/middleware/validate.middleware.js";
import { errorMiddleware } from "../../src/middleware/error.middleware.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import type { AuthMeData } from "../../src/modules/auth/auth.types.js";
import { reportSnapshot } from "../fixtures/meeting-report-schedule.fixture.js";

vi.mock("../../src/modules/meeting-reports/meeting-report-schedule.service.js", () => ({ meetingReportScheduleService: { get: vi.fn() } }));
const actor: AuthMeData = {
  user: { userId: 200, userCode: "U200", userName: "Test viewer", email: null }, access: { roleCode: "USER", permissions: [] },
  preferences: { languageCode: "AR", theme: "LIGHT", sidebarCollapsed: false, calendarShowAdjacentDates: true, meetingStartReminderEnabled: true, timeFormat: "24H", meetingScheduleSlotInterval: 30, timezone: "Asia/Riyadh" },
};
function app() {
  const value = express();
  value.get('/meetings/:meetingId/report-status', (req, _res, next) => { req.authContext = actor; next(); },
    validateRequest({ params: meetingReportParamsSchema, query: meetingReportScheduleQuerySchema }), getMeetingReportSchedule);
  value.use(errorMiddleware); return value;
}
beforeEach(() => vi.mocked(meetingReportScheduleService.get).mockReset().mockResolvedValue(
  projectMeetingReportSchedule(reportSnapshot(), { automaticDeliveryEnabled: false, timeZone: "Asia/Riyadh" }),
));
describe("Report status HTTP", () => {
  it("returns non-cacheable status for the authenticated viewer, not a caller supplied identity", async () => {
    const response = await request(app()).get('/meetings/127/report-status');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.data.automaticDeliveryEnabled).toBe(false);
    expect(response.body.data.delivery.sent).toBe(0);
    expect(meetingReportScheduleService.get).toHaveBeenCalledWith(200, actor.access, 127);
  });
  it("rejects supplied status, identity and invalid IDs", async () => {
    for (const path of ['/meetings/0/report-status', '/meetings/127/report-status?sent=true', '/meetings/127/report-status?actorUserId=100']) {
      expect((await request(app()).get(path)).status).toBe(400);
    }
    expect(meetingReportScheduleService.get).not.toHaveBeenCalled();
  });
  it("returns no status when the viewer cannot read the Meeting", async () => {
    vi.mocked(meetingReportScheduleService.get).mockRejectedValue(new AppError({ statusCode: 404, code: 'MEETING_NOT_FOUND', message: 'Not found' }));
    const response = await request(app()).get('/meetings/127/report-status');
    expect(response.status).toBe(404); expect(response.body.data).toBeUndefined();
  });
});
