import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import * as database from "../../src/database/sql.js";
import type { DatabaseTransaction } from "../../src/database/types.js";
import { meetingNotificationsRepository } from "../../src/modules/meetings/meeting-notifications.repository.js";
import { notificationsRepository } from "../../src/modules/notifications/notifications.repository.js";

function captureRequest() {
  const query = vi.fn(async (_statement: string) => ({ recordset: [] }));
  const input = vi.fn();
  const request = { input, query };
  input.mockImplementation(() => request);
  const transaction = { request: () => request } as unknown as DatabaseTransaction;
  return { request, query, input, transaction };
}

afterEach(() => vi.restoreAllMocks());

describe("historical Meeting notification boundaries", () => {
  it.each(["MEETING_ACTION_ITEM_ASSIGNED", "MEETING_ACTION_ITEM_COMPLETED"] as const)(
    "queues %s like an ordinary Meeting Action Item, including email processing",
    async (type) => {
      const { query, input, transaction } = captureRequest();
      await notificationsRepository.ensureMeetingActionItemNotification(77, {
        type, dedupeKey: `${type}:20:77:version`, subjectTitle: "Prepare report",
        contextTitle: "Past meeting", taskId: 20, meetingId: 42,
      }, transaction);

      const statement = query.mock.calls[0]?.[0] ?? "";
      assert.match(statement, /INSERT INTO dbo\.TM_notifications/);
      assert.match(statement, /owner_user_id = @owner AND dedupe_key = @dedupeKey/);
      assert.doesNotMatch(statement, /is_historical_entry/i);
      assert.match(statement, /@meetingId/);
      assert.match(statement, /@owner,\s*@type,\s*@dedupeKey/);
      assert.match(statement, /@meetingId,\s*NULL/); // Eligible for preference-aware email delivery.
      assert.ok(input.mock.calls.some(call => call[0] === "meetingId" && call[2] === 42));
    },
  );

  it.each(["GENERAL_TASK_ASSIGNED", "GENERAL_SUBTASK_ASSIGNED", "GENERAL_ASSIGNMENT_REMOVED", "GENERAL_TASK_DUE_CHANGED", "GENERAL_SUBTASK_DUE_CHANGED", "GENERAL_TASK_COMPLETED", "GENERAL_TASK_REOPENED", "GENERAL_SUBTASK_COMPLETED"] as const)(
    "queues %s for Meeting-linked general/collaborative tasks, even when historical",
    async (type) => {
      const { query, transaction } = captureRequest();
      await notificationsRepository.ensureGeneralTaskNotification(77, {
        type, dedupeKey: `${type}:20:77:version`, taskId: 20, listId: null,
        subjectTitle: "Prepare report", contextTitle: "Past meeting",
      }, transaction);

      const statement = query.mock.calls[0]?.[0] ?? "";
      assert.match(statement, /INSERT dbo\.TM_notifications/);
      assert.match(statement, /owner_user_id=@ownerUserId AND dedupe_key=@dedupe/);
      assert.doesNotMatch(statement, /is_historical_entry/i);
      assert.doesNotMatch(statement, /TM_meeting_action_items/i);
      assert.match(statement, /CASE WHEN @type='GENERAL_SUBTASK_COMPLETED' THEN SYSUTCDATETIME\(\) ELSE NULL END/);
    },
  );

  it("retains existing deadline reminders for Meeting-linked tasks", async () => {
    const { query, request } = captureRequest();
    vi.spyOn(database, "getDatabasePool").mockResolvedValue({
      request: () => request,
    } as unknown as Awaited<ReturnType<typeof database.getDatabasePool>>);
    await notificationsRepository.syncTimeBased(77, "2026-10-20", "2026-10-21");
    const statement = query.mock.calls[0]?.[0] ?? "";
    for (const reminder of ["TASK_OVERDUE", "TASK_DUE_TODAY", "HIGH_PRIORITY_TASK_DUE_TOMORROW"]) {
      assert.ok(statement.includes(reminder));
    }
    assert.doesNotMatch(statement, /is_historical_entry/i);
  });

  it("continues to suppress Meeting invitations and scheduling notifications for historical meetings", async () => {
    const { query, transaction } = captureRequest();
    await meetingNotificationsRepository.insert(transaction, {
      ownerUserId: 77,
      notificationType: "MEETING_INVITED",
      dedupeKey: "MEETING_INVITED:42:77",
      subjectTitle: "Past meeting",
      meetingId: 42,
    });
    assert.match(query.mock.calls[0]?.[0] ?? "", /is_historical_entry\s*=\s*1/);
  });

  it("continues excluding historical meetings from meeting-start reminders", async () => {
    const { query, request } = captureRequest();
    vi.spyOn(database, "getDatabasePool").mockResolvedValue({
      request: () => request,
    } as unknown as Awaited<ReturnType<typeof database.getDatabasePool>>);
    await meetingNotificationsRepository.syncStartReminder(77);
    const statement = query.mock.calls[0]?.[0] ?? "";
    assert.match(statement, /meeting\.is_historical_entry\s*=\s*0/);
    assert.match(statement, /meeting\.is_historical_entry\s*=\s*1/);
  });
});
