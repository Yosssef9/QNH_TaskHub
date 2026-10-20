import { describe, expect, it } from 'vitest';
import { createMeetingActionItemBodySchema, updateMeetingActionItemBodySchema } from '../../src/modules/meeting-action-items/meeting-action-items.schemas.js';

const update = {
  rowVersion: '0x0000000000000031',
  title: 'Review updated policy',
  description: null,
  priority: 'MEDIUM',
  startDate: null,
  dueDate: '2026-11-20',
  assigneeUserIds: [122, 130],
  agendaItemId: null,
  tagIds: [],
};

describe('Meeting Action Item create/edit contracts', () => {
  it('accepts one complete edit including multiple assignees and optional dates', () => {
    expect(updateMeetingActionItemBodySchema.safeParse(update).success).toBe(true);
  });
  it('requires a valid optimistic-concurrency version', () => {
    expect(updateMeetingActionItemBodySchema.safeParse({ ...update, rowVersion: 'stale' }).success).toBe(false);
  });
  it('rejects a due date earlier than the start date', () => {
    expect(updateMeetingActionItemBodySchema.safeParse({ ...update, startDate: '2026-12-01' }).success).toBe(false);
  });
  it('rejects empty assignee teams and oversized selections', () => {
    expect(updateMeetingActionItemBodySchema.safeParse({ ...update, assigneeUserIds: [] }).success).toBe(false);
    expect(updateMeetingActionItemBodySchema.safeParse({ ...update, assigneeUserIds: Array.from({ length: 31 }, (_, i) => i + 1) }).success).toBe(false);
  });
  it('accepts a client-generated retry ID when creating an action item', () => {
    expect(createMeetingActionItemBodySchema.safeParse({
      title: update.title,
      assigneeUserId: 122,
      requestId: '8f46ca31-3108-4dd5-af67-13759b43a25e',
    }).success).toBe(true);
  });
  it('rejects malformed creation retry IDs', () => {
    expect(createMeetingActionItemBodySchema.safeParse({
      title: update.title, assigneeUserId: 122, requestId: 'not-uuid',
    }).success).toBe(false);
  });
});
