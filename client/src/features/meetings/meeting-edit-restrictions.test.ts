// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ApiClientError } from '@/lib/api-error'
import { describeProtectedAgenda, describeProtectedParticipant, meetingMutationErrorMessage } from './meeting-edit-restrictions'

describe('meeting editing dependency messages', () => {
  it('identifies the protected participant and the actual linked-record categories in English', () => {
    const t = i18n.getFixedT('en')
    const result = describeProtectedParticipant(t, ['tasks', 'attendance', 'tasks'], 'Ahmed')
    expect(result).toContain('Ahmed')
    expect(result).toContain('meeting tasks')
    expect(result).toContain('attendance')
    expect(result.match(/meeting tasks/g)).toHaveLength(1)
  })

  it('reports exact counts of linked agenda tasks and decisions', () => {
    const t = i18n.getFixedT('en')
    expect(describeProtectedAgenda(t, { id: 22, taskCount: 3, decisionCount: 1 })).toContain('3 linked tasks')
    expect(describeProtectedAgenda(t, { id: 22, taskCount: 3, decisionCount: 1 })).toContain('1 linked decision')
  })

  it('uses Arabic, not backend English, for a delayed dependency conflict', () => {
    const t = i18n.getFixedT('ar')
    const error = new ApiClientError('English server message', 'HISTORICAL_PARTICIPANT_HAS_DEPENDENCIES', 409, {
      participantUserId: 44, dependencies: ['collaborativeTasks', 'decisions'],
    })
    const message = meetingMutationErrorMessage(t, error, 'تعذر الحفظ')
    expect(message).toContain('مهام تعاونية')
    expect(message).toContain('قرارات')
    expect(message).not.toContain('English server message')
  })

  it('explains a server-side agenda conflict after concurrent creation', () => {
    const t = i18n.getFixedT('en')
    const error = new ApiClientError('SQL error', 'MEETING_AGENDA_HAS_DEPENDENCIES', 409, {
      agendaItemId: 77, links: ['task', 'decision'],
    })
    const message = meetingMutationErrorMessage(t, error, 'Save failed')
    expect(message).toContain('linked tasks')
    expect(message).toContain('linked decisions')
  })
})
