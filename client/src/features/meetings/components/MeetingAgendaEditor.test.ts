import { describe, expect, it } from 'vitest'

import {
  reorderAgendaItems,
  type MeetingAgendaDraftItem,
} from './MeetingAgendaEditor'

const items: MeetingAgendaDraftItem[] = [
  {
    clientId: 'agenda-a',
    topic: 'A',
    presenterUserId: null,
    plannedDurationMinutes: null,
  },
  {
    clientId: 'agenda-b',
    topic: 'B',
    presenterUserId: null,
    plannedDurationMinutes: null,
  },
  {
    clientId: 'agenda-c',
    topic: 'C',
    presenterUserId: null,
    plannedDurationMinutes: null,
  },
]

describe('reorderAgendaItems', () => {
  it('moves an agenda topic downward to the target position', () => {
    const next = reorderAgendaItems(items, 'agenda-a', 'agenda-c')

    expect(next.map((item) => item.clientId)).toEqual([
      'agenda-b',
      'agenda-c',
      'agenda-a',
    ])
    expect(next).not.toBe(items)
    expect(items.map((item) => item.clientId)).toEqual([
      'agenda-a',
      'agenda-b',
      'agenda-c',
    ])
  })

  it('moves an agenda topic upward to the target position', () => {
    const next = reorderAgendaItems(items, 'agenda-c', 'agenda-a')

    expect(next.map((item) => item.clientId)).toEqual([
      'agenda-c',
      'agenda-a',
      'agenda-b',
    ])
  })

  it('returns the original array when the source and target are the same', () => {
    expect(reorderAgendaItems(items, 'agenda-b', 'agenda-b')).toBe(items)
  })

  it('returns the original array when either sortable id is unknown', () => {
    expect(reorderAgendaItems(items, 'missing', 'agenda-b')).toBe(items)
    expect(reorderAgendaItems(items, 'agenda-b', 'missing')).toBe(items)
  })
})
