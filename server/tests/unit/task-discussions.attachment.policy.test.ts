import { describe, expect, it } from 'vitest';
import { canDeleteDiscussionAttachment } from '../../src/modules/task-discussions/task-discussions.policy.js';

describe('Discussion attachment deletion',()=>{
  const file={authorUserId:573,messageDeletedAtUtc:null};
  it('allows the message author who uploaded the file',()=>{
    expect(canDeleteDiscussionAttachment(573,file)).toBe(true);
  });
  it('rejects other participants and files in deleted messages',()=>{
    expect(canDeleteDiscussionAttachment(750,file)).toBe(false);
    expect(canDeleteDiscussionAttachment(573,{...file,messageDeletedAtUtc:new Date()})).toBe(false);
  });
});
