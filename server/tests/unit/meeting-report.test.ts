import { describe, expect, it, vi } from "vitest";
import { createMeetingReportBuilder, meetingReportStage } from "../../src/modules/meeting-reports/meeting-report.builder.js";
import { createMeetingReportLimiter } from "../../src/modules/meeting-reports/meeting-report.limits.js";
import { meetingReportParamsSchema, meetingReportQuerySchema } from "../../src/modules/meeting-reports/meeting-report.schemas.js";
import { renderMeetingReportDocument } from "../../src/modules/meeting-reports/meeting-report.template.js";
import type { MeetingReportRequest, MeetingReportSources } from "../../src/modules/meeting-reports/meeting-report.types.js";
import { sampleMeetingReport } from "../../src/modules/meeting-reports/scripts/sample-data.js";

function fixture() {
  const sample = sampleMeetingReport();
  const sources: MeetingReportSources = {
    authorize: vi.fn(async () => undefined),
    detail: vi.fn(async () => structuredClone(sample.detail)),
    followUp: vi.fn(async () => structuredClone(sample.followUp)),
    actionItems: vi.fn(async () => ({ items: structuredClone(sample.actionItems), canCreate: false })),
    attachments: vi.fn(async () => structuredClone(sample.attachments)),
    relatedMeetings: vi.fn(async () => ({ items: structuredClone(sample.relatedMeetings) })),
  };
  const request: MeetingReportRequest = {
    meetingId: 127, actor: sample.generatedBy,
    access: { roleCode: "USER", permissions: [], meetingOrganizeEnabled: false, meetingCoordinateEnabled: false },
    language: "en", timeFormat: "12H", timeZone: "Asia/Riyadh",
  };
  return { sample, sources, request, build: createMeetingReportBuilder(sources, () => new Date(sample.generatedAtUtc)) };
}

describe("Meeting report authorization and data", () => {
  it("authorizes before reading any content and again after reads", async () => {
    const { sources, request, build } = fixture();
    await build(request);
    expect(sources.authorize).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sources.authorize).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sources.detail).mock.invocationCallOrder[0]!);
    expect(sources.authorize).toHaveBeenCalledWith(200, request.access, 127);
  });

  it("does not read any report section when Meeting access is denied", async () => {
    const { sources, request, build } = fixture();
    vi.mocked(sources.authorize).mockRejectedValue(new Error("MEETING_NOT_FOUND"));
    await expect(build(request)).rejects.toThrow("MEETING_NOT_FOUND");
    for (const read of [sources.detail, sources.followUp, sources.actionItems, sources.attachments, sources.relatedMeetings]) {
      expect(read).not.toHaveBeenCalled();
    }
  });

  it("rejects if authorization is lost during collection", async () => {
    const { sources, request, build } = fixture();
    vi.mocked(sources.authorize).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("MEETING_NOT_FOUND"));
    await expect(build(request)).rejects.toThrow("MEETING_NOT_FOUND");
  });

  it("does not disguise a failed section read as an empty section", async () => {
    const { sources, request, build } = fixture();
    vi.mocked(sources.attachments).mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    await expect(build(request)).rejects.toThrow("DATABASE_UNAVAILABLE");
  });

  it("retains all authorized Action Items, counts attendance and omits the current related Meeting", async () => {
    const { sample, sources, request, build } = fixture();
    vi.mocked(sources.relatedMeetings).mockResolvedValue({ items: [
      { ...sample.relatedMeetings[0]!, id: 127, isCurrent: true }, ...sample.relatedMeetings,
    ] });
    const result = await build(request);
    expect(result.actionItems).toHaveLength(3);
    expect(result.actionItems.some((item) => item.assigneeUserId !== request.actor.userId)).toBe(true);
    expect(result.followUp.summary).toEqual({ actionItems: 3, completed: 1, overdue: 0, decisions: 2 });
    expect(result.attendanceSummary).toEqual({ total: 4, ATTENDED: 2, ABSENT: 1, NOT_MARKED: 1 });
    expect(result.relatedMeetings.every((item) => item.id !== 127)).toBe(true);
    expect(result.generatedBy).toEqual(request.actor);
  });

  it.each(["PENDING_APPROVAL", "SCHEDULED", "REJECTED", "CANCELLED"] as const)("does not restrict export based on %s lifecycle", async (status) => {
    const { sources, sample, request, build } = fixture();
    sample.detail.meeting.status = status;
    vi.mocked(sources.detail).mockResolvedValue(sample.detail);
    await expect(build(request)).resolves.toMatchObject({ detail: { meeting: { status } } });
  });

  it("distinguishes scheduled time periods without adding a Meeting status", () => {
    const { sample } = fixture();
    expect(meetingReportStage(sample.detail, new Date("2026-09-27T05:59:59Z"))).toBe("BEFORE_START");
    expect(meetingReportStage(sample.detail, new Date("2026-09-27T06:00:00Z"))).toBe("IN_PROGRESS");
    expect(meetingReportStage(sample.detail, new Date("2026-09-27T07:00:00Z"))).toBe("ENDED");
  });
});

describe("Meeting report template and request validation", () => {
  it("keeps all numbered sections and escapes content rather than running stored HTML", () => {
    const report = sampleMeetingReport();
    report.detail.meeting.title = '<script>privateData()</script>';
    report.followUp.notes!.notesText = '<iframe src="file:///secret"> & notes';
    const { html, footerTemplate } = renderMeetingReportDocument(report, { logoDataUrl: "https://example.invalid/logo.png" });
    expect((html.match(/<section id=/g) ?? []).length).toBe(10);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("example.invalid/logo.png");
    expect(html).toContain("Content-Security-Policy");
    expect(footerTemplate).toContain('class="pageNumber"');
    expect(footerTemplate).toContain('class="totalPages"');
  });

  it("renders Arabic RTL with explicit empty states", () => {
    const report = sampleMeetingReport("ar");
    report.detail.agendaItems = [];
    report.followUp.decisions = [];
    report.followUp.notes = null;
    report.actionItems = [];
    const { html } = renderMeetingReportDocument(report);
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect((html.match(/class="empty"/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain("undefined");
  });

  it.each(["0", "-1", "1.5", "NaN", "9007199254740992"])("rejects invalid Meeting ID %s", (meetingId) => {
    expect(meetingReportParamsSchema.safeParse({ meetingId }).success).toBe(false);
  });

  it("accepts only the optional language, not actor, HTML or URL input", () => {
    expect(meetingReportQuerySchema.safeParse({}).success).toBe(true);
    expect(meetingReportQuerySchema.safeParse({ language: "ar" }).success).toBe(true);
    expect(meetingReportQuerySchema.safeParse({ language: "fr" }).success).toBe(false);
    for (const key of ["actorUserId", "html", "url", "timeZone"]) {
      expect(meetingReportQuerySchema.safeParse({ [key]: "untrusted" }).success).toBe(false);
    }
  });
});

describe("Meeting PDF capacity", () => {
  it("rejects duplicate actor requests and frees a slot after failure", async () => {
    const limiter = createMeetingReportLimiter(2);
    let release: () => void = () => {};
    const running = limiter.run(200, () => new Promise<void>((resolve) => { release = resolve; }));
    await expect(limiter.run(200, async () => undefined)).rejects.toMatchObject({ code: "MEETING_REPORT_BUSY", statusCode: 429 });
    release(); await running;
    await expect(limiter.run(200, async () => { throw new Error("renderer error"); })).rejects.toThrow("renderer error");
    await expect(limiter.run(200, async () => "OK")).resolves.toBe("OK");
  });
});
