import { describe, expect, it } from 'vitest'
import { canShowOwnedTaskDiscussionShortcut } from './discussion-card-eligibility'
import type { PersonalTask } from '../types/task.types'

function task(id: number, members: number[] = [], overrides: Partial<PersonalTask> = {}): PersonalTask {
  return { id, kpiInstanceId: null, teamMemberCount: members.length,
    teamRoster: members.map(userId => ({ userId, userName: String(userId), userCode: String(userId), email: null, mainAssignee: true })),
    meetingActionItem: null, ...overrides } as PersonalTask
}

describe('My Tasks discussion shortcut', () => {
  it('shows the icon for a one-person assignment plus its creator, even before the unread API responds', () => {
    expect(canShowOwnedTaskDiscussionShortcut(task(31, [200]), 100, undefined)).toBe(true)
  })
  it('keeps a discussion icon with 0 unread messages when the server confirms eligibility', () => {
    expect(canShowOwnedTaskDiscussionShortcut(task(31), 100, {31:0})).toBe(true)
  })
  it('keeps previously discussed tasks visible when no active assignee remains', () => {
    expect(canShowOwnedTaskDiscussionShortcut(task(31), 100, {31:3})).toBe(true)
  })
  it('does not invent an icon for personal tasks or self-assignments', () => {
    expect(canShowOwnedTaskDiscussionShortcut(task(31),100,{})).toBe(false)
    expect(canShowOwnedTaskDiscussionShortcut(task(31,[100]),100,undefined)).toBe(false)
  })
  it('does not use a fallback for non-KPI tasks lacking confirmed roster/user identity', () => {
    expect(canShowOwnedTaskDiscussionShortcut(task(31,[200]),undefined,undefined)).toBe(false)
    expect(canShowOwnedTaskDiscussionShortcut(task(31,[200],{kpiInstanceId:1}),100,{31:5})).toBe(false)
  })
  it('supports multi-assignee tasks without a detailed roster', () => {
    expect(canShowOwnedTaskDiscussionShortcut(task(31,[],{teamMemberCount:3}),100,undefined)).toBe(true)
  })
})
