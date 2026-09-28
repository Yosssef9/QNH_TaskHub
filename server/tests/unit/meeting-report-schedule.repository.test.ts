import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import * as database from "../../src/database/sql.js";
import { meetingReportScheduleRepository } from "../../src/modules/meeting-reports/meeting-report-schedule.repository.js";

function capture(rows: unknown[] = []) {
  const query = vi.fn(async (_sql: string) => ({ recordset: rows }));
  const request = { input: vi.fn(), query };
  request.input.mockImplementation(() => request);
  vi.spyOn(database, "getDatabasePool").mockResolvedValue({ request: () => request } as unknown as Awaited<ReturnType<typeof database.getDatabasePool>>);
  return { query, request };
}
afterEach(() => vi.restoreAllMocks());

describe("Report status query contract (no SQL Server execution)", () => {
  it("reads current approved schedule and deduped Organizer/attendees without writes", async () => {
    const { query, request } = capture();
    assert.equal(await meetingReportScheduleRepository.snapshot(127), null);
    const text = query.mock.calls[0]![0];
    assert.match(text, /revision\.id = meeting\.current_revision_id/);
    assert.match(text, /revision\.revision_status = 'APPROVED'/);
    assert.match(text, /UNION\s+SELECT attendee_user_id/);
    assert.match(text, /outbox\.dedupe_key = @prefix/);
    assert.match(text, /outbox\.template_key = @template/);
    assert.match(text, /outbox\.owner_user_id = recipients\.user_id/);
    assert.doesNotMatch(text, /\b(INSERT|UPDATE|DELETE|MERGE)\b/i);
    assert.doesNotMatch(text, /recipient_email|last_error|recipient_name/);
    assert.equal(request.input.mock.calls.find((args) => args[0] === "prefix")?.[2], "MEETING_REPORT:127:");
  });
  it("maps timestamps and outbox evidence without returning payloads", async () => {
    capture([{
      meetingId: "127", meetingStatus: "SCHEDULED", meetingRowVersion: Buffer.from("0000000000000001", "hex"),
      approvedRevisionId: "12", approvedStartAtUtc: new Date("2026-09-27T06:00:00Z"), approvedEndAtUtc: new Date("2026-09-27T07:00:00Z"),
      hasPendingReschedule: false, observedAtUtc: new Date("2026-09-27T08:00:00Z"), userId: 100,
      outboxStatus: "SENT", reportRevisionId: "12", reportEndAtUtc: "2026-09-27T07:00:00Z", attemptCount: 1,
      sentAtUtc: new Date("2026-09-27T07:31:00Z"), nextAttemptAtUtc: null,
    }]);
    const result = await meetingReportScheduleRepository.snapshot(127);
    assert.equal(result?.recipients[0]?.revisionId, 12);
    assert.equal(result?.recipients[0]?.sentAtUtc, "2026-09-27T07:31:00.000Z");
  });
});
