import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => {
  const inputs = new Map<string, unknown>()
  let statement = ''
  type MockRequest = {
    input: (name: string, type: unknown, value: unknown) => MockRequest
    query: (sql: string) => Promise<{ recordset: never[] }>
  }
  const request: MockRequest = {
    input(name, _type, value) { inputs.set(name, value); return request },
    async query(sql) { statement = sql; return { recordset: [] } },
  }
  return { inputs, request, getStatement: () => statement }
})
vi.mock('../../src/database/sql.js', () => ({
  getDatabasePool: vi.fn(async () => ({ request: () => db.request })),
  sql: { Int: {}, BigInt: {}, VarChar: () => ({}), NVarChar: () => ({}), Date: {} },
}))

import { taskSharesService } from '../../src/modules/task-shares/task-shares.service.js'

const base = {
  tab: 'with' as const, search: '', page: 1, pageSize: 20, permission: 'ALL' as const,
  status: 'ALL' as const, priority: 'ALL' as const, taskType: 'ALL' as const,
  due: 'ALL' as const, sortBy: 'createdAt' as const, sortDirection: 'desc' as const,
  tagMatch: 'ANY' as const,
}

beforeEach(() => { db.inputs.clear() })

describe('shared-task list query boundaries', () => {
  it('filters received tasks by their owner before paging', async () => {
    await taskSharesService.list(12, { ...base, personId: 23, due: 'OVERDUE', taskType: 'TEAM' })
    const text = db.getStatement()
    expect(text).toContain('s.recipient_user_id=@actor')
    expect(text).toContain('t.owner_user_id=@personId')
    expect(text).toContain('AND (@personId IS NULL OR t.owner_user_id=@personId)')
    expect(text).toMatch(/WHERE s\.revoked_at_utc[\s\S]*?SELECT \*,COUNT_BIG\(\*\) OVER\(\)/)
    expect(text).toContain("@due='OVERDUE'")
    expect(text).toContain("@taskType = 'TEAM'")
    expect(db.inputs.get('personId')).toBe(23)
    expect(db.inputs.get('offset')).toBe(0)
  })

  it('filters sent tasks by their recipient and deduplicates task rows', async () => {
    await taskSharesService.list(12, { ...base, tab: 'by', personId: 37, page: 2,
      sortBy: 'priority', sortDirection: 'asc', permission: 'EDIT' })
    const text = db.getStatement()
    expect(text).toContain('t.owner_user_id=@actor')
    expect(text).toContain('s.recipient_user_id=@personId')
    expect(text).toContain('ROW_NUMBER() OVER (PARTITION BY t.id')
    expect(text).toContain('WHERE rn=1 ORDER BY CASE priority')
    expect(text).toContain('COUNT_BIG(*) FROM dbo.TM_task_shares total WHERE total.task_id=t.id')
    expect(db.inputs.get('offset')).toBe(20)
  })

  it('restricts People options to active shares and the corresponding direction', async () => {
    await taskSharesService.people(12, 'with')
    expect(db.getStatement()).toContain('s.recipient_user_id=@actor')
    expect(db.getStatement()).toContain('SELECT DISTINCT owner.USER_ID AS userId')
    expect(db.getStatement()).toContain('s.revoked_at_utc IS NULL')
    expect(db.getStatement()).toContain('dbo.TM_meeting_attendees')
    await taskSharesService.people(12, 'by')
    expect(db.getStatement()).toContain('t.owner_user_id=@actor')
    expect(db.getStatement()).toContain('SELECT DISTINCT portal.USER_ID AS userId')
  })
})
