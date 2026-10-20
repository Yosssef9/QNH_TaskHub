import { describe, expect, it } from 'vitest'
import { taskHref } from './dashboard-work.links'
import type { WorkItem } from './types/dashboard-work.types'

const item:WorkItem={taskId:21,ownerUserId:9,ownerName:'Owner',listId:null,listName:null,
  meetingId:null,title:'Task',status:'TODO',priority:'MEDIUM',dueDate:null,createdAtUtc:'2026-10-20T05:00:00Z',
  isAssigned:true,isShared:true,isPersonal:false,isDelegated:false,totalAssignments:1,completedAssignments:0}

describe('work dashboard routes',()=>{
  it('opens the authorized assignment page for assigned tasks',()=>{
    expect(taskHref(item,'assigned')).toBe('/assigned-to-me?taskId=21')
  })
  it('opens the shared-task details when the sharing tab is selected',()=>{
    expect(taskHref(item,'shared')).toBe('/shared-tasks?tab=with&taskId=21')
  })
  it('opens owned tasks from their real List',()=>{
    expect(taskHref({...item,isAssigned:false,isShared:false,isPersonal:true,listId:7},'personal')).toBe('/lists/7?taskId=21')
  })
  it('does not guess a private owner List ID for an assigned task',()=>{
    expect(taskHref({...item,isShared:false},'attention')).toBe('/assigned-to-me?taskId=21')
  })
})
