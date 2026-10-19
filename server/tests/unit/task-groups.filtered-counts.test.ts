import { beforeEach, describe, expect, it, vi } from 'vitest'
import { taskGroupListQuerySchema } from '../../src/modules/task-groups/task-groups.schemas.js'

const mock = vi.hoisted(() => ({ query: vi.fn(), inputs: [] as Array<[string, unknown]> }))
vi.mock('../../src/database/sql.js', () => ({
  getDatabasePool: async () => ({
    request: () => ({
      input(name: string, _type: unknown, value: unknown) { mock.inputs.push([name, value]); return this },
      query: (query: string) => mock.query(query),
    }),
  }),
  sql: { Int: 'Int', BigInt: 'BigInt', Date: 'Date', NVarChar: () => 'NVarChar', VarChar: () => 'VarChar' },
}))
vi.mock('../../src/shared/utils/date.utils.js', () => ({ getCurrentDateInAppTimeZone: () => '2026-10-19' }))

import { taskGroupsService } from '../../src/modules/task-groups/task-groups.service.js'

beforeEach(() => { mock.query.mockReset(); mock.inputs.length = 0 })

describe('Group filtered counts', () => {
  it('uses the same search/status/priority/due/task-type/tag predicates as Task List', async () => {
    mock.query
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })
      .mockResolvedValueOnce({ recordset: [
        { id: '1', listId: '5', parentGroupId: null, name: 'Parent', displayOrder: 1 },
        { id: '2', listId: '5', parentGroupId: '1', name: 'Child', displayOrder: 1 },
        { id: '3', listId: '5', parentGroupId: null, name: 'Other', displayOrder: 2 },
      ] })
      .mockResolvedValueOnce({ recordset: [
        { groupId: '2', total: '2', done: '1' }, { groupId: null, total: '1', done: '0' },
      ] })
    const filters = taskGroupListQuerySchema.parse({
      search: 'network', status: 'DONE', priority: 'HIGH', due: 'OVERDUE',
      taskType: 'TEAM', tagIds: '7,8', tagMatch: 'ALL',
    })
    const data = await taskGroupsService.list(9, 5, filters)
    expect(data.groups.map(g => [g.id, g.totalTaskCount, g.totalDoneCount])).toEqual([[1, 2, 1], [2, 2, 1], [3, 0, 0]])
    expect(data.ungroupedCount).toBe(1)
    const sql = mock.query.mock.calls[2]?.[0] as string
    expect(sql).toContain('task.title LIKE @search')
    expect(sql).toContain('task.status=@status')
    expect(sql).toContain('task.priority=@priority')
    expect(sql).toContain("@taskType = 'TEAM'")
    expect(sql).toContain("@tagMatch='ALL'")
    expect(sql).toContain("task.due_date < @today")
    expect(mock.inputs).toContainEqual(['search', '%network%'])
    expect(mock.inputs).toContainEqual(['today', '2026-10-19'])
  })
  it('rejects unsupported filters on the count endpoint', () => {
    expect(taskGroupListQuerySchema.safeParse({ due: 'INVALID' }).success).toBe(false)
    expect(taskGroupListQuerySchema.safeParse({ taskType: 'ADMIN' }).success).toBe(false)
  })
})
