import { describe, expect, it } from 'vitest'
import { taskActivityDetails } from './task-activity-details'
import type { TaskActivity } from '../types/task.types'
const record = (eventData:Record<string,unknown>|null):TaskActivity => ({
  id:1,actorUserId:573,actorName:'Current name',actorUserCode:'2101',actorEmail:'current@example.org',
  activityType:'COLLAB_NOTE_ADDED',eventData,createdAtUtc:'2026-10-13T12:00:00Z',
})
describe('Task activity historic subtask labels',()=>{
  it('preserves original subtask title and identity snapshots after a rename',()=>{
    const result=taskActivityDetails(record({subtaskId:11,subtaskTitle:'Old Firewall Name',actorCode:'OLD-1',actorEmail:'old@example.org'}),[{id:11,title:'New Firewall Name'}])
    expect(result.subtaskTitle).toBe('Old Firewall Name')
    expect(result.actorCode).toBe('OLD-1')
    expect(result.actorEmail).toBe('old@example.org')
  })
  it('falls back to current title for old events without snapshots',()=>{
    expect(taskActivityDetails(record({subtaskId:11}),[{id:11,title:'Firewall'}]).subtaskTitle).toBe('Firewall')
  })
  it('does not invent a subtask for a main-task event',()=>{
    expect(taskActivityDetails(record({subtaskId:null}),[{id:11,title:'Firewall'}]).subtaskTitle).toBeNull()
  })
})
