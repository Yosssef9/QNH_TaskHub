import { describe, expect, it } from 'vitest'

import { resolveMeetingTimeGridSlotRange } from './meeting-time-grid-range'

const visibleWeek = { start: '2026-08-30', end: '2026-09-06' }

function meeting(startAtUtc: string, endAtUtc: string) {
  return { startAtUtc, endAtUtc }
}

describe('resolveMeetingTimeGridSlotRange', () => {
  it('keeps the normal 07:00-20:00 window when all visible Meetings fit', () => {
    expect(
      resolveMeetingTimeGridSlotRange(
        [meeting('2026-09-03T05:00:00.000Z', '2026-09-03T13:00:00.000Z')],
        visibleWeek,
      ),
    ).toEqual({
      slotMinTime: '07:00:00',
      slotMaxTime: '20:00:00',
      expandedBeforeDefault: false,
      expandedAfterDefault: false,
    })
  })

  it('expands upward to the previous whole hour for an early Meeting', () => {
    const range = resolveMeetingTimeGridSlotRange(
      [meeting('2026-09-03T03:30:00.000Z', '2026-09-03T05:00:00.000Z')],
      visibleWeek,
    )
    expect(range.slotMinTime).toBe('06:00:00')
    expect(range.slotMaxTime).toBe('20:00:00')
    expect(range.expandedBeforeDefault).toBe(true)
  })

  it('expands downward to the next whole hour for a late Meeting', () => {
    const range = resolveMeetingTimeGridSlotRange(
      [meeting('2026-09-03T16:30:00.000Z', '2026-09-03T17:30:00.000Z')],
      visibleWeek,
    )
    expect(range.slotMinTime).toBe('07:00:00')
    expect(range.slotMaxTime).toBe('21:00:00')
    expect(range.expandedAfterDefault).toBe(true)
  })

  it('uses both extremes when early and late Meetings are visible', () => {
    const range = resolveMeetingTimeGridSlotRange(
      [
        meeting('2026-09-03T02:15:00.000Z', '2026-09-03T03:00:00.000Z'),
        meeting('2026-09-03T18:30:00.000Z', '2026-09-03T19:20:00.000Z'),
      ],
      visibleWeek,
    )
    expect(range.slotMinTime).toBe('05:00:00')
    expect(range.slotMaxTime).toBe('23:00:00')
  })

  it('ignores Meetings outside the current visible date range', () => {
    const range = resolveMeetingTimeGridSlotRange(
      [meeting('2026-09-10T00:00:00.000Z', '2026-09-10T01:00:00.000Z')],
      visibleWeek,
    )
    expect(range.slotMinTime).toBe('07:00:00')
    expect(range.slotMaxTime).toBe('20:00:00')
  })

  it('shows the full day when a visible Meeting crosses midnight', () => {
    const range = resolveMeetingTimeGridSlotRange(
      [meeting('2026-09-03T20:30:00.000Z', '2026-09-03T21:30:00.000Z')],
      visibleWeek,
    )
    expect(range.slotMinTime).toBe('00:00:00')
    expect(range.slotMaxTime).toBe('24:00:00')
  })
})
