import { describe, expect, it } from 'vitest'
import { discussionReadReceipts } from '../../src/modules/task-discussions/task-discussions.read-receipts.js'

const members=[
  {userId:1,userName:'Author'},
  {userId:2,userName:'Reader'},
  {userId:3,userName:'Pending'},
]

describe('discussion receipt identities',()=>{
  it('returns authorized recipients excluding the author, with read status from the cursor',()=>{
    expect(discussionReadReceipts(members,new Map([[2,51],[3,48]]),50,1)).toEqual([
      {userId:2,userName:'Reader',read:true},
      {userId:3,userName:'Pending',read:false},
    ])
  })
  it('does not count the author or an unread recipient with no saved cursor',()=>{
    expect(discussionReadReceipts(members,new Map([[1,100],[2,4]]),5,1)).toEqual([
      {userId:2,userName:'Reader',read:false},
      {userId:3,userName:'Pending',read:false},
    ])
  })
  it('does not expose identities outside the provided authorized member list',()=>{
    expect(discussionReadReceipts([members[0]!,members[1]!],new Map([[2,10],[99,100]]),10,1)).toEqual([
      {userId:2,userName:'Reader',read:true},
    ])
  })
})
