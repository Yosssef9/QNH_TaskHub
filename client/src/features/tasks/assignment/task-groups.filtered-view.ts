import type { TaskListFilters } from '../types/task.types'
import type { GroupTreeRow } from './task-groups.tree'

/** Sorting and pagination must not affect which groups contain matching tasks. */
export function activeGroupFilters(filters: TaskListFilters): boolean {
  return Boolean(filters.search.trim() || filters.status || filters.priority ||
    (filters.due && filters.due !== 'ALL') ||
    (filters.taskType && filters.taskType !== 'ALL') ||
    filters.tagIds || filters.tagMatch === 'UNTAGGED')
}

/** A matching descendant keeps every ancestor visible (count totals include descendants). */
export function filteredGroupIds(rows: GroupTreeRow[], filtering: boolean): Set<number> {
  return new Set(rows.filter(row => !filtering || row.totalTaskCount > 0).map(row => row.id))
}

/** Only the matching count query determines visible groups, never loaded task pages. */
export function filterKey(filters: TaskListFilters): string {
  return JSON.stringify([filters.search.trim(), filters.status ?? '', filters.priority ?? '',
    filters.due, filters.taskType ?? 'ALL', filters.tagIds ?? '', filters.tagMatch ?? 'ANY'])
}
