import { describe, expect, it } from 'vitest';
import { createTaskBodySchema } from '../../src/modules/tasks/tasks.schemas.js';
import { createMeetingActionItemBodySchema } from '../../src/modules/meeting-action-items/meeting-action-items.schemas.js';

describe('Collaborative task creation schemas', () => {
  it('accepts an optional multi-assignee team on a general task', () => {
    expect(createTaskBodySchema.parse({
      title:'IT security report', priority:'MEDIUM', assigneeUserIds:[573,750],
    }).assigneeUserIds).toEqual([573,750]);
  });
  it('keeps existing single-assignee and private task submissions valid', () => {
    expect(createTaskBodySchema.parse({title:'Old format',assigneeUserId:573}).assigneeUserId).toBe(573);
    expect(createTaskBodySchema.parse({title:'Private'}).assigneeUserIds).toBeUndefined();
  });
  it('rejects empty team, more than 30 people and invalid IDs', () => {
    expect(createTaskBodySchema.safeParse({title:'Empty',assigneeUserIds:[]}).success).toBe(false);
    expect(createTaskBodySchema.safeParse({title:'Too many',assigneeUserIds:Array.from({length:31},(_,i)=>i+1)}).success).toBe(false);
    expect(createTaskBodySchema.safeParse({title:'Negative',assigneeUserIds:[-1]}).success).toBe(false);
  });
  it('supports multiple eligible meeting attendees without changing old single-assignee payloads', () => {
    expect(createMeetingActionItemBodySchema.parse({title:'Meeting action',assigneeUserId:573,
      assigneeUserIds:[573,750]}).assigneeUserIds).toEqual([573,750]);
    expect(createMeetingActionItemBodySchema.parse({title:'Legacy meeting action',assigneeUserId:573}).assigneeUserIds)
      .toBeUndefined();
  });
});
