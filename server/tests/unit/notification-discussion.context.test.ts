import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDatabasePool } from '../../src/database/sql.js';
import { assertDiscussionAccess } from '../../src/modules/task-discussions/task-discussions.policy.js';
import type { NotificationRecord } from '../../src/modules/notifications/notifications.repository.js';
import {
  discussionMessageId,
  getDiscussionNotificationDetails,
} from '../../src/modules/notifications/notification-discussion.context.js';

vi.mock('../../src/database/sql.js', () => ({
  getDatabasePool: vi.fn(),
  sql: { NVarChar: Object.assign(() => 'NVARCHAR', { MAX: 0 }) },
}));
vi.mock('../../src/modules/task-discussions/task-discussions.policy.js', () => ({
  assertDiscussionAccess: vi.fn(),
}));

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: 41, notificationType: 'TASK_DISCUSSION_MENTION',
    dedupeKey: 'TASK_DISCUSSION:99:7',
    subjectTitle: 'Task discussion', contextTitle: 'Task discussion',
    taskId: 20, subtaskId: null, listId: 4,
    cycleId: null, kpiInstanceId: null, contractId: null, meetingId: null,
    meetingSeriesId: null, meetingRevisionId: null,
    eventDate: null, actualValue: null, targetValue: null, measurementUnit: null,
    readAtUtc: null, createdAtUtc: new Date('2026-10-26T08:00:00Z'),
    ...overrides,
  };
}

const row = {
  messageId: 99, taskId: 20, subtaskId: null,
  deletedAtUtc: null, authorUserId: 5,
  body: '  @2101  Please review\n the latest document.  ',
  senderName: 'Youssef Ibrahim', senderCode: '2410',
  taskTitle: 'Review Quality Policy', subtaskTitle: null,
  hasAttachment: false,
};

function mockQuery(rows: unknown[]): void {
  vi.mocked(getDatabasePool).mockResolvedValue({
    request: () => ({
      input: function () { return this; },
      query: async () => ({ recordset: rows }),
    }),
  } as never);
}

describe('discussion notification context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertDiscussionAccess).mockResolvedValue(undefined);
    mockQuery([row]);
  });

  it('parses only valid message keys', () => {
    expect(discussionMessageId('TASK_DISCUSSION:99:7')).toBe(99);
    expect(discussionMessageId('TASK_DISCUSSION_EDIT:99:7')).toBe(99);
    expect(discussionMessageId(undefined)).toBeNull();
    expect(discussionMessageId('TASK_DISCUSSION:foo:7')).toBeNull();
  });

  it('returns the current authorized content with normalized preview', async () => {
    const result = await getDiscussionNotificationDetails(7, [notification()]);
    expect(result.get(41)).toMatchObject({
      status: 'active', messageId: 99,
      taskTitle: 'Review Quality Policy', senderName: 'Youssef Ibrahim',
      preview: '@2101 Please review the latest document.',
    });
    expect(assertDiscussionAccess).toHaveBeenCalledWith(7, { taskId: 20, subtaskId: null });
  });

  it('never returns private task or message content after access is revoked', async () => {
    vi.mocked(assertDiscussionAccess).mockRejectedValue(new Error('denied'));
    const result = await getDiscussionNotificationDetails(7, [notification()]);
    expect(result.get(41)).toEqual({ status: 'unavailable' });
  });

  it('redacts deleted message bodies but retains authorized task context', async () => {
    mockQuery([{ ...row, deletedAtUtc: new Date('2026-10-26T08:10:00Z') }]);
    const result = await getDiscussionNotificationDetails(7, [notification()]);
    expect(result.get(41)).toEqual({
      status: 'deleted', messageId: 99,
      taskTitle: 'Review Quality Policy', subtaskTitle: null,
    });
  });

  it('does not reveal data if the notification and message scopes disagree', async () => {
    const result = await getDiscussionNotificationDetails(7, [notification({ taskId: 21 })]);
    expect(result.get(41)).toEqual({ status: 'unavailable' });
    expect(assertDiscussionAccess).not.toHaveBeenCalled();
  });

  it('treats missing/deleted records as unavailable and handles legacy keys safely', async () => {
    mockQuery([]);
    const records = [notification(), notification({ id: 42, dedupeKey: null })];
    const result = await getDiscussionNotificationDetails(7, records);
    expect(result.get(41)).toEqual({ status: 'unavailable' });
    expect(result.get(42)).toEqual({ status: 'unavailable' });
  });

  it('identifies attachment-only messages', async () => {
    mockQuery([{ ...row, body: '', hasAttachment: true }]);
    const result = await getDiscussionNotificationDetails(7, [notification()]);
    expect(result.get(41)).toMatchObject({ status: 'active', preview: null, hasAttachment: true });
  });
});
