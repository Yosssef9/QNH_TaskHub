import { describe, expect, it } from 'vitest'
import type { DashboardActivity } from './api/dashboard-activity.api'
import { activityDetails, groupDashboardActivity, humanizeActivityType } from './dashboard-activity.presentation'

const base: DashboardActivity = {
  id: 1, kind: 'TASK', objectId: 99, listId: 1, ownerUserId: 7, isShared: false,
  title: 'Monthly report', actorUserId: 7, actorName: 'Employee', eventType: 'CREATED',
  subtaskTitle: null, affectedUserName: null, changeField: null,
  createdAtUtc: '2026-10-26T09:00:00.000Z',
}

const activity = (id: number, offset: number, update: Partial<DashboardActivity> = {}): DashboardActivity => ({
  ...base, id, createdAtUtc: new Date(Date.parse(base.createdAtUtc) + offset * 1000).toISOString(), ...update,
})

describe('Home recent activity', () => {
  it('combines adjacent short bursts on the same task and preserves their individual actions', () => {
    const groups = groupDashboardActivity([
      activity(3, 50, { eventType: 'SUBTASK_CREATED', subtaskTitle: 'Check report' }),
      activity(2, 20, { eventType: 'GENERAL_TASK_ASSIGNED', affectedUserName: 'Colleague' }),
      activity(1, 0),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.events.map(event => event.eventType)).toEqual([
      'SUBTASK_CREATED', 'GENERAL_TASK_ASSIGNED', 'CREATED',
    ])
  })

  it('does not combine activity across tasks, employees, meeting types or long time gaps', () => {
    const groups = groupDashboardActivity([
      activity(5, 200),
      activity(4, 180, { actorUserId: 8 }),
      activity(3, 160, { objectId: 100 }),
      activity(2, 140, { kind: 'MEETING' }),
      activity(1, 0),
    ])
    expect(groups).toHaveLength(5)
  })

  it('does not surface unexpected activity field names', () => {
    expect(activityDetails(activity(2, 0, {changeField: 'email'})).changeField).toBeNull()
    expect(activityDetails(activity(2, 0, {changeField: 'dueDate'})).changeField).toBe('dueDate')
  })

  it('humanizes older activity types instead of saying generic Task activity', () => {
    expect(humanizeActivityType('GENERAL_TASK_ASSIGNED')).toBe('General Task Assigned')
  })
})

