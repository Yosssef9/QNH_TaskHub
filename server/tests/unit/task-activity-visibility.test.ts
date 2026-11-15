import { describe, expect, it } from 'vitest';
import { canViewCollaborativeActivity, canViewExpectedFinishActivity } from '../../src/modules/task-details/task-activity-visibility.js';
const event = (activityType:string,data:object|null) => ({activityType,eventDataJson:data?JSON.stringify(data):null});

describe('Collaborative Task Activity privacy', () => {
  it('shows task status changes but hides unrelated subtask or file activity', () => {
    const visible=new Set([11]);
    expect(canViewCollaborativeActivity(event('COLLAB_PARENT_STATUS_CHANGED',{from:'TODO',to:'DONE'}),750,visible)).toBe(true);
    expect(canViewCollaborativeActivity(event('COLLAB_ASSIGNED',{assigneeUserId:573,subtaskId:11,subtaskTitle:'Other'}),750,visible)).toBe(false);
    expect(canViewCollaborativeActivity(event('COLLAB_FILE_ADDED',{assigneeUserId:750,subtaskId:12,subtaskTitle:'Hidden',fileName:'secret.pdf'}),750,visible)).toBe(false);
    expect(canViewCollaborativeActivity(event('COLLAB_NOTE_ADDED',{assigneeUserId:750,subtaskId:11,subtaskTitle:'Mine'}),750,visible)).toBe(true);
  });
  it('does not reveal a revoked subtask or records with missing assignee identity', () => {
    expect(canViewCollaborativeActivity(event('COLLAB_COMPLETED',{assigneeUserId:750,subtaskId:12}),750,new Set([11]))).toBe(false);
    expect(canViewCollaborativeActivity(event('COLLAB_FILE_ADDED',{}),750,new Set([11]))).toBe(false);
    expect(canViewCollaborativeActivity(event('SUBTASK_WORK_NOTES_UPDATED',{subtaskId:11}),750,new Set([11]))).toBe(false);
    expect(canViewCollaborativeActivity(event('SUBTASK_CREATED',{subtaskId:11,subtaskTitle:'Mine'}),750,new Set([11]))).toBe(true);
    expect(canViewCollaborativeActivity(event('SUBTASK_CREATED',{subtaskId:12,subtaskTitle:'Hidden'}),750,new Set([11]))).toBe(false);
  });
  it('allows automatic subtask events only for visible children', () => {
    const visible=new Set([11]);
    expect(canViewCollaborativeActivity(event('COLLAB_SUBTASK_COMPLETED',{subtaskId:11}),750,visible)).toBe(true);
    expect(canViewCollaborativeActivity(event('COLLAB_SUBTASK_REOPENED',{subtaskId:12}),750,visible)).toBe(false);
  });
});



describe('Expected Finish Date activity visibility', () => {
  const ownParent = event('EXPECTED_FINISH_CHANGED', {
    assigneeUserId:750,subtaskId:null,
    changes:[{field:'expectedFinishDate',from:null,to:'2026-11-18'}],
  });
  const ownChild = event('EXPECTED_FINISH_CHANGED', {
    assigneeUserId:750,subtaskId:11,
    changes:[{field:'expectedFinishDate',from:'2026-11-18',to:null}],
  });
  it('allows own parent estimate only while main assignment remains active', () => {
    expect(canViewExpectedFinishActivity(ownParent,750,new Set(),true)).toBe(true);
    expect(canViewExpectedFinishActivity(ownParent,750,new Set(),false)).toBe(false);
    expect(canViewCollaborativeActivity(ownParent,750,new Set(),new Set(),new Set(),true)).toBe(true);
    expect(canViewCollaborativeActivity(ownParent,750,new Set())).toBe(false);
  });
  it('allows own subtask estimate (including clearing), but not unrelated subtasks', () => {
    expect(canViewExpectedFinishActivity(ownChild,750,new Set([11]),false)).toBe(true);
    expect(canViewCollaborativeActivity(ownChild,750,new Set([11]))).toBe(true);
    expect(canViewCollaborativeActivity(ownChild,750,new Set([12]))).toBe(false);
  });
  it("never discloses another employee\'s estimate or a proxy principal estimate", () => {
    const other=event('EXPECTED_FINISH_CHANGED',{assigneeUserId:751,subtaskId:11});
    expect(canViewExpectedFinishActivity(other,750,new Set([11]),true)).toBe(false);
    expect(canViewCollaborativeActivity(other,750,new Set([11]),new Set([751]))).toBe(false);
  });
  it('fails closed for malformed payloads and missing scope identity', () => {
    expect(canViewExpectedFinishActivity(event('EXPECTED_FINISH_CHANGED',{}),750,new Set([11]),true)).toBe(false);
    expect(canViewExpectedFinishActivity(event('EXPECTED_FINISH_CHANGED',{assigneeUserId:750}),750,new Set([11]),true)).toBe(false);
    expect(canViewExpectedFinishActivity({activityType:'EXPECTED_FINISH_CHANGED',eventDataJson:'{'},750,new Set([11]),true)).toBe(false);
  });
  it('does not change existing visibility for other event types', () => {
    expect(canViewExpectedFinishActivity(event('COLLAB_ASSIGNED',{assigneeUserId:750,subtaskId:11}),750,new Set([11]),true)).toBe(false);
    expect(canViewCollaborativeActivity(event('SUBTASK_CREATED',{subtaskId:11}),750,new Set([11]))).toBe(true);
  });
});
