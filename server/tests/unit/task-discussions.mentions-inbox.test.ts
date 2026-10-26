import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({ query:vi.fn(), access:vi.fn() }))
vi.mock('../../src/database/sql.js',()=>({
  sql:{Int:'Int',BigInt:'BigInt'},
  getDatabasePool:async()=>({request:()=>({
    input(){return this}, query:(statement:string)=>mocks.query(statement),
  })}),
}))
vi.mock('../../src/modules/task-discussions/task-discussions.policy.js',()=>({assertDiscussionAccess:mocks.access}))
vi.mock('../../src/modules/task-discussions/task-discussions.notifications.js',()=>({
  listDiscussionMembers:vi.fn(),notifyDiscussionMembers:vi.fn(),
}))
import {taskDiscussionsService} from '../../src/modules/task-discussions/task-discussions.service.js'
import {AppError} from '../../src/shared/errors/app-error.js'

const example=(messageId:number,taskId=88,subtaskId:number|null=null)=>({
  messageId,taskId,subtaskId,taskTitle:'Monthly quality report',subtaskTitle:null,
  body:`@2101 please review ${messageId}`,createdAtUtc:new Date(`2026-10-${messageId===18?'26':'25'}T10:00:00Z`),
  senderName:'Other employee',authorUserId:100,lastReadMessageId:17,
})

describe('Mentions to Me: message-level Inbox',()=>{
  beforeEach(()=>{mocks.query.mockReset();mocks.access.mockReset().mockResolvedValue(undefined)})
  it('returns multiple messages in the same task individually and preserves read state',async()=>{
    mocks.query.mockResolvedValue({recordset:[example(18),example(17)]})
    const result=await taskDiscussionsService.mentionsInbox(2101,{limit:25})
    expect(result.mentions.map(item=>item.messageId)).toEqual([18,17])
    expect(result.mentions.map(item=>item.unread)).toEqual([true,false])
    expect(result.mentions[0]).toMatchObject({taskId:88,senderName:'Other employee'})
    expect(mocks.access).toHaveBeenCalledTimes(2)
    expect(result.nextCursor).toBeNull()
  })
  it('excludes scopes with revoked permissions without exposing message contents',async()=>{
    mocks.query.mockResolvedValue({recordset:[example(18,88),example(17,77)]})
    mocks.access.mockImplementation(async(_viewer:number,scope:{taskId:number})=>{
      if(scope.taskId===77)throw new AppError({statusCode:404,code:'DISCUSSION_NOT_FOUND',message:'Unavailable.'})
    })
    const result=await taskDiscussionsService.mentionsInbox(2101,{limit:25})
    expect(result.mentions).toHaveLength(1)
    expect(result.mentions[0]?.taskId).toBe(88)
  })
  it('queries stable mentions, legacy @code, and excludes deleted messages',async()=>{
    mocks.query.mockResolvedValue({recordset:[]})
    await taskDiscussionsService.mentionsInbox(2101,{limit:25,beforeId:42})
    const query=String(mocks.query.mock.calls[0]?.[0])
    expect(query).toContain('TM_task_discussion_mentions')
    expect(query).toContain("m.deleted_at_utc IS NULL")
    expect(query).toContain('m.created_at_utc DESC,m.id DESC')
    expect(query).toContain('m.id<@beforeId')
  })
})
