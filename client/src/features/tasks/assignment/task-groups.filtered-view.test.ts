import { describe, expect, it } from 'vitest'
import { buildGroupTree } from './task-groups.tree'
import { activeGroupFilters, filteredGroupIds, filterKey } from './task-groups.filtered-view'
import type { TaskGroup } from './task-groups.api'
import type { TaskListFilters } from '../types/task.types'

const base: TaskListFilters = {
  search: '', due: 'ALL', taskType: 'ALL', tagMatch: 'ANY',
  sortBy: 'createdAt', sortDirection: 'desc', page: 1, pageSize: 20,
}
const group = (id: number, parentGroupId: number | null, direct: number, total: number): TaskGroup => ({
  id, listId: 1, parentGroupId, name: `Group ${id}`, displayOrder: id,
  directTaskCount: direct, totalTaskCount: total, directDoneCount: 0, totalDoneCount: 0,
})

describe('Task Group filtered visibility', () => {
  it('only reveals matches and their ancestor paths, not other or empty groups', () => {
    const tree = buildGroupTree([
      group(1, null, 0, 2), group(2, 1, 0, 2), group(3, 2, 2, 2),
      group(4, null, 0, 0), group(5, 4, 0, 0),
    ])
    const ids = filteredGroupIds(tree, true)
    expect([...ids]).toEqual([1, 2, 3])
    expect([...filteredGroupIds(tree, false)]).toEqual([1, 2, 3, 4, 5])
  })
  it('recognizes all active filters, not only a search string', () => {
    expect(activeGroupFilters(base)).toBe(false)
    expect(activeGroupFilters({ ...base, search: '  test  ' })).toBe(true)
    expect(activeGroupFilters({ ...base, status: 'DONE' })).toBe(true)
    expect(activeGroupFilters({ ...base, priority: 'HIGH' })).toBe(true)
    expect(activeGroupFilters({ ...base, due: 'OVERDUE' })).toBe(true)
    expect(activeGroupFilters({ ...base, taskType: 'TEAM' })).toBe(true)
    expect(activeGroupFilters({ ...base, tagIds: '1,2' })).toBe(true)
    expect(activeGroupFilters({ ...base, tagMatch: 'UNTAGGED' })).toBe(true)
  })
  it('keeps the match cache stable on sort and pagination changes', () => {
    expect(filterKey({ ...base, search: ' network ' })).toBe(filterKey({ ...base, search: 'network', sortBy: 'title', page: 7 }))
    expect(filterKey({ ...base, search: 'network' })).not.toBe(filterKey({ ...base, search: 'nursing' }))
    expect([...filteredGroupIds(buildGroupTree([group(1, null, 0, 0)]), true)]).toEqual([])
  })
})
