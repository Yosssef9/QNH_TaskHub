import { afterEach, describe, expect, it, vi } from 'vitest';
import * as database from '../../src/database/sql.js';
import { emailSettingsRepository } from '../../src/modules/email-settings/email-settings.repository.js';

afterEach(() => vi.restoreAllMocks());

describe('getSettings SQL account eligibility and missing-settings tolerance', () => {
  it('allows active users lacking TM_user_settings and uses the schema defaults', async () => {
    const query = vi.fn().mockResolvedValue({ recordset: [{
      userName: 'Employee Example', languageCode: 'AR', portalEmail: 'employee@example.invalid',
      notificationsEnabled: true, alternateEmail: null, alternateVerifiedAtUtc: null,
      activeEmailSource: 'PORTAL',
    }] });
    const request = { input: vi.fn().mockReturnThis(), query };
    vi.spyOn(database, 'getDatabasePool').mockResolvedValue({ request: () => request } as never);

    const result = await emailSettingsRepository.getSettings(575);
    expect(result?.userName).toBe('Employee Example');
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toMatch(/LEFT JOIN dbo\.TM_user_settings AS settings/);
    expect(sql).toMatch(/COALESCE\(settings\.email_notifications_enabled, 1\)/);
    expect(sql).toMatch(/access\.is_active = 1/);
    expect(sql).toMatch(/portal\.IS_ACTIVE = 1/);
  });
});
