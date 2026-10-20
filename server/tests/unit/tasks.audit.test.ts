import { describe, expect, it } from 'vitest';
import { taskUpdateFieldChanges } from '../../src/modules/tasks/tasks.audit.js';

const before = { title: 'Old task', description: null, priority: 'MEDIUM',
  startDate: '2026-10-10', dueDate: null };

describe('Task update audit snapshots', () => {
  it('records a creator correcting a forgotten deadline and description', () => {
    expect(taskUpdateFieldChanges(before, { ...before, description: 'Follow up after meeting',
      dueDate: '2026-10-30' })).toEqual([
      { field: 'description', from: null, to: 'Follow up after meeting' },
      { field: 'dueDate', from: null, to: '2026-10-30' },
    ]);
  });
  it('records previous and next values for priority, title and start date', () => {
    expect(taskUpdateFieldChanges(before, { ...before, title: 'Updated', priority: 'HIGH',
      startDate: '2026-10-20' })).toEqual([
      { field: 'title', from: 'Old task', to: 'Updated' },
      { field: 'priority', from: 'MEDIUM', to: 'HIGH' },
      { field: 'startDate', from: '2026-10-10', to: '2026-10-20' },
    ]);
  });
  it('does not manufacture changes for an unchanged task', () => {
    expect(taskUpdateFieldChanges(before, { ...before })).toEqual([]);
  });
});
