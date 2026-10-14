import {describe,expect,it} from 'vitest';
import {shareCapabilities,canViewSharedPrivateContribution} from '../../src/modules/task-shares/task-shares.policy.js';

describe('task sharing permissions',()=>{
 it('does not make a viewer an assignee',()=>{
  const caps=shareCapabilities('VIEW');
  expect(caps.role).toBe('VIEWER');
  expect(caps.canEditDetails).toBe(false);
  expect(caps.canCompleteTask).toBe(false);
  expect(caps.canManageSubtasks).toBe(false);
  expect(caps.canDeleteRestoreTask).toBe(false);
 });
 it('allows editing shared details, never task execution or assignment management',()=>{
  const caps=shareCapabilities('EDIT');
  expect(caps.canEditDetails).toBe(true);
  expect(caps.canManageSubtasks).toBe(true);
  expect(caps.canCompleteTask).toBe(false);
  expect(caps.canCompleteSubtasks).toBe(false);
  expect(caps.canDeleteRestoreTask).toBe(false);
  expect(caps.canDeleteAnyAttachment).toBe(false);
 });
 it('never grants private contribution access',()=>{
  expect(canViewSharedPrivateContribution()).toBe(false);
 });
});
