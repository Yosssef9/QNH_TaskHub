import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/modules/dashboard/dashboard-lists.repository.ts', import.meta.url), 'utf8');

describe('dashboard private list summary', () => {
  it('scopes list identities and joined tasks to their actual owner', () => {
    expect(source).toContain('WHERE l.owner_user_id = @ownerUserId');
    expect(source).toContain('t.owner_user_id = l.owner_user_id');
    expect(source).toContain('l.archived_at_utc IS NULL');
    expect(source).toContain('t.deleted_at_utc IS NULL');
  });

  it('counts non-cancelled tasks, completed tasks and active tasks from real data', () => {
    expect(source).toContain("t.status <> 'CANCELLED'");
    expect(source).toContain("t.status = 'DONE'");
    expect(source).toContain("t.status IN ('TODO', 'IN_PROGRESS')");
    expect(source).toContain('COUNT_BIG(t.id) AS total');
  });
});
