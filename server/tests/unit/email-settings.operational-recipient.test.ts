import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  ensureDefaultPreferences: vi.fn(),
  listPreferences: vi.fn(),
  enabled: { EMAIL_ENABLED: true },
}));

vi.mock('../../src/config/env.js', () => ({ env: mocks.enabled }));
vi.mock('../../src/config/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/modules/email/email.service.js', () => ({ emailService: { sendNow: vi.fn() } }));
vi.mock('../../src/modules/email-settings/email-settings.repository.js', () => ({
  emailSettingsRepository: {
    getSettings: mocks.getSettings,
    ensureDefaultPreferences: mocks.ensureDefaultPreferences,
    listPreferences: mocks.listPreferences,
  },
}));

import { emailSettingsService } from '../../src/modules/email-settings/email-settings.service.js';

const ACTIVE = {
  userName: 'Employee Example', languageCode: 'AR', portalEmail: 'employee@example.invalid',
  notificationsEnabled: true, alternateEmail: null, alternateVerifiedAtUtc: null,
  activeEmailSource: 'PORTAL' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.EMAIL_ENABLED = true;
  mocks.getSettings.mockResolvedValue(ACTIVE);
  mocks.ensureDefaultPreferences.mockResolvedValue(undefined);
  mocks.listPreferences.mockResolvedValue([]);
});

describe('operational email recipient resolution', () => {
  it('delivers assignment mail to an active user with default settings', async () => {
    await expect(emailSettingsService.resolveOperationalDelivery(575, 'GENERAL_TASK_ASSIGNED'))
      .resolves.toMatchObject({ recipient: { email: 'employee@example.invalid' }, language: 'ar' });
    expect(mocks.ensureDefaultPreferences).toHaveBeenCalledTimes(1);
  });

  it('skips a missing or inactive Portal recipient without a retryable 404', async () => {
    mocks.getSettings.mockResolvedValue(null);
    await expect(emailSettingsService.resolveOperationalDelivery(575, 'GENERAL_TASK_ASSIGNED'))
      .resolves.toBeNull();
    expect(mocks.ensureDefaultPreferences).not.toHaveBeenCalled();
    await expect(emailSettingsService.resolveBaseOperationalDelivery(575)).resolves.toBeNull();
  });

  it('obeys user email preference disablement', async () => {
    mocks.listPreferences.mockResolvedValue([{ eventType: 'GENERAL_TASK_ASSIGNED', enabled: false }]);
    await expect(emailSettingsService.resolveOperationalDelivery(575, 'GENERAL_TASK_ASSIGNED'))
      .resolves.toBeNull();
  });

  it('does not seed preferences for recipients without an email destination', async () => {
    mocks.getSettings.mockResolvedValue({ ...ACTIVE, portalEmail: null });
    await expect(emailSettingsService.resolveOperationalDelivery(575, 'GENERAL_TASK_ASSIGNED'))
      .resolves.toBeNull();
    expect(mocks.ensureDefaultPreferences).not.toHaveBeenCalled();
  });

  it('respects the global email kill switch', async () => {
    mocks.enabled.EMAIL_ENABLED = false;
    await expect(emailSettingsService.resolveOperationalDelivery(575, 'GENERAL_TASK_ASSIGNED'))
      .resolves.toBeNull();
    expect(mocks.getSettings).not.toHaveBeenCalled();
  });
});
