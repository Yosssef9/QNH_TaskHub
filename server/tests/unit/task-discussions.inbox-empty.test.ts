import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  access: vi.fn(),
  members: vi.fn(),
  skip: undefined as unknown,
}))
vi.mock('../../src/database/sql.js', () => ({
  sql: {Int:'Int',BigInt:'BigInt'},
  getDatabasePool: async () => ({
    request: () => ({
      input(name:string,_type:unknown,value:unknown){
        // Record skip offset when paginating empty conversations.
        if(name==='skip') mocks.skip=value
        return this
      },
      query: (statement:string) => mocks.query(statement),
    }),
  }),
}))
vi.mock('../../src/modules/task-discussions/task-discussions.policy.js', () => ({
  assertDiscussionAccess: mocks.access,
}))
vi.mock('../../src/modules/task-discussions/task-discussions.notifications.js', () => ({
  listDiscussionMembers: mocks.members,
  notifyDiscussionMembers: vi.fn(),
}))

import { taskDiscussionsService } from '../../src/modules/task-discussions/task-discussions.service.js'

const emptyTask={taskId:25,subtaskId:null,taskTitle:'Monthly report',subtaskTitle:null}
const emptyChild={taskId:25,subtaskId:9,taskTitle:'Monthly report',subtaskTitle:'Review data'}
const person=(userId:number)=>({userId,userCode:String(userId),userName:`Employee ${userId}`,role:'participant',canView:true,canSend:true})

describe('My Discussions: empty scope discovery',()=>{
  beforeEach(()=>{
    mocks.query.mockReset()
    mocks.access.mockReset().mockResolvedValue(undefined)
    mocks.members.mockReset().mockResolvedValue([person(10),person(20)])
    mocks.skip=undefined
  })
  it('lists an authorized two-person task with no message history',async()=>{
    mocks.query.mockResolvedValue({recordset:[emptyTask]})
    const result=await taskDiscussionsService.inbox(10,{filter:'empty',limit:25})
    expect(result.conversations).toEqual([expect.objectContaining({taskId:25,subtaskId:null,lastMessageId:0,participantCount:2,unread:0})])
    expect(result.nextCursor).toBeNull()
    expect(mocks.members).toHaveBeenCalledWith(10,{taskId:25,subtaskId:null})
    expect(mocks.query.mock.calls[0][0]).toContain('NOT EXISTS(SELECT 1 FROM dbo.TM_task_discussion_messages')
  })
  it('does not list personal conversations with fewer than two authorized users',async()=>{
    mocks.query.mockResolvedValue({recordset:[emptyTask]})
    mocks.members.mockResolvedValue([person(10)])
    const result=await taskDiscussionsService.inbox(10,{filter:'empty',limit:25})
    expect(result.conversations).toHaveLength(0)
  })
  it('discovers individually accessible subtask scopes',async()=>{
    mocks.query.mockResolvedValue({recordset:[emptyChild]})
    const result=await taskDiscussionsService.inbox(10,{filter:'empty',limit:25})
    expect(result.conversations[0]).toMatchObject({taskId:25,subtaskId:9,subtaskTitle:'Review data'})
  })
  it('includes an unstarted task after active conversations in the All filter',async()=>{
    mocks.query.mockImplementation(async (statement:string)=>{
      if(statement.includes('WITH recent AS'))return {recordset:[{
        taskId:12,subtaskId:null,taskTitle:'Existing chat',subtaskTitle:null,
        lastMessageId:55,lastBody:'Hello',lastAtUtc:new Date('2026-10-25T12:00:00Z'),senderName:'Employee 20',
      }]}
      if(statement.includes('SUM(CASE WHEN'))return {recordset:[{unread:0,mentions:0}]}
      if(statement.includes('WITH candidateScopes AS'))return {recordset:[emptyTask]}
      throw new Error('Unexpected database query')
    })
    const result=await taskDiscussionsService.inbox(10,{filter:'all',limit:2})
    expect(result.conversations.map(item=>item.lastMessageId)).toEqual([55,0])
    expect(result.conversations.every(item=>item.participantCount===2)).toBe(true)
  })
  it('preserves a one-person historical conversation without listing it as unstarted',async()=>{
    mocks.members.mockResolvedValue([person(10)])
    mocks.query.mockImplementation(async(statement:string)=>{
      if(statement.includes('WITH recent AS'))return {recordset:[{
        taskId:12,subtaskId:null,taskTitle:'Existing personal history',subtaskTitle:null,
        lastMessageId:55,lastBody:'Saved note',lastAtUtc:new Date('2026-10-25T12:00:00Z'),senderName:'Employee 10',
      }]}
      if(statement.includes('SUM(CASE WHEN'))return {recordset:[{unread:0,mentions:0}]}
      if(statement.includes('WITH candidateScopes AS'))return {recordset:[]}
      throw new Error('Unexpected database query')
    })
    const result=await taskDiscussionsService.inbox(10,{filter:'all',limit:25})
    expect(result.conversations).toEqual([expect.objectContaining({taskId:12,lastMessageId:55,participantCount:1})])
  })
  it('paginates empty scopes using a distinct negative cursor',async()=>{
    mocks.query.mockResolvedValue({recordset:[emptyTask,emptyChild]})
    const first=await taskDiscussionsService.inbox(10,{filter:'empty',limit:1})
    expect(first.nextCursor).toBe(-2)
    const second=await taskDiscussionsService.inbox(10,{filter:'empty',limit:25,beforeId:first.nextCursor!})
    expect(mocks.skip).toBe(1)
    expect(second.conversations.length).toBe(2) // stub always returns two rows
  })
  it('keeps unread and mentions filters separate from empty scopes',async()=>{
    mocks.query.mockResolvedValue({recordset:[]})
    const result=await taskDiscussionsService.inbox(10,{filter:'unread',limit:25})
    expect(result.conversations).toEqual([])
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })
})

