import { describe, expect, it } from 'vitest';

import { assertNormalTaskStartDateAllowed } from '../../src/modules/tasks/tasks.start-date.policy.js';

describe('normal task start-date policy', () => {
  const today = '2026-10-19';

  it('blocks a past start date for a new personal or assigned normal task', () => {
    expect(() => assertNormalTaskStartDateAllowed('2026-10-18', null, today))
      .toThrow('Start date cannot be earlier than today.');
  });

  it('allows today, future dates, and optional empty dates', () => {
    for (const date of [today, '2026-10-20', null, undefined]) {
      expect(() => assertNormalTaskStartDateAllowed(date, null, today)).not.toThrow();
    }
  });

  it('permits unchanged historical dates when editing unrelated fields', () => {
    expect(() => assertNormalTaskStartDateAllowed('2025-01-01', '2025-01-01', today))
      .not.toThrow();
  });

  it('rejects changing a historical task to another past start date', () => {
    expect(() => assertNormalTaskStartDateAllowed('2026-10-01', '2025-01-01', today))
      .toThrow('Start date cannot be earlier than today.');
  });

  it('allows changing an old task date to today or clearing it', () => {
    expect(() => assertNormalTaskStartDateAllowed(today, '2025-01-01', today)).not.toThrow();
    expect(() => assertNormalTaskStartDateAllowed(null, '2025-01-01', today)).not.toThrow();
  });
});
