import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
      groups: [
        { id: 1, listId: 5, parentGroupId: null, name: 'Parent', displayOrder: 1,
          directTaskCount: 0, totalTaskCount: 1, directDoneCount: 0, totalDoneCount: 0 },
        { id: 2, listId: 5, parentGroupId: 1, name: 'Child', displayOrder: 1,
          directTaskCount: 0, totalTaskCount: 1, directDoneCount: 0, totalDoneCount: 0 },
      ],
      ungroupedCount: 0,
      ungroupedDoneCount: 0,
    },
  }),
  useTaskGroupActions: () => Object.fromEntries(
    ['create', 'update', 'remove', 'bulkMove', 'reorder', 'moveTask'].map(key =>
      [key, { mutate: vi.fn(), isPending: false }]),
  ),
}))

vi.mock('../hooks/use-tasks', () => ({
  useChangeTaskStatus: () => ({ mutate: vi.fn() }),
}))

const filters: TaskListFilters = {
  search: '', due: 'ALL', sortBy: 'createdAt', sortDirection: 'desc', page: 1, pageSize: 20,
}

beforeEach(() => window.localStorage.clear())

describe('TaskGroupsWorkspace smooth accordions', () => {
  it('keeps subgroup and ungrouped expansion independent when opening and closing', async () => {
    render(<TaskGroupsWorkspace listId={5} filters={filters}
      onOpenTask={vi.fn()} onEditTask={vi.fn()} onNewTask={vi.fn()} />)

    // Root groups start expanded, with child groups rendered beneath them.
    const parent = screen.getAllByRole('button', { name: 'taskGroups.toggle' })[0]!
    await screen.findByText('Child')
    const ungrouped = screen.getAllByRole('button', { name: 'taskGroups.toggle' }).at(-1)!

    fireEvent.click(parent)
    expect(parent).toHaveAttribute('aria-expanded', 'false')
    expect(ungrouped).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(screen.queryByText('Child')).not.toBeInTheDocument(), { timeout: 2000 })

    fireEvent.click(parent)
    expect(parent).toHaveAttribute('aria-expanded', 'true')
    await screen.findByText('Child')
  })
})
