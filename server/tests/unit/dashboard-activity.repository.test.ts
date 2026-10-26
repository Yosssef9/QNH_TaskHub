import { describe, expect, it, vi } from 'vitest';

let capturedSql = '';
vi.mock('../../src/database/sql.js', () => ({
  sql: { Int: 'int' },
  getDatabasePool: vi.fn(async () => ({ request: () => ({
    input() { return this; },
    async query(text: string) { capturedSql = text; return { recordset: [] }; },
  }) })),
}));
import { dashboardActivityRepository } from '../../src/modules/dashboard/dashboard-activity.repository.js';

describe('dashboard activity preview visibility', () => {
  it('respects current assignments and non-revoked shares', async () => {
    expect(await dashboardActivityRepository.recent(7)).toEqual([]);
    expect(capturedSql).toContain('shareRow.revoked_at_utc IS NULL');
    expect(capturedSql).toContain('assignment.is_active=1');
    expect(capturedSql).toContain('meeting.organizer_user_id=@actor');
    expect(capturedSql).not.toContain('WHERE activity.actor_user_id=@actor OR');
  });

  it('selects allowlisted fields, not private raw audit JSON', async () => {
    await dashboardActivityRepository.recent(7);
    expect(capturedSql).toContain("JSON_VALUE(activity.event_data_json,'$.subtaskTitle')");
    expect(capturedSql).toContain('CASE WHEN task.owner_user_id=@actor OR activity.actor_user_id=@actor');
    expect(capturedSql).not.toMatch(/event_data_json\s+AS\s+eventData/i);
    expect(capturedSql).not.toMatch(/changes_json\s+AS\s+/i);
    expect(capturedSql).toContain('TOP (30)');
  });
});
