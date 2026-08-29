import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import type { PersonalKpi } from '../types/kpi.types'
import { KpiTaskPill } from './KpiTaskPill'

const kpi: PersonalKpi = {
  id: 7,
  name: 'Board completion',
  description: 'Tracks completed board topics.',
  iconKey: 'gauge',
  color: '#0F766E',
  calculationMethod: 'TASK_COMPLETION_RATE',
  periodType: 'MONTHLY',
  measurementUnit: 'PERCENT',
  targetValue: 90,
  targetDirection: 'HIGHER_IS_BETTER',
  deadlineSource: null,
  businessDayOffset: null,
  deadlineDirection: null,
  referenceDateLabel: null,
  numeratorLabel: null,
  denominatorLabel: null,
  valueLabel: null,
  displayOrder: 1,
  isActive: true,
  taskCount: 1,
  taskPolicy: {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: 'OPTIONAL',
    requiresReferenceDate: false,
    subtaskDueDateMode: 'OPTIONAL',
  },
}

describe('KpiTaskPill', () => {
  it('keeps the KPI trigger as a real KPI link', () => {
    render(
      <MemoryRouter>
        <TooltipProvider delayDuration={0}>
          <KpiTaskPill kpi={kpi} />
        </TooltipProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /Board completion/i })).toHaveAttribute(
      'href',
      '/kpis/7',
    )
  })

  it('links operational KPI tasks to their Work Cycle instance', () => {
    render(
      <MemoryRouter>
        <TooltipProvider delayDuration={0}>
          <KpiTaskPill kpi={kpi} cycleId={12} instanceId={34} />
        </TooltipProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /Board completion/i })).toHaveAttribute(
      'href',
      '/work-cycles/12/kpis/34',
    )
  })

  it('renders the Open KPI action as a KPI link when the hover panel is open', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TooltipProvider delayDuration={0}>
          <KpiTaskPill kpi={kpi} />
        </TooltipProvider>
      </MemoryRouter>,
    )

    const trigger = screen.getByRole('link', { name: /Board completion/i })
    await user.hover(trigger)

    const openKpi = await screen.findByRole('link', { name: /Open KPI/i })
    expect(openKpi).toHaveAttribute('href', '/kpis/7')
  })
})
