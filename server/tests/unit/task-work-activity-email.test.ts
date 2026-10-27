import { afterEach, describe, expect, it, vi } from 'vitest';
import * as sqlModule from '../../src/database/sql.js';
import { EMAIL_EVENT_DEFAULTS } from '../../src/modules/email-settings/email-settings.policy.js';
import { notificationsRepository } from '../../src/modules/notifications/notifications.repository.js';
import { notifyTaskOwnerActivity } from '../../src/modules/general-task-assignments/general-task-assignments.email-events.js';
import { buildGeneralAssignmentEmailPayload, refreshGeneralAssignmentEmailPayload } from '../../src/modules/general-task-assignments/general-task-assignments.email.js';

const at = new Date('2026-10-27T08:00:00Z');
const txRequest = (name = 'Ahmed') => ({
  input: vi.fn().mockReturnThis(),
  query: vi.fn().mockResolvedValue({ recordset: [{ name }] }),
});
const ownerTask = { title: 'Monthly audit', listId: 17, subtaskTitle: 'Collect files' };
const queueInput = { taskId: 101, subtaskId: 22, eventDate: null, createdAtUtc: at, contextTitle: 'Ahmed' };

afterEach(() => vi.restoreAllMocks());

describe('Task activity email notifications', () => {
  it('defaults both new switches to enabled', () => {
    expect(EMAIL_EVENT_DEFAULTS.TASK_WORK_NOTE_ADDED).toBe(true);
    expect(EMAIL_EVENT_DEFAULTS.TASK_ATTACHMENT_ADDED).toBe(true);
  });

  it('skips notifications caused by task owner', async () => {
    const request = txRequest();
    const insert = vi.spyOn(notificationsRepository, 'ensureGeneralTaskNotification').mockResolvedValue();
    await notifyTaskOwnerActivity({ request: () => request } as never, 100, 100, {
      type: 'TASK_WORK_NOTE_ADDED', taskId: 101, listId: 17, taskTitle: 'Monthly audit',
    });
    expect(insert).not.toHaveBeenCalled();
    expect(request.query).not.toHaveBeenCalled();
  });

  it('notifies only the task owner, excluding private body and filenames', async () => {
    const request = txRequest('Ahmed');
    const insert = vi.spyOn(notificationsRepository, 'ensureGeneralTaskNotification').mockResolvedValue();
    await notifyTaskOwnerActivity({ request: () => request } as never, 100, 200, {
      type: 'TASK_ATTACHMENT_ADDED', taskId: 101, subtaskId: 22, listId: 17,
      taskTitle: 'Monthly audit',
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(100, expect.objectContaining({
      type: 'TASK_ATTACHMENT_ADDED', taskId: 101, contextTitle: 'Ahmed', subtaskId: 22,
    }), expect.anything());
  });

  it('uses current owner access at queue and send time', async () => {
    const query = vi.fn().mockResolvedValue({ recordset: [ownerTask] });
    const request = { input: vi.fn().mockReturnThis(), query };
    vi.spyOn(sqlModule, 'getDatabasePool').mockResolvedValue({ request: () => request } as never);
    const payload = await buildGeneralAssignmentEmailPayload(100, 'TASK_WORK_NOTE_ADDED', queueInput);
    expect(payload).toMatchObject({ taskTitle: 'Monthly audit', subtaskTitle: 'Collect files',
      href: '/lists/17?taskId=101', activityActorName: 'Ahmed' });
    expect(JSON.stringify(payload)).not.toContain('notes body');
    expect(await refreshGeneralAssignmentEmailPayload(100, 'TASK_WORK_NOTE_ADDED', payload!))
      .toMatchObject({ activityActorName: 'Ahmed' });
    query.mockResolvedValueOnce({ recordset: [] });
    expect(await refreshGeneralAssignmentEmailPayload(100, 'TASK_WORK_NOTE_ADDED', payload!))
      .toBeNull();
  });
});
