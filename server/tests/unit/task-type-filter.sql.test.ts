import { describe, expect, it } from 'vitest'
import { taskListQuerySchema } from '../../src/modules/tasks/tasks.schemas.js'
import { assignedActionItemsQuerySchema } from '../../src/modules/meeting-action-items/meeting-action-items.schemas.js'
import { distinctTaskAssigneeCountSql, taskTypeConditionSql, collaborationCardSummarySql } from '../../src/modules/collaboration/collaboration-card-summary.sql.js'

describe('Task Type filtering', () => {
  it('defaults to All and accepts each supported selection', () => {
    expect(taskListQuerySchema.parse({}).taskType).toBe('ALL')
    expect(assignedActionItemsQuerySchema.parse({}).taskType).toBe('ALL')
    for (const type of ['ALL', 'TEAM', 'SINGLE', 'PERSONAL']) {
      expect(taskListQuerySchema.parse({taskType:type}).taskType).toBe(type)
      expect(assignedActionItemsQuerySchema.parse({taskType:type}).taskType).toBe(type)
    }
    expect(taskListQuerySchema.safeParse({taskType:'INVALID'}).success).toBe(false)
  })
  it('filters by unique active members and excludes deleted subtask assignments', () => {
    expect(distinctTaskAssigneeCountSql).toContain('COUNT(DISTINCT members.userId)')
    expect(distinctTaskAssigneeCountSql).toContain('a.is_active = 1')
    expect(distinctTaskAssigneeCountSql).toContain('s.deleted_at_utc IS NULL')
    expect(distinctTaskAssigneeCountSql).toContain('dbo.TM_general_task_assignments')
    expect(distinctTaskAssigneeCountSql).toContain('dbo.TM_meeting_action_items')
    expect(taskTypeConditionSql).toContain("@taskType = 'TEAM'")
    expect(taskTypeConditionSql).toContain("@taskType = 'SINGLE'")
    expect(taskTypeConditionSql).toContain("@taskType = 'PERSONAL'")
    expect(collaborationCardSummarySql).toContain(distinctTaskAssigneeCountSql)
    expect(collaborationCardSummarySql).not.toContain('work_notes')
  })
})
