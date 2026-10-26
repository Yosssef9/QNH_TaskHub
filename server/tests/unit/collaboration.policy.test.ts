import { describe, expect, it } from 'vitest';
import {
  canChangeOwnCompletion,
  canDeleteCollaborativeEvidence,
  canReadContribution,
  canReopenAssignment,
  childMembershipChanges,
  collaborationProgress,
  normalizeCollaborators,
} from '../../src/modules/collaboration/collaboration.policy.js';

const user = (userId: number, state: 'TODO' | 'IN_PROGRESS' | 'DONE', isActive = true) => ({ userId, state, isActive });

describe('Collaborative Task completion', () => {
  it('requires both assignees to finish their own assignment', () => {
    expect(collaborationProgress([user(573, 'DONE'), user(750, 'IN_PROGRESS')], []).allCompleted).toBe(false);
    expect(collaborationProgress([user(573, 'DONE'), user(750, 'DONE')], []).allCompleted).toBe(true);
  });
  it('requires every child to have a fully completed team', () => {
    const main = [user(573, 'DONE'), user(750, 'DONE')];
    const children = [{subtaskId:1,members:[user(573,'DONE'),user(750,'TODO')]},
      {subtaskId:2,members:[user(750,'DONE')]}];
    const incomplete = collaborationProgress(main, children);
    expect(incomplete).toMatchObject({mainCompleted:2, mainTotal:2, subtasksCompleted:1, subtasksTotal:2, allCompleted:false});
    expect(collaborationProgress(main,[{...children[0]!,members:[user(573,'DONE'),user(750,'DONE')]},children[1]!]).allCompleted).toBe(true);
  });
  it('never auto-completes empty tasks, or subtasks with no active members', () => {
    expect(collaborationProgress([],[]).allCompleted).toBe(false);
    expect(collaborationProgress([user(573,'DONE')],[{subtaskId:1,members:[]}]).allCompleted).toBe(false);
    expect(collaborationProgress([user(573,'DONE')],[{subtaskId:1,members:[user(750,'DONE',false)]}]).allCompleted).toBe(false);
  });
  it('does not count soft-removed assignees as obligations', () => {
    expect(collaborationProgress([user(573,'DONE'),user(750,'TODO',false)],[])).toMatchObject({mainTotal:1,allCompleted:true});
  });
  it('allows all work to be delegated to child assignees', () => {
    expect(collaborationProgress([],[{subtaskId:1,members:[user(750,'DONE')]}]).allCompleted).toBe(true);
  });
});

describe('Collaborative Task team transitions', () => {
  it('deduplicates IDs while rejecting invalid identities', () => {
    expect(normalizeCollaborators([573,750,573])).toEqual([573,750]);
    expect(() => normalizeCollaborators([0])).toThrow();
  });
  it('synchronizes inherited children but leaves custom children alone', () => {
    expect(childMembershipChanges('INHERIT',[573,801],[573,750])).toEqual({add:[801],remove:[750]});
    expect(childMembershipChanges('CUSTOM',[573,801],[573,750])).toEqual({add:[],remove:[]});
  });
});

describe('Collaborative Task contribution privacy', () => {
  it('only allows an assignee or creator to read their private entries', () => {
    expect(canReadContribution(573,100,573)).toBe(true);
    expect(canReadContribution(100,100,573)).toBe(true);
    expect(canReadContribution(750,100,573)).toBe(false);
  });
  it('requires self for completion but allows creator to reopen', () => {
    expect(canChangeOwnCompletion(100,573)).toBe(false);
    expect(canChangeOwnCompletion(573,573)).toBe(true);
    expect(canReopenAssignment(100,100,573)).toBe(true);
    expect(canReopenAssignment(750,100,573)).toBe(false);
  });
});


describe('Collaborative evidence deletion ownership',()=>{
  const evidence={assigneeUserId:573,uploadedByUserId:573,isActive:true};
  it('allows the active original uploader of either a main or child assignment',()=>{
    expect(canDeleteCollaborativeEvidence(573,evidence)).toBe(true);
  });
  it('blocks the creator, another assignee, and a revoked uploader',()=>{
    expect(canDeleteCollaborativeEvidence(100,evidence)).toBe(false);
    expect(canDeleteCollaborativeEvidence(750,evidence)).toBe(false);
    expect(canDeleteCollaborativeEvidence(573,{...evidence,isActive:false})).toBe(false);
    expect(canDeleteCollaborativeEvidence(573,{...evidence,uploadedByUserId:750})).toBe(false);
  });
});
