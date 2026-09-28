import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import * as database from "../../src/database/sql.js";
import { meetingSchedulingRepository } from "../../src/modules/meetings/meeting-scheduling.repository.js";

function capture(rows: unknown[] = []) {
  const query = vi.fn(async (_sql: string) => ({ recordset: rows }));
  const request = { input: vi.fn(), query };
  request.input.mockImplementation(() => request);
  vi.spyOn(database, "getDatabasePool").mockResolvedValue({
    request: () => request,
  } as unknown as Awaited<ReturnType<typeof database.getDatabasePool>>);
  return { query, request };
}

afterEach(() => vi.restoreAllMocks());

describe("Participant schedule conflict query contract", () => {
  it("uses only current approved scheduled Meetings and strict overlap boundaries", async () => {
    const { query, request } = capture();

    await meetingSchedulingRepository.findParticipantScheduleConflicts({
      participantUserIds: [21, 22, 22],
      startAtUtc: new Date("2026-09-28T07:00:00.000Z"),
      endAtUtc: new Date("2026-09-28T08:00:00.000Z"),
      excludeMeetingId: 127,
    });

    const text = query.mock.calls[0]![0];
    assert.match(text, /revision\.id = meeting\.current_revision_id/);
    assert.match(text, /meeting\.status = 'SCHEDULED'/);
    assert.match(text, /revision\.revision_status = 'APPROVED'/);
    assert.match(text, /revision\.start_at_utc < @endAtUtc/);
    assert.match(text, /revision\.end_at_utc > @startAtUtc/);
    assert.match(text, /meeting\.id <> @excludeMeetingId/);
    assert.match(text, /attendee\.attendee_user_id = selected\.user_id/);
    assert.match(text, /portal\.IS_ACTIVE = 1/);

    const participantInputs = request.input.mock.calls.filter(
      (args) => String(args[0]).startsWith("participantUserId"),
    );
    assert.equal(participantInputs.length, 2);
    assert.equal(request.input.mock.calls.find((args) => args[0] === "excludeMeetingId")?.[2], 127);
  });

  it("does not select private Meeting content", async () => {
    const { query } = capture();

    await meetingSchedulingRepository.findParticipantScheduleConflicts({
      participantUserIds: [21],
      startAtUtc: new Date("2026-09-28T07:00:00.000Z"),
      endAtUtc: new Date("2026-09-28T08:00:00.000Z"),
      excludeMeetingId: null,
    });

    const text = query.mock.calls[0]![0];
    const selectClause = text.slice(text.indexOf("SELECT\n        attendee"), text.indexOf("\n      FROM selected_participants"));
    assert.doesNotMatch(selectClause, /meeting\.title|room_id|organizer_user_id|description|scheduling_notes/i);
  });
});
