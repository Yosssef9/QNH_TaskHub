import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { i18n } from '@/i18n'

import type { CalendarTask } from '../types/calendar.types'
import { CalendarDayPanel } from './CalendarDayPanel'

const task: CalendarTask = {
  id: 42,
  title: 'Mobile calendar task',
  calendarDate: '2026-08-29',
  calendarDateSource: 'DUE_DATE',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  startDate: null,
  dueDate: '2026-08-29',
  isOverdue: false,
  listId: 1,
  listName: 'My Tasks',
  cycleId: null,
  cycleTitle: null,
  kpiInstanceId: null,
  kpiTemplateId: null,
  kpiName: null,
  isReadOnly: false,
}

function mockMobileViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string): MediaQueryList => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })),
  })
}

describe('CalendarDayPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    mockMobileViewport(true)
  })

  afterEach(async () => {
    await i18n.changeLanguage('ar')
  })

  test('renders the selected day inline on a phone instead of opening a drawer', () => {
    render(
      <CalendarDayPanel
        date="2026-08-29"
        tasks={[task]}
        scope="PERSONAL"
        canCreate
        onOpenChange={() => undefined}
        onOpenTask={() => undefined}
        onCreateTask={() => undefined}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /August 29, 2026/i })).toBeVisible()
    expect(screen.getByText('Mobile calendar task')).toBeVisible()
    expect(screen.getByRole('button', { name: /Add task on this date/i })).toBeVisible()
  })

  test('keeps the drawer treatment on larger screens', () => {
    mockMobileViewport(false)

    render(
      <CalendarDayPanel
        date="2026-08-29"
        tasks={[task]}
        scope="PERSONAL"
        canCreate
        onOpenChange={() => undefined}
        onOpenTask={() => undefined}
        onCreateTask={() => undefined}
      />,
    )

    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByText('Mobile calendar task')).toBeVisible()
  })

  test('keeps mobile day actions usable', () => {
    const onOpenChange = vi.fn()
    const onOpenTask = vi.fn()
    const onCreateTask = vi.fn()

    render(
      <CalendarDayPanel
        date="2026-08-29"
        tasks={[task]}
        scope="PERSONAL"
        canCreate
        onOpenChange={onOpenChange}
        onOpenTask={onOpenTask}
        onCreateTask={onCreateTask}
      />,
    )

    fireEvent.click(screen.getByText('Mobile calendar task'))
    expect(onOpenTask).toHaveBeenCalledWith(42)

    fireEvent.click(screen.getByRole('button', { name: /Add task on this date/i }))
    expect(onCreateTask).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
