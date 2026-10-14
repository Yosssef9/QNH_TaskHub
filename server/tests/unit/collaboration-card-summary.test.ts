import { describe, expect, it } from 'vitest'
import { collaborationCardSummarySql } from '../../src/modules/collaboration/collaboration-card-summary.sql.js'

describe('task-card collaboration projection', () => {
  it('counts distinct active collaborators across main and child assignments', () => {
    expect(collaborationCardSummarySql).toContain('COUNT(DISTINCT member.assignee_user_id)')
    expect(collaborationCardSummarySql).toContain('member.is_active = 1')
    expect(collaborationCardSummarySql).toContain('ca.subtask_id IS NULL')
  })
  it('provides a limited roster without private contributions or per-user completion states', () => {
    expect(collaborationCardSummarySql).toContain('AS userCode')
    expect(collaborationCardSummarySql).toContain('portal.email')
    expect(collaborationCardSummarySql).toContain('AS mainAssignee')
    expect(collaborationCardSummarySql).not.toMatch(/TM_collaboration_work_entries|TM_collaboration_files|work_notes|completed_at_utc|storage_key/i)
    expect(collaborationCardSummarySql).toContain("AND member.state = 'DONE'")
  })
  it('supports older single-assignee tasks without creating collaboration records', () => {
    expect(collaborationCardSummarySql).toContain('TM_general_task_assignments')
    expect(collaborationCardSummarySql).toContain('TM_meeting_action_items')
    expect(collaborationCardSummarySql).toContain('NOT EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks')
  })
})
