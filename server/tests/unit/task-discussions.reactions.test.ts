import { describe, expect, it } from 'vitest';
import { DISCUSSION_REACTIONS, discussionLikePattern, isDiscussionReaction } from '../../src/modules/task-discussions/task-discussions.reactions.js';

describe('discussion reactions and search safety', () => {
  it('accepts only the supported reaction set', () => {
    for (const emoji of DISCUSSION_REACTIONS) expect(isDiscussionReaction(emoji)).toBe(true);
    expect(isDiscussionReaction('<script>')).toBe(false);
    expect(isDiscussionReaction('')).toBe(false);
  });
  it('escapes SQL Server LIKE pattern metacharacters', () => {
    expect(discussionLikePattern('20%_[~')).toBe('%20~%~_~[~~%');
    expect(discussionLikePattern('مرحبا')).toBe('%مرحبا%');
  });
});
