import { describe, expect, it, vi } from 'vitest';

// MSSQL can return BIGINT identifiers as strings, even though the client
// expects numbers and compares them with strict equality.
vi.mock('../../src/database/sql.js', () => ({
  sql: { BigInt: 'BigInt', Int: 'Int' },
  getDatabasePool: async () => ({
    request: () => ({
      input() { return this; },
      async query(query: string) {
        if (query.includes('FROM dbo.TM_collaboration_work_entries e')) return { recordset: [
          { id: '90', assignmentId: '33', note: 'Progress', authorUserId: 573 },
        ] };
        if (query.includes('FROM dbo.TM_collaboration_files f')) return { recordset: [
          { id: 'file-guid', assignmentId: '33', sizeBytes: '250', originalFileName: 'note.pdf' },
        ] };
        if (query.includes('FROM dbo.TM_collaboration_subtask_modes mode')) return { recordset: [
          { subtaskId: '19', mode: 'INHERIT' },
        ] };
        if (query.includes('COUNT(*) total')) return { recordset: [
          { scopeId: null, total: 1, completed: 0 },
          { scopeId: '19', total: 1, completed: 0 },
        ] };
        if (query.includes('FROM dbo.TM_collaboration_assignments a JOIN dbo.users p')) return { recordset: [
          { id: '32', taskId: '119', subtaskId: null, userId: 573, isActive: 1, state: 'TODO' },
          { id: '33', taskId: '119', subtaskId: '19', userId: 573, isActive: 1, state: 'TODO' },
        ] };
        throw new Error(`Unexpected query: ${query.slice(0, 80)}`);
      },
    }),
  }),
}));

import { collaborationRepository } from '../../src/modules/collaboration/collaboration.repository.js';

describe('collaboration snapshot SQL BIGINT mapping', () => {
  it('keeps inherited subtask assignments, progress and work tied to numeric IDs', async () => {
    const view = await collaborationRepository.snapshot(119, 573, 999) as {
      members: Array<{ id: number; taskId: number; subtaskId: number | null; userId: number; isActive: boolean }>;
      modes: Array<{ subtaskId: number }>;
      progress: Array<{ scopeId: number | null; total: number }>;
      notes: Array<{ id: number; assignmentId: number }>;
      files: Array<{ assignmentId: number; sizeBytes: number; id: string }>;
    };
    expect(view.members.find(item => item.subtaskId === 19 && item.userId === 573)).toMatchObject({
      id: 33, taskId: 119, isActive: true,
    });
    expect(view.progress.find(item => item.scopeId === 19)).toMatchObject({total: 1});
    expect(view.modes.find(item => item.subtaskId === 19)).toMatchObject({mode: 'INHERIT'});
    expect(view.notes[0]).toMatchObject({id: 90, assignmentId: 33});
    expect(view.files[0]).toMatchObject({id: 'file-guid', assignmentId: 33, sizeBytes: 250});
    expect(view.members[0]?.subtaskId).toBeNull();
    expect(view.progress[0]?.scopeId).toBeNull();
  });
});
