import { describe, expect, it } from 'vitest';
import { createSubtaskBodySchema, updateSubtaskBodySchema } from '../../src/modules/task-details/task-details.schemas.js';

// Creation must validate all configuration before entering the SQL transaction.
describe('subtask creation contract', () => {
  it('accepts a complete custom-team subtask in one request', () => {
    const parsed = createSubtaskBodySchema.parse({
      title: 'Review firewall', description: 'Check current firewall policies', priority: 'HIGH',
      dueDate: '2026-10-28', assignmentMode: 'CUSTOM', assigneeUserIds: [2101, 2174],
    });
    expect(parsed.assigneeUserIds).toEqual([2101, 2174]);
    expect(parsed.priority).toBe('HIGH');
    expect(parsed.description).toBe('Check current firewall policies');
  });
  it('preserves inherited-team and legacy single-user request shapes', () => {
    expect(createSubtaskBodySchema.parse({title:'Inherit', assignmentMode:'INHERIT'}).assignmentMode).toBe('INHERIT');
    expect(createSubtaskBodySchema.parse({title:'Legacy', assigneeUserId:2101}).assigneeUserId).toBe(2101);
  });
  it('rejects unsupported priority, invalid members and oversized notes', () => {
    expect(createSubtaskBodySchema.safeParse({title:'Invalid',priority:'CRITICAL'}).success).toBe(false);
    expect(createSubtaskBodySchema.safeParse({title:'Invalid',assigneeUserIds:[-1]}).success).toBe(false);
    expect(createSubtaskBodySchema.safeParse({title:'Invalid',assigneeUserIds:Array.from({length:31},(_,i)=>i+1)}).success).toBe(false);
    expect(createSubtaskBodySchema.safeParse({title:'Invalid',description:'X'.repeat(4001)}).success).toBe(false);
  });
  it('allows edits to priority and description without altering assignees', () => {
    expect(updateSubtaskBodySchema.parse({priority:'LOW',description:null})).toEqual({priority:'LOW',description:null});
    expect(updateSubtaskBodySchema.safeParse({}).success).toBe(false);
  });
});
