import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TaskGroupSelect } from './TaskGroupSelect'
import type { TaskGroup } from './task-groups.api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/shared/SearchableMultiSelect', () => ({
  SearchableMultiSelect: ({ options, value, onChange, disableClear }: {
    options: { value: number; label: string }[]
    value: number
    onChange: (id: number) => void
    disableClear: boolean
  }) => <div>
    <div data-testid="selected-value">{value}</div>
    <div data-testid="disable-clear">{String(disableClear)}</div>
    {options.map(option => <button key={option.value} type="button" onClick={() => onChange(option.value)}>
      {option.label}
    </button>)}
  </div>,
}))

const groups: TaskGroup[] = [
  { id: 1, listId: 5, parentGroupId: null, name: 'Nursing', displayOrder: 1,
    directTaskCount: 1, totalTaskCount: 2, directDoneCount: 0, totalDoneCount: 1 },
  { id: 2, listId: 5, parentGroupId: 1, name: 'Training', displayOrder: 1,
    directTaskCount: 1, totalTaskCount: 1, directDoneCount: 1, totalDoneCount: 1 },
  { id: 3, listId: 5, parentGroupId: null, name: 'IT', displayOrder: 2,
    directTaskCount: 0, totalTaskCount: 0, directDoneCount: 0, totalDoneCount: 0 },
]

describe('TaskGroupSelect', () => {
  it('uses the shared searchable picker and selects full hierarchy paths', () => {
    const onChange = vi.fn()
    render(<TaskGroupSelect groups={groups} value={null} onChange={onChange} />)
    expect(screen.getByTestId('selected-value').textContent).toBe('0')
    expect(screen.getByTestId('disable-clear').textContent).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Nursing / Training' }))
    expect(onChange).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole('button', { name: 'taskGroups.ungrouped' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('uses the correct root label and excludes invalid move destinations', () => {
    const onChange = vi.fn()
    render(<TaskGroupSelect groups={groups} value={null} onChange={onChange}
      rootLabel="No parent" excludeIds={[1, 2]} />)
    expect(screen.getByRole('button', { name: 'No parent' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nursing' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nursing / Training' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'IT' }))
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
