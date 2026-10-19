import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskGroupsWorkspace } from './TaskGroupsWorkspace'
import type { TaskListFilters } from '../types/task.types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => ({
    data: { pages: [{ items: [], total: 0 }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}))

vi.mock('./use-task-groups', () => ({
  useTaskGroups: () => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    data: {
      groups: [{ id: 1, listId: 5, parentGroupId: null, name: 'Nursing', displayOrder: 1,
        directTaskCount: 0, totalTaskCount: 1, directDoneCount: 0, totalDoneCount: 1 }],
      ungroupedCount: 2,
      ungroupedDoneCount: 1,
    },
  }),
  useTaskGroupActions: () => Object.fromEntries(
    ['create', 'update', 'remove', 'bulkMove', 'reorder', 'moveTask'].map(key => [key, { mutate: vi.fn(), isPending: false }]),
  ),
}))

vi.mock('../hooks/use-tasks', () => ({
  useChangeTaskStatus: () => ({ mutate: vi.fn() }),
}))

const filters: TaskListFilters = {
  search: '', due: 'ALL', sortBy: 'createdAt', sortDirection: 'desc', page: 1, pageSize: 20,
}

beforeEach(() => window.localStorage.clear())

describe('TaskGroupsWorkspace accordion UX', () => {
  it('shows compact group actions without a row of management buttons', () => {
    render(<TaskGroupsWorkspace listId={5} filters={filters}
      onOpenTask={vi.fn()} onEditTask={vi.fn()} onNewTask={vi.fn()} />)
    expect(screen.getByText('Nursing')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'taskGroups.groupActions' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'taskGroups.delete' })).toBeNull()
    expect(screen.getAllByRole('progressbar', { name: 'taskGroups.completedOfTotal' })).toHaveLength(2)
  })

  it('treats Ungrouped Tasks as an independent collapsible accordion', () => {
    render(<TaskGroupsWorkspace listId={5} filters={filters}
      onOpenTask={vi.fn()} onEditTask={vi.fn()} onNewTask={vi.fn()} />)
    const toggles = screen.getAllByRole('button', { name: 'taskGroups.toggle' })
    const ungroupedToggle = toggles[toggles.length - 1]!
    expect(ungroupedToggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(ungroupedToggle)
    expect(ungroupedToggle.getAttribute('aria-expanded')).toBe('false')
    expect(window.localStorage.getItem('taskhub:ungrouped-open:5')).toBe('false')
  })
})
