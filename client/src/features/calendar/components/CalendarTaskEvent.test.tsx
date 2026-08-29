import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { i18n } from '@/i18n'

import type { CalendarTask } from '../types/calendar.types'
import { CalendarTaskEvent } from './CalendarTaskEvent'

const personalTask: CalendarTask = {
  id: 41,
  title: 'Prepare monthly report',
  calendarDate: '2026-08-31',
  calendarDateSource: 'DUE_DATE',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  startDate: '2026-08-25',
  dueDate: '2026-08-31',
  isOverdue: false,
  listId: 7,
  listName: 'Reports',
  cycleId: null,
  cycleTitle: null,
  kpiInstanceId: null,
  kpiTemplateId: null,
  kpiName: null,
  isReadOnly: false,
}

const kpiTask: CalendarTask = {
  ...personalTask,
  id: 42,
  title: 'Prepare board pack',
  calendarDate: '2026-09-03',
  calendarDateSource: 'START_DATE',
  status: 'TODO',
  priority: 'MEDIUM',
  startDate: '2026-09-03',
  dueDate: null,
  listId: null,
  listName: null,
  cycleId: 12,
  cycleTitle: 'Q3 Governance',
  kpiInstanceId: 34,
  kpiTemplateId: 8,
  kpiName: 'Board readiness',
}

describe('CalendarTaskEvent tooltip', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('shows status, priority, list, and due-date context for personal tasks', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider delayDuration={0}>
        <CalendarTaskEvent task={personalTask} monthGrid />
      </TooltipProvider>,
    )

    await user.hover(screen.getByText('Prepare monthly report'))

    expect(await screen.findByText('Reports')).toBeVisible()
    expect(screen.getByText('In progress')).toBeVisible()
    expect(screen.getByText('High')).toBeVisible()
    expect(screen.getByText(/Aug 31, 2026/)).toBeVisible()
  })

  it('shows Work Cycle, KPI, and start-date context for KPI tasks', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider delayDuration={0}>
        <CalendarTaskEvent task={kpiTask} monthGrid />
      </TooltipProvider>,
    )

    await user.hover(screen.getByText('Prepare board pack'))

    expect(await screen.findByText('Q3 Governance')).toBeVisible()
    expect(screen.getByText('Board readiness')).toBeVisible()
    expect(screen.getByText(/Sep 3, 2026/)).toBeVisible()
  })
})
