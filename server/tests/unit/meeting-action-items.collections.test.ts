import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import * as database from "../../src/database/sql.js";
import { meetingActionItemsRepository } from "../../src/modules/meeting-action-items/meeting-action-items.repository.js";
import { meetingActionItemsService } from "../../src/modules/meeting-action-items/meeting-action-items.service.js";
import { meetingFollowUpRepository } from "../../src/modules/meeting-followup/meeting-followup.repository.js";
import { meetingFollowUpService } from "../../src/modules/meeting-followup/meeting-followup.service.js";
import { meetingWorkspaceRepository } from "../../src/modules/meetings/meeting-workspace.repository.js";
import {
  OWNER, ASSIGNEE, VIEWER, MEETING, TASK,
  actionItem, meetingAccess, meetingContext,
} from "../fixtures/meeting-action-items.fixture.js";

function arrange() {
  const items = [
    actionItem(),
    actionItem({ taskId: TASK + 1, assigneeUserId: 400, status: "DONE" }),
    actionItem({ taskId: TASK + 2, assigneeUserId: 500, isOverdue: true }),
  ];
  const context = vi.spyOn(meetingWorkspaceRepository, "findAccessContext").mockResolvedValue(meetingContext());
  vi.spyOn(meetingWorkspaceRepository, "approvedStart").mockResolvedValue(new Date("2000-01-01T00:00:00Z"));
  const list = vi.spyOn(meetingActionItemsRepository, "listForMeeting").mockResolvedValue(items);
  const summary = vi.spyOn(meetingActionItemsRepository, "summarizeForMeeting").mockResolvedValue({ total: 3, completed: 1, overdue: 1 });
  vi.spyOn(meetingFollowUpRepository, "listDecisions").mockResolvedValue([]);
  vi.spyOn(meetingFollowUpRepository, "getNotes").mockResolvedValue(null);
  return { context, list, summary, items };
}

afterEach(() => vi.restoreAllMocks());

describe("Meeting-wide Action Item list and Follow-up summary", () => {
  for (const actor of [OWNER, ASSIGNEE, VIEWER, 400]) {
    it(`returns all tasks and identical counts for authorized actor ${actor}`, async () => {
      const mocks = arrange();
      const access = meetingAccess({ meetingCoordinateEnabled: actor === 400 });
      if (actor === 400) mocks.context.mockResolvedValue(meetingContext({ isAttendee: false }));
      const list = await meetingActionItemsService.list(actor, access, MEETING);
      const followUp = await meetingFollowUpService.get(actor, access, MEETING);
      assert.deepEqual(list.items.map((item) => item.taskId), [TASK, TASK + 1, TASK + 2]);
      assert.equal(list.canCreate, actor === OWNER);
      assert.deepEqual(followUp.summary, { actionItems: 3, completed: 1, overdue: 1, decisions: 0 });
      assert.equal(followUp.canManageContent, actor === OWNER);
      assert.deepEqual(mocks.list.mock.calls[0], [MEETING]);
      assert.deepEqual(mocks.summary.mock.calls[0], [MEETING]);
    });
  }

  for (const state of ["unrelated", "pending", "rejected", "missing"] as const) {
    it(`denies ${state} Meeting access before reading tasks or counts`, async () => {
      const mocks = arrange();
      mocks.context.mockResolvedValue(state === "missing" ? null : meetingContext({
        isAttendee: state !== "unrelated",
        status: state === "pending" ? "PENDING_APPROVAL" : state === "rejected" ? "REJECTED" : "SCHEDULED",
      }));
      await assert.rejects(meetingActionItemsService.list(VIEWER, meetingAccess(), MEETING), {
        statusCode: 404, code: "MEETING_NOT_FOUND",
      });
      await assert.rejects(meetingFollowUpService.get(VIEWER, meetingAccess(), MEETING), {
        statusCode: 404, code: "MEETING_NOT_FOUND",
      });
      assert.equal(mocks.list.mock.calls.length, 0);
      assert.equal(mocks.summary.mock.calls.length, 0);
    });
  }

  it("returns empty content normally for an authorized Meeting with no tasks", async () => {
    const mocks = arrange();
    mocks.list.mockResolvedValue([]);
    mocks.summary.mockResolvedValue({ total: 0, completed: 0, overdue: 0 });
    assert.deepEqual((await meetingActionItemsService.list(VIEWER, meetingAccess(), MEETING)).items, []);
    assert.equal((await meetingFollowUpService.get(VIEWER, meetingAccess(), MEETING)).summary.actionItems, 0);
  });
});

// These are query-contract checks, not SQL Server execution/integration tests.
function captureQueries(rows: unknown[] = []) {
  const query = vi.fn(async (_statement: string) => ({ recordset: rows }));
  const request = { input: vi.fn(), query };
  request.input.mockImplementation(() => request);
  vi.spyOn(database, "getDatabasePool").mockResolvedValue({
    request: () => request,
  } as unknown as Awaited<ReturnType<typeof database.getDatabasePool>>);
  return { query, request };
}

describe("Action Item repository query scope", () => {
  it("scopes Meeting list to Meeting/non-deleted tasks, not actor assignment", async () => {
    const { query, request } = captureQueries();
    assert.deepEqual(await meetingActionItemsRepository.listForMeeting(MEETING), []);
    const text = query.mock.calls[0]![0];
    assert.match(text, /relation\.meeting_id\s*=\s*@meetingId/);
    assert.match(text, /task\.deleted_at_utc IS NULL/);
    assert.doesNotMatch(text, /@actorUserId/);
    assert.equal(request.input.mock.calls[0]?.[2], MEETING);
  });

  it("scopes summary to the same complete Meeting population", async () => {
    const { query } = captureQueries([{ total: "3", completed: "1", overdue: "1" }]);
    assert.deepEqual(await meetingActionItemsRepository.summarizeForMeeting(MEETING), { total: 3, completed: 1, overdue: 1 });
    const text = query.mock.calls[0]![0];
    assert.match(text, /relation\.meeting_id\s*=\s*@meetingId/);
    assert.match(text, /task\.deleted_at_utc IS NULL/);
    assert.doesNotMatch(text, /@actorUserId/);
  });

  it("keeps Assigned to me assignment-only and filters revoked Meeting access everywhere", async () => {
    const { query } = captureQueries();
    await meetingActionItemsRepository.listAssigned(ASSIGNEE, {
      page: 1, pageSize: 20, search: "", due: "ALL",
      sortBy: "assignedAt", sortDirection: "desc", groupBy: "NONE",
    });
    // List, count, summary, and Meeting dropdown must all use the same read scope.
    assert.equal(query.mock.calls.length, 4);
    for (const [text] of query.mock.calls) {
      assert.match(text, /relation\.assignee_user_id = @actorUserId/);
      assert.match(text, /meeting\.status IN \('SCHEDULED', 'CANCELLED'\)/);
      assert.match(text, /attendee\.attendee_user_id = @actorUserId/);
      assert.match(text, /permission\.permission_code = 'MEETING_COORDINATE'/);
      assert.match(text, /permission\.is_active = 1/);
      assert.match(text, /INNER JOIN dbo\.TM_meetings AS meeting/);
      assert.match(text, /task\.deleted_at_utc IS NULL/);
    }
  });
});
