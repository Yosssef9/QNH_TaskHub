import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthMeData } from "../../src/modules/auth/auth.types.js";
import { exportMeetingReportPdf } from "../../src/modules/meeting-reports/meeting-report.controller.js";
import { meetingReportService } from "../../src/modules/meeting-reports/meeting-report.service.js";
import { meetingReportParamsSchema, meetingReportQuerySchema } from "../../src/modules/meeting-reports/meeting-report.schemas.js";
import { validateRequest } from "../../src/middleware/validate.middleware.js";
import { errorMiddleware } from "../../src/middleware/error.middleware.js";
import { AppError } from "../../src/shared/errors/app-error.js";

vi.mock("../../src/modules/meeting-reports/meeting-report.service.js", () => ({ meetingReportService: { exportPdf: vi.fn() } }));

const actor: AuthMeData = {
  user: { userId: 200, userCode: "U200", userName: "Authenticated User", email: null },
  access: { roleCode: "USER", permissions: [] },
  preferences: {
    languageCode: "AR", theme: "LIGHT", sidebarCollapsed: false, calendarShowAdjacentDates: true,
    meetingStartReminderEnabled: true, timeFormat: "24H", meetingScheduleSlotInterval: 30, timezone: "Asia/Riyadh",
  },
};

// Exercises the real controller, validation and error middleware; authentication is supplied by a fixture.
function testApp(authenticated = true) {
  const app = express();
  app.get("/meetings/:meetingId/report.pdf", (req, _res, next) => {
    if (authenticated) req.authContext = actor;
    next();
  }, validateRequest({ params: meetingReportParamsSchema, query: meetingReportQuerySchema }), exportMeetingReportPdf);
  app.use(errorMiddleware);
  return app;
}

beforeEach(() => {
  vi.mocked(meetingReportService.exportPdf).mockReset().mockResolvedValue({
    buffer: Buffer.from("%PDF-1.7\nreport test"), fileName: "Meeting-127-Report-AR.pdf",
  });
});

describe("Meeting report PDF HTTP response", () => {
  it("returns a non-cacheable attachment using the authenticated actor and saved preferences", async () => {
    const response = await request(testApp()).get("/meetings/127/report.pdf");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="Meeting-127-Report-AR.pdf"');
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(meetingReportService.exportPdf).toHaveBeenCalledWith(expect.objectContaining({
      meetingId: 127, actor: { userId: 200, userCode: "U200", userName: "Authenticated User" },
      language: "ar", timeFormat: "24H", timeZone: "Asia/Riyadh",
    }), expect.any(AbortSignal));
  });

  it("uses the requested current UI language", async () => {
    expect((await request(testApp()).get("/meetings/127/report.pdf?language=en")).status).toBe(200);
    expect(meetingReportService.exportPdf).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }), expect.any(AbortSignal));
  });

  it("validates the request before invoking PDF generation", async () => {
    expect((await request(testApp()).get("/meetings/127/report.pdf?actorUserId=100")).status).toBe(400);
    expect((await request(testApp()).get("/meetings/not-a-number/report.pdf")).status).toBe(400);
    expect(meetingReportService.exportPdf).not.toHaveBeenCalled();
  });

  it("does not emit a PDF when access is denied", async () => {
    vi.mocked(meetingReportService.exportPdf).mockRejectedValue(new AppError({ statusCode: 404, code: "MEETING_NOT_FOUND", message: "Meeting not found." }));
    const response = await request(testApp()).get("/meetings/127/report.pdf");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("MEETING_NOT_FOUND");
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toBeUndefined();
  });

  it("returns a retry hint when renderer capacity is exhausted", async () => {
    vi.mocked(meetingReportService.exportPdf).mockRejectedValue(new AppError({ statusCode: 429, code: "MEETING_REPORT_BUSY", message: "Busy" }));
    const response = await request(testApp()).get("/meetings/127/report.pdf");
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("5");
  });

  it("fails closed when the authentication context is missing", async () => {
    expect((await request(testApp(false)).get("/meetings/127/report.pdf")).status).toBe(500);
    expect(meetingReportService.exportPdf).not.toHaveBeenCalled();
  });
});
