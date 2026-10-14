import { describe, expect, it } from 'vitest';
import { canViewCollaborativeActivity } from '../../src/modules/task-details/task-activity-visibility.js';
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
