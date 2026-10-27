import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import { resolveTaskAccess } from '../../src/modules/meeting-action-items/meeting-action-items.access.js';
vi.mock('../../src/modules/meeting-action-items/meeting-action-items.access.js', () => ({ resolveTaskAccess: vi.fn() }));
vi.mock('../../src/modules/general-task-assignments/general-task-assignments.email-events.js', () => ({
  notifyTaskOwnerActivity: vi.fn(), notifyGeneralTask: vi.fn(), notifyRemovedAssignment: vi.fn(),
}));
import * as transactions from '../../src/database/transaction.js';
import type { DatabaseTransaction } from '../../src/database/types.js';
import { generalTaskAssignmentsService } from '../../src/modules/general-task-assignments/general-task-assignments.service.js';
import { generalTaskAssignmentsRepository as repo } from '../../src/modules/general-task-assignments/general-task-assignments.repository.js';
import { tasksRepository } from '../../src/modules/tasks/tasks.repository.js';
import { taskRecord } from '../fixtures/meeting-action-items.fixture.js';

const OWNER = 100, FIRST_ASSIGNEE = 200, SECOND_ASSIGNEE = 300, TASK = 123;
const task = taskRecord({
  id: TASK, title: 'Report', completionSummary: 'Legacy summary must never be overwritten',
  actionMeetingId: null, actionMeetingTitle: null, actionAssigneeUserId: null,
  actionAssigneeName: null, actionAssignedByUserId: null, actionAssignedByName: null,
  actionAgendaItemId: null, actionAgendaTitle: null, actionAssignedAtUtc: null,
  autoCompletedFromSubtasks: false,
});

afterEach(() => vi.restoreAllMocks());
function setup(assigneeUserId: number | null = FIRST_ASSIGNEE) {
  const transaction = {} as DatabaseTransaction;
  vi.spyOn(transactions, 'withTransaction').mockImplementation(async fn => fn(transaction));
  vi.spyOn(tasksRepository, 'findOwnedForUpdate').mockResolvedValue(task);
  const insert = vi.spyOn(repo, 'addCompletionSummaryEntry').mockResolvedValue(789);
  const activity = vi.spyOn(tasksRepository, 'addActivity').mockResolvedValue(undefined);
  vi.mocked(resolveTaskAccess).mockResolvedValue({
    ownerUserId: OWNER, context: null, collaborationActive: false,
    generalAssignment: {
      taskId: TASK, ownerUserId: OWNER, assigneeUserId,
      assignedByUserId: OWNER, assignedAtUtc: '2026-10-27T00:00:00Z',
      rowVersion: '0x0000000000000001',
    },
    capabilities: {
      role: 'ASSIGNEE', canEditDetails: false, canManageSubtasks: false,
      canCompleteSubtasks: true, canUploadAttachments: true,
      canDeleteAnyAttachment: false, canCompleteTask: true,
      canChangeNonCompletionStatus: true, canDeleteRestoreTask: false,
    },
  });
  return { insert, activity };
}

describe('Completion Summary authorship and reassignment integrity', () => {
  it('appends as the authenticated assignee without mutating legacy text', async () => {
    const { insert, activity } = setup();
    await generalTaskAssignmentsService.saveCompletionSummary(FIRST_ASSIGNEE, TASK, '  Finished documentation  ');
    assert.deepEqual(insert.mock.calls[0]?.slice(1), [OWNER, TASK, FIRST_ASSIGNEE, 'Finished documentation']);
    assert.equal(activity.mock.calls[0]?.[3], 'COMPLETION_SUMMARY_UPDATED');
    assert.deepEqual(activity.mock.calls[0]?.[4], { entryId: 789 });
    assert.equal(activity.mock.calls[0]?.[5], FIRST_ASSIGNEE);
    assert.equal(task.completionSummary, 'Legacy summary must never be overwritten');
  });

  it('blocks the task creator editing another assignee’s summary', async () => {
    const { insert } = setup();
    await assert.rejects(generalTaskAssignmentsService.saveCompletionSummary(OWNER, TASK, 'Replace it'),
      { statusCode: 403, code: 'COMPLETION_SUMMARY_FORBIDDEN' });
    assert.equal(insert.mock.calls.length, 0);
  });

  it('rejects old assignee after reassignment and allows new assignee only to append', async () => {
    const { insert } = setup(SECOND_ASSIGNEE);
    await assert.rejects(generalTaskAssignmentsService.saveCompletionSummary(FIRST_ASSIGNEE, TASK, 'Unauthorized edit'),
      { statusCode: 403, code: 'COMPLETION_SUMMARY_FORBIDDEN' });
    await generalTaskAssignmentsService.saveCompletionSummary(SECOND_ASSIGNEE, TASK, 'My separate update');
    assert.equal(insert.mock.calls.length, 1);
    assert.deepEqual(insert.mock.calls[0]?.slice(1), [OWNER, TASK, SECOND_ASSIGNEE, 'My separate update']);
  });

  it('rejects whitespace-only summaries', async () => {
    const { insert } = setup();
    await assert.rejects(generalTaskAssignmentsService.saveCompletionSummary(FIRST_ASSIGNEE, TASK, ' \n '),
      { statusCode: 400, code: 'COMPLETION_SUMMARY_EMPTY' });
    assert.equal(insert.mock.calls.length, 0);
  });

  it('keeps the private collaborative-assignment summary path unchanged', async () => {
    const { insert } = setup();
    vi.mocked(resolveTaskAccess).mockResolvedValueOnce({
      ownerUserId: OWNER, context: null, collaborationActive: true,
      generalAssignment: null,
      capabilities: {
        role: 'ASSIGNEE', canEditDetails: false, canManageSubtasks: false,
        canCompleteSubtasks: false, canUploadAttachments: false,
        canDeleteAnyAttachment: false, canCompleteTask: false,
        canChangeNonCompletionStatus: false, canDeleteRestoreTask: false,
      },
    });
    await assert.rejects(generalTaskAssignmentsService.saveCompletionSummary(FIRST_ASSIGNEE, TASK, 'Not allowed'),
      { statusCode: 409, code: 'COLLABORATION_PRIVATE_NOTES' });
    assert.equal(insert.mock.calls.length, 0);
  });
});
