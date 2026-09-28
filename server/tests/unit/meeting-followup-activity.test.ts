import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import * as transactions from "../../src/database/transaction.js";
import type { DatabaseTransaction } from "../../src/database/types.js";
import * as contentAccess from "../../src/modules/meetings/meeting-content-access.js";
import * as taskAccess from "../../src/modules/meeting-action-items/meeting-action-items.access.js";
import { meetingSchedulingRepository } from "../../src/modules/meetings/meeting-scheduling.repository.js";
import { meetingWorkspaceRepository } from "../../src/modules/meetings/meeting-workspace.repository.js";
import { meetingFollowUpRepository } from "../../src/modules/meeting-followup/meeting-followup.repository.js";
import { meetingFollowUpService } from "../../src/modules/meeting-followup/meeting-followup.service.js";
import { meetingActionItemsRepository } from "../../src/modules/meeting-action-items/meeting-action-items.repository.js";
import { meetingActionItemsService } from "../../src/modules/meeting-action-items/meeting-action-items.service.js";
import { tasksRepository } from "../../src/modules/tasks/tasks.repository.js";
import { tasksService } from "../../src/modules/tasks/tasks.service.js";
import { notificationsRepository } from "../../src/modules/notifications/notifications.repository.js";
import { actionContext, actionItem, taskRecord, meetingContext, meetingAccess, MEETING, TASK, OWNER, ASSIGNEE } from "../fixtures/meeting-action-items.fixture.js";

function arrange() {
  const transaction = {} as DatabaseTransaction;
  vi.spyOn(transactions, 'withTransaction').mockImplementation(async (run) => run(transaction));
  vi.spyOn(contentAccess, 'requireMeetingContentAccess').mockResolvedValue({ context: meetingContext() });
  vi.spyOn(meetingWorkspaceRepository, 'findAccessContext').mockResolvedValue(meetingContext());
  vi.spyOn(meetingWorkspaceRepository, 'approvedStart').mockResolvedValue(new Date('2000-01-01T00:00:00Z'));
  const audit = vi.spyOn(meetingSchedulingRepository, 'addActivity').mockResolvedValue(undefined);
  vi.spyOn(meetingFollowUpRepository, 'createDecision').mockResolvedValue(9);
  vi.spyOn(meetingFollowUpRepository, 'findDecisionForUpdate').mockResolvedValue({ id: 9, rowVersion: 'v1' });
  const updateDecision = vi.spyOn(meetingFollowUpRepository, 'updateDecision').mockResolvedValue(true);
  vi.spyOn(meetingFollowUpRepository, 'listDecisions').mockResolvedValue([{ id: 9, meetingId: MEETING, agendaItemId: null, agendaTitle: null, decisionText: 'Decision', createdBy: { userId: OWNER, userCode: 'U100', userName: 'Organizer' }, createdAtUtc: '2026-09-27T06:00:00Z', updatedAtUtc: null, rowVersion: 'v1' }]);
  const notesLock = vi.spyOn(meetingFollowUpRepository, 'findNotesForUpdate').mockResolvedValue(null);
  vi.spyOn(meetingFollowUpRepository, 'createNotes').mockResolvedValue(undefined);
  vi.spyOn(meetingFollowUpRepository, 'updateNotes').mockResolvedValue(true);
  vi.spyOn(meetingFollowUpRepository, 'getNotes').mockResolvedValue({ meetingId: MEETING, notesText: 'Private note body', updatedBy: { userId: OWNER, userCode: 'U100', userName: 'Organizer' }, updatedAtUtc: '2026-09-27T06:00:00Z', rowVersion: 'v1' });
  vi.spyOn(meetingActionItemsRepository, 'eligibleAssignee').mockResolvedValue(true);
  vi.spyOn(meetingActionItemsRepository, 'defaultListId').mockResolvedValue(7);
  vi.spyOn(meetingActionItemsRepository, 'createRelationship').mockResolvedValue('v1');
  vi.spyOn(meetingActionItemsRepository, 'meetingTitle').mockResolvedValue('Meeting');
  vi.spyOn(meetingActionItemsRepository, 'listForMeeting').mockResolvedValue([actionItem()]);
  vi.spyOn(meetingActionItemsRepository, 'findContext').mockResolvedValue(actionContext());
  vi.spyOn(meetingActionItemsRepository, 'updateAssignee').mockResolvedValue('v2');
  vi.spyOn(tasksRepository, 'create').mockResolvedValue(TASK);
  vi.spyOn(tasksRepository, 'addActivity').mockResolvedValue(undefined);
  vi.spyOn(tasksRepository, 'findOwnedForUpdate').mockResolvedValue(taskRecord());
  vi.spyOn(tasksRepository, 'findOwnedById').mockResolvedValue(taskRecord());
  vi.spyOn(tasksRepository, 'changeStatus').mockResolvedValue(undefined);
  vi.spyOn(notificationsRepository, 'ensureMeetingActionItemNotification').mockResolvedValue(undefined);
  const taskPermission = vi.spyOn(taskAccess, 'resolveTaskAccess').mockResolvedValue({ ownerUserId: OWNER, context: actionContext(), capabilities: { role: 'ASSIGNEE', canEditDetails: false, canManageSubtasks: false, canCompleteSubtasks: true, canUploadAttachments: true, canDeleteAnyAttachment: false, canCompleteTask: true, canChangeNonCompletionStatus: true, canDeleteRestoreTask: false } });
  return { transaction, audit, updateDecision, notesLock, taskPermission };
}
afterEach(() => vi.restoreAllMocks());

describe('Follow-up history is recorded with the business write', () => {
  it('records a new Decision once with its real ID and actor', async () => {
    const test = arrange();
    await meetingFollowUpService.createDecision(OWNER, meetingAccess(), MEETING, { decisionText: 'Decision' });
    assert.deepEqual(test.audit.mock.calls[0], [test.transaction, MEETING, OWNER, 'DECISION_CREATED', { decisionId: 9, agendaItemId: null }]);
    assert.equal(test.audit.mock.calls.length, 1);
  });
  it('records successful Decision updates, but not stale failures', async () => {
    const test = arrange();
    await meetingFollowUpService.updateDecision(OWNER, meetingAccess(), MEETING, 9, { decisionText: 'Updated', rowVersion: 'v1' });
    assert.equal(test.audit.mock.calls[0]?.[3], 'DECISION_UPDATED');
    test.audit.mockClear(); test.updateDecision.mockResolvedValue(false);
    await assert.rejects(meetingFollowUpService.updateDecision(OWNER, meetingAccess(), MEETING, 9, { decisionText: 'Updated', rowVersion: 'v1' }));
    assert.equal(test.audit.mock.calls.length, 0);
  });
  for (const existing of [false, true]) {
    it(`records ${existing ? 'updated' : 'new'} Notes without copying their contents into history`, async () => {
      const test = arrange();
      if (existing) test.notesLock.mockResolvedValue({ meetingId: MEETING, rowVersion: 'v1' });
      await meetingFollowUpService.saveNotes(OWNER, meetingAccess(), MEETING, { notesText: 'Private note body', ...(existing ? { rowVersion: 'v1' } : {}) });
      assert.deepEqual(test.audit.mock.calls[0], [test.transaction, MEETING, OWNER, 'NOTES_UPDATED', { created: !existing }]);
      assert.equal(JSON.stringify(test.audit.mock.calls).includes('Private note body'), false);
    });
  }
  it('does not record a history event when a non-Organizer tries to change Notes', async () => {
    const test = arrange();
    await assert.rejects(meetingFollowUpService.saveNotes(ASSIGNEE, meetingAccess(), MEETING, { notesText: 'Not allowed' }), { code: 'MEETING_ORGANIZER_REQUIRED' });
    assert.equal(test.audit.mock.calls.length, 0);
  });
  it('propagates an audit failure to the transaction rather than claiming a successful write', async () => {
    const test = arrange(); test.audit.mockRejectedValue(new Error('AUDIT_FAILED'));
    await assert.rejects(meetingFollowUpService.createDecision(OWNER, meetingAccess(), MEETING, { decisionText: 'Decision' }), /AUDIT_FAILED/);
  });
  it('records Action Item creation in the Meeting timeline as well as Task history', async () => {
    const test = arrange();
    await meetingActionItemsService.create(OWNER, meetingAccess(), MEETING, { title: 'Shared action', priority: 'MEDIUM', assigneeUserId: ASSIGNEE });
    assert.deepEqual(test.audit.mock.calls[0], [test.transaction, MEETING, OWNER, 'ACTION_ITEM_CREATED', { taskId: TASK, taskTitle: 'Shared action', assigneeUserId: ASSIGNEE, agendaItemId: null }]);
  });
  it('records changed assignment, not a same-assignee no-op', async () => {
    const test = arrange();
    await meetingActionItemsService.reassign(OWNER, meetingAccess(), MEETING, TASK, { assigneeUserId: 300, rowVersion: 'v1' });
    assert.equal(test.audit.mock.calls[0]?.[3], 'ACTION_ITEM_REASSIGNED');
    test.audit.mockClear();
    await meetingActionItemsService.reassign(OWNER, meetingAccess(), MEETING, TASK, { assigneeUserId: ASSIGNEE, rowVersion: 'v1' });
    assert.equal(test.audit.mock.calls.length, 0);
  });
  it('records Action Item completion with the assignee as actor', async () => {
    const test = arrange();
    await tasksService.changeStatus(ASSIGNEE, TASK, { status: 'DONE' });
    assert.deepEqual(test.audit.mock.calls[0], [test.transaction, MEETING, ASSIGNEE, 'ACTION_ITEM_STATUS_CHANGED', { taskId: TASK, taskTitle: 'Shared action item', fromTaskStatus: 'TODO', toTaskStatus: 'DONE' }]);
  });
  it('does not add Meeting events for unchanged status or unrelated private Tasks', async () => {
    const test = arrange();
    await tasksService.changeStatus(ASSIGNEE, TASK, { status: 'TODO' });
    assert.equal(test.audit.mock.calls.length, 0);
    const permissions = await taskAccess.resolveTaskAccess(OWNER, TASK);
    assert(permissions);
    test.taskPermission.mockResolvedValue({ ...permissions, context: null });
    await tasksService.changeStatus(OWNER, TASK, { status: 'DONE' });
    assert.equal(test.audit.mock.calls.length, 0);
  });
});
