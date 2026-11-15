import { describe, expect, it } from 'vitest';
import { canEditExpectedFinish, isValidExpectedFinishDate } from '../../src/modules/expected-finishes/expected-finishes.policy.js';

describe('expected finish permissions and validation', () => {
  const input = {actorId:5, assigneeId:5, ownerId:1, active:true, cancelled:false};
  it('only permits the current responsible employee', () => {
    expect(canEditExpectedFinish(input)).toBe(true);
    expect(canEditExpectedFinish({...input,actorId:9})).toBe(false);
    expect(canEditExpectedFinish({...input,actorId:1})).toBe(false);
    expect(canEditExpectedFinish({...input,active:false})).toBe(false);
    expect(canEditExpectedFinish({...input,cancelled:true})).toBe(false);
    expect(canEditExpectedFinish({...input,ownerId:5})).toBe(false);
  });
  it('accepts optional ISO dates, including valid leap days', () => {
    for (const date of [null,'2028-02-29','2026-11-02']) expect(isValidExpectedFinishDate(date)).toBe(true);
    for (const date of ['2026-02-29','2026-13-01','2026-11-31','2026-1-1','bad'])
      expect(isValidExpectedFinishDate(date)).toBe(false);
  });
});
