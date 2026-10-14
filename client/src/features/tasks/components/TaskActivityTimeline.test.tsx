// @vitest-environment jsdom
import '@/test/setup'
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'

import type { TaskActivity } from '../types/task.types'
import { TaskActivityTimeline } from './TaskActivityTimeline'

vi.mock('@/features/preferences/hooks/use-time-format', () => ({
  useTimeFormatPreference: () => '12H',
}))

const assignment: TaskActivity = {
  id: 1,
  actorUserId: 2410,
  actorName: 'Youssef Ibrahim',
  actorUserCode: '2410',
  actorEmail: 'yossef@example.org',
  activityType: 'COLLAB_ASSIGNED',
  eventData: {
    subtaskId: 12,
    subtaskTitle: 'Firewall Review',
    assigneeName: 'Sami Mubarak',
    assigneeCode: '2174',
    assigneeEmail: 'sami@example.org',
  },
  createdAtUtc: '2026-10-14T06:30:00Z',
}

afterEach(async () => { await i18n.changeLanguage('ar') })

describe('TaskActivityTimeline identity layout', () => {
  it('keeps Arabic actor details together instead of aligning the email on the far left', async () => {
    await i18n.changeLanguage('ar')
    render(<TaskActivityTimeline activity={[assignment]} subtasks={[]} />)

    const affected = screen.getByText('المكلف بالمهمة').parentElement!
    expect(within(affected).getByText('Sami Mubarak')).toBeInTheDocument()
    expect(within(affected).getByText('2174')).toHaveAttribute('dir', 'ltr')
    expect(within(affected).getByText('sami@example.org')).toHaveAttribute('dir', 'ltr')
    expect(within(affected).getByText('Sami Mubarak').parentElement).toBe(within(affected).getByText('2174').parentElement)
    expect(within(affected).getByText('sami@example.org').parentElement).not.toBe(within(affected).getByText('2174').parentElement)
    expect(within(affected).getByText('Sami Mubarak').parentElement).toHaveAttribute('dir', 'ltr')

    const actor = screen.getByText('بواسطة').parentElement!
    expect(within(actor).getByText('Youssef Ibrahim')).toBeInTheDocument()
    expect(within(actor).getByText('2410')).toHaveAttribute('dir', 'ltr')
    expect(within(actor).getByText('yossef@example.org')).toHaveAttribute('dir', 'ltr')
    expect(within(actor).getByText('Youssef Ibrahim').parentElement).toBe(within(actor).getByText('2410').parentElement)
    expect(within(actor).getByText('yossef@example.org').parentElement).not.toBe(within(actor).getByText('2410').parentElement)
    expect(screen.getByText('المهمة الفرعية: Firewall Review')).toBeInTheDocument()
  })

  it('uses equivalent English labels and keeps individual identities separated', async () => {
    await i18n.changeLanguage('en')
    render(<TaskActivityTimeline activity={[assignment]} subtasks={[]} />)
    const affected = screen.getByText('Affected assignee').parentElement!
    const actor = screen.getByText('Performed by').parentElement!
    expect(within(affected).getByText('Sami Mubarak')).toBeInTheDocument()
    expect(within(actor).getByText('Youssef Ibrahim')).toBeInTheDocument()
    expect(within(actor).getByText('Youssef Ibrahim').parentElement).toBe(within(actor).getByText('2410').parentElement)
    expect(within(actor).getByText('yossef@example.org').parentElement).not.toBe(within(actor).getByText('2410').parentElement)
    expect(within(actor).queryByText('sami@example.org')).not.toBeInTheDocument()
  })

  it('shows the actor even when an activity has no affected assignee', async () => {
    await i18n.changeLanguage('ar')
    render(<TaskActivityTimeline activity={[{
      ...assignment, id: 2, activityType: 'CREATED', eventData: null,
    }]} subtasks={[]} />)
    expect(screen.queryByText('المكلف بالمهمة')).not.toBeInTheDocument()
    const actor = screen.getByText('بواسطة').parentElement!
    expect(within(actor).getByText('Youssef Ibrahim')).toBeInTheDocument()
    expect(within(actor).getByText('yossef@example.org')).toBeInTheDocument()
  })
})
