// @vitest-environment jsdom
import '@/test/setup'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskCardLayout } from './TaskCardLayout'

describe('TaskCardLayout', () => {
  it('keeps tags in their own grid region and actions in a separate footer', () => {
    const onEdit = vi.fn()
    render(
      <TaskCardLayout
        completion={<button type="button">Complete</button>}
        title={<span>Team task</span>}
        tags={<span>QNH QMS</span>}
        details={<span>2 of 3 assignments</span>}
        metadata={<span>Medium priority</span>}
        actions={<button type="button" onClick={onEdit}>Edit task</button>}
      />,
    )
    const header = screen.getByTestId('task-card-header')
    const tags = screen.getByTestId('task-card-tags')
    const footer = screen.getByTestId('task-card-footer')
    expect(header).toContainElement(tags)
    expect(footer).toContainElement(screen.getByTestId('task-card-actions'))
    expect(tags).not.toContainElement(screen.getByRole('button', { name: 'Edit task' }))
    expect(tags.className).not.toMatch(/absolute|fixed/)
    expect(screen.getByText('2 of 3 assignments')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('supports a compact personal card with no tags, actions or completion control', () => {
    render(<TaskCardLayout title={<span>Personal task</span>} metadata={<span>No due date</span>} />)
    expect(screen.getByTestId('task-card-layout').className).toContain('grid-cols-1')
    expect(screen.queryByTestId('task-card-tags')).not.toBeInTheDocument()
    expect(screen.queryByTestId('task-card-actions')).not.toBeInTheDocument()
    expect(screen.getByText('No due date')).toBeVisible()
  })

  it('preserves a direction-neutral grid for Arabic and English', () => {
    const { rerender } = render(<div dir="rtl"><TaskCardLayout title="مهمة" tags={<span>QMS</span>} metadata="للعمل" /></div>)
    expect(screen.getByTestId('task-card-header').className).toContain('grid-cols-')
    rerender(<div dir="ltr"><TaskCardLayout title="Task" tags={<span>QNH</span>} metadata="To Do" /></div>)
    expect(screen.getByTestId('task-card-tags')).toHaveTextContent('QNH')
  })
})
