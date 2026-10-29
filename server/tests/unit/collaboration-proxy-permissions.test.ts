import { describe, expect, it } from 'vitest';
import { canExecuteCollaborativeAssignment, canDeleteCollaborativeEvidence } from '../../src/modules/collaboration/collaboration.policy.js';

describe('individual collaborative task proxies', () => {
  const own = {isActive:true,assigneeUserId:200,proxyUserId:300};
  it('allows primary assignee and active proxy to execute the same assignment',()=>{
    expect(canExecuteCollaborativeAssignment(own,200)).toBe(true);
    expect(canExecuteCollaborativeAssignment(own,300)).toBe(true);
    expect(canExecuteCollaborativeAssignment(own,400)).toBe(false);
  });
  it('never permits execution after membership or proxy is revoked',()=>{
    expect(canExecuteCollaborativeAssignment({...own,isActive:false},300)).toBe(false);
    expect(canExecuteCollaborativeAssignment({...own,proxyUserId:null},300)).toBe(false);
    expect(canExecuteCollaborativeAssignment({...own,proxyUserId:400},300)).toBe(false);
  });
  it('allows a proxy to remove only their own file while actively authorized',()=>{
    const file={assigneeUserId:200,proxyUserId:300,uploadedByUserId:300,isActive:true};
    expect(canDeleteCollaborativeEvidence(300,file)).toBe(true);
    expect(canDeleteCollaborativeEvidence(200,file)).toBe(false);
    expect(canDeleteCollaborativeEvidence(300,{...file,proxyUserId:null})).toBe(false);
    expect(canDeleteCollaborativeEvidence(300,{...file,isActive:false})).toBe(false);
  });
});
