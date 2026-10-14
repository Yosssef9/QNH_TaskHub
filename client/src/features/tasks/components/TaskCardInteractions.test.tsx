// @vitest-environment jsdom
import '@/test/setup'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { TaskTags } from '../tags/TaskTags'
import type { TaskTag } from '../tags/tags.api'
import { TaskCardLayout } from './TaskCardLayout'
import { TaskTeamIndicator } from './TaskTeamIndicator'

const tags: TaskTag[] = [
  { id: 1, name: 'QNH', scope: 'SYSTEM', color: '#2563EB', iconKind: 'SYSTEM', iconKey: 'qnh' },
  { id: 2, name: 'QMS', scope: 'SYSTEM', color: '#2563EB', iconKind: 'SYSTEM', iconKey: 'qms' },
  { id: 3, name: 'Audit', scope: 'PERSONAL', color: '#2563EB', iconKind: 'LUCIDE', iconKey: 'tag' },
]
const team = {
  teamTask: true, teamMemberCount: 2, mainAssigneeCount: 2, mainCompletedCount: 1,
  teamRoster: [
    { userId: 1, userName: 'Sami Mubarak', userCode: '2174', email: null, mainAssignee: true },
    { userId: 2, userName: 'Yasser Hamza', userCode: '2101', email: null, mainAssignee: true },
  ],
}

beforeEach(async () => { await i18n.changeLanguage('en') })
afterEach(async () => { await i18n.changeLanguage('ar') })

function renderCard(onOpen: () => void, onEdit: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <div data-testid="card" role="button" tabIndex={0} onClick={onOpen}
        onKeyDown={event => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault(); onOpen()
          }
        }}>
        <TaskCardLayout
          title={<span>Prepare security report</span>}
          tags={<TaskTags tags={tags} />}
          details={<TaskTeamIndicator summary={team} subtaskTotal={2} subtaskCompleted={1} />}
          metadata={<span>Due tomorrow</span>}
          actions={<button type="button" onClick={onEdit}>Edit task</button>}
        />
      </div>
    </QueryClientProvider>,
  )
}

describe('Task card interactions', () => {
  it('opens details from title, tag chip, aggregate progress, and footer metadata', () => {
    const onOpen = vi.fn()
    renderCard(onOpen, vi.fn())
    fireEvent.click(screen.getByText('Prepare security report'))
    fireEvent.click(screen.getByText('QNH'))
    fireEvent.click(screen.getByText('Main assignments 1/2 completed'))
    fireEvent.click(screen.getByText('Subtasks 1/2 completed'))
    fireEvent.click(screen.getByText('Due tomorrow'))
    expect(onOpen).toHaveBeenCalledTimes(5)
  })

  it('keeps tag-expansion, team roster, and edit controls independent of card navigation', () => {
    const onOpen = vi.fn()
    const onEdit = vi.fn()
    renderCard(onOpen, onEdit)
    fireEvent.click(screen.getByRole('button', { name: '1 more tags' }))
    expect(screen.getByText('Audit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View assigned team' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }))
    expect(onOpen).not.toHaveBeenCalled()
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('keeps card keyboard activation but does not activate on nested controls', () => {
    const onOpen = vi.fn()
    renderCard(onOpen, vi.fn())
    fireEvent.keyDown(screen.getByTestId('card'), { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledOnce()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit task' }), { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
