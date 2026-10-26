import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, input, request } = vi.hoisted(() => {
  const query = vi.fn();
  const input = vi.fn();
  const request = vi.fn();
  input.mockImplementation(() => ({ input, query }));
  request.mockImplementation(() => ({ input, query }));
  return { query, input, request };
});
vi.mock('../../src/database/sql.js', () => ({
  sql: { Int: 'Int', VarChar: 'VarChar' },
  getDatabasePool: vi.fn(async () => ({ request })),
}));

import { featureAnnouncementsService } from '../../src/modules/preferences/feature-announcements.service.js';

describe('user-scoped and release-scoped feature announcements', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns saved view state for the authenticated employee', async () => {
    query.mockResolvedValueOnce({ recordset: [{ seen: 1 }] });
    expect(await featureAnnouncementsService.isSeen(575)).toBe(true);
    expect(input).toHaveBeenCalledWith('userId', 'Int', 575);
    expect(input).toHaveBeenCalledWith('key', 'VarChar', 'TASK_DISCUSSIONS_2026_V1');
  });

  it('shows the introduction for a user who has no acknowledgement', async () => {
    query.mockResolvedValueOnce({ recordset: [{ seen: 0 }] });
    expect(await featureAnnouncementsService.isSeen(288)).toBe(false);
  });

  it('persists acknowledgement idempotently using a concurrency-safe check', async () => {
    query.mockResolvedValueOnce({ recordset: [] });
    await featureAnnouncementsService.markSeen(293);
    expect(input).toHaveBeenCalledWith('userId', 'Int', 293);
    const statement = query.mock.calls[0]?.[0] as string;
    expect(statement).toContain('UPDLOCK, HOLDLOCK');
    expect(statement).toContain('INSERT dbo.TM_feature_announcement_views');
  });
});
