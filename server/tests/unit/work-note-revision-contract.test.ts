import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const file = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const collaborative = file('../../src/modules/collaboration/collaboration.repository.ts');
const individual = file('../../src/modules/general-task-assignments/general-task-assignments.repository.ts');
const migration = file('../../database/migrations/072_work_note_edit_delete_audit.sql');

describe('author-owned Work Note revisions', () => {
  it('locks and restricts collaborative note mutations by original author and assignment', () => {
    expect(collaborative).toContain('author_user_id=@actorId');
    expect(collaborative).toContain('assignment_id=@assignmentId');
    expect(collaborative).toContain('WITH(UPDLOCK,HOLDLOCK)');
    expect(collaborative).toContain('NOTE_EDITED');
    expect(collaborative).toContain('NOTE_DELETED');
  });
  it('locks and restricts single-assignee mutations by original author and subtask', () => {
    expect(individual).toContain('author_user_id=@actorUserId');
    expect(individual).toContain('subtask_id=@subtaskId');
    expect(individual).toContain('WITH(UPDLOCK,HOLDLOCK)');
  });
  it('soft-deletes rather than destroying authored text, keeping immutable revisions', () => {
    for (const source of [collaborative, individual]) {
      expect(source).toContain('INSERT dbo.TM_work_note_revisions');
      expect(source).toContain("deleted_at_utc=CASE WHEN @action='DELETE'");
      expect(source).not.toMatch(/DELETE\s+FROM\s+dbo\.TM_(?:collaboration_work_entries|subtask_work_note_entries)/i);
    }
    expect(migration).toContain('previous_content NVARCHAR(4000) NOT NULL');
    expect(migration).toContain('new_content NVARCHAR(4000) NULL');
    expect(migration).toContain('NOTE_EDITED');
    expect(migration).toContain('NOTE_DELETED');
  });
});
