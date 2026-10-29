import { describe, expect, it } from 'vitest'
import type { CollaborativeMember, CollaborativeView } from './collaboration.api'
import { collaborativeScopeProgress, myCollaborativeAssignment, visibleCollaborativeSubmissions } from './collaborative-workspace.policy'

const make = (id: number, subtaskId: number | null, state: CollaborativeMember['state']='TODO'): CollaborativeMember => ({
  id, userId:id, taskId:1, subtaskId, userName:`User ${id}`, userCode:String(id), email:`${id}@example.test`,
  state, isActive:true, completedAtUtc:null, assignedAtUtc:'2026-10-13T09:00:00Z',
})
const view:CollaborativeView = {
  enabled:true,canManage:false,
  members:[make(1,null),make(2,null,'DONE'),make(1,11),make(2,11),make(3,12)],
  notes:[{id:7,assignmentId:2,note:'Private',createdAtUtc:'2026-10-13T09:00:00Z',authorUserId:2,authorName:'User 2'}],
  files:[],modes:[],progress:[{scopeId:null,total:2,completed:1},{scopeId:11,total:2,completed:0}],
}
describe('collaborative task workspace',()=>{
  it('shows each employee only their own work for each scope',()=>{
    expect(myCollaborativeAssignment(view.members,1,null)?.id).toBe(1)
    expect(myCollaborativeAssignment(view.members,1,11)?.id).toBe(1)
    expect(myCollaborativeAssignment(view.members,2,12)).toBeUndefined()
    expect(visibleCollaborativeSubmissions(view,1,false,11).map(member=>member.id)).toEqual([1])
  })
  it('allows creator to review every assignment in the selected scope, not other scopes',()=>{
    expect(visibleCollaborativeSubmissions(view,99,true,11).map(member=>member.userId)).toEqual([1,2])
    expect(visibleCollaborativeSubmissions(view,99,true,null).map(member=>member.userId)).toEqual([1,2])
  })
  it('retains server-computed aggregate progress without revealing other work',()=>{
    expect(collaborativeScopeProgress(view,null)).toMatchObject({total:2,completed:1})
  })
})
