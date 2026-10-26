import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({access:vi.fn(),query:vi.fn()}));
vi.mock('../../src/modules/meeting-action-items/meeting-action-items.access.js',()=>({resolveTaskAccess:mocks.access}));
vi.mock('../../src/database/sql.js',()=>({
  sql:{BigInt:'BigInt',Int:'Int'},
  getDatabasePool:async()=>({request:()=>({input(){return this},query:mocks.query})}),
}));
import { assertDiscussionAccess } from '../../src/modules/task-discussions/task-discussions.policy.js';

describe('task discussion authorization boundaries',()=>{
  beforeEach(()=>{mocks.access.mockReset();mocks.query.mockReset();
    mocks.access.mockResolvedValue({ownerUserId:10,capabilities:{role:'ASSIGNEE'}});
    mocks.query.mockResolvedValue({recordset:[{ownerId:10,status:'IN_PROGRESS',kpi:null,childExists:1,member:1}]});
  });
  it('allows a current main assignee in the main conversation',async()=>{
    await expect(assertDiscussionAccess(20,{taskId:5,subtaskId:null})).resolves.toBeUndefined();
  });
  it('rejects a user with no current assignment to the requested subtask',async()=>{
    mocks.query.mockResolvedValue({recordset:[{ownerId:10,status:'TODO',kpi:null,childExists:1,member:0}]});
    await expect(assertDiscussionAccess(20,{taskId:5,subtaskId:21})).rejects.toMatchObject({statusCode:404});
  });
  it('does not treat a VIEW-only share as a discussion assignment',async()=>{
    mocks.access.mockResolvedValue({ownerUserId:10,sharedPermission:'VIEW',capabilities:{role:'VIEWER'}});
    await expect(assertDiscussionAccess(30,{taskId:5,subtaskId:null})).rejects.toMatchObject({statusCode:404});
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('rejects KPI contexts even if the task is otherwise visible',async()=>{
    mocks.query.mockResolvedValue({recordset:[{ownerId:10,status:'TODO',kpi:8,childExists:1,member:1}]});
    await expect(assertDiscussionAccess(10,{taskId:5,subtaskId:null})).rejects.toMatchObject({statusCode:404});
  });
  it('permits reading cancelled-task history but blocks sending',async()=>{
    mocks.query.mockResolvedValue({recordset:[{ownerId:10,status:'CANCELLED',kpi:null,childExists:1,member:1}]});
    await expect(assertDiscussionAccess(10,{taskId:5,subtaskId:null})).resolves.toBeUndefined();
    await expect(assertDiscussionAccess(10,{taskId:5,subtaskId:null},true)).rejects.toMatchObject({statusCode:409});
  });
  it('denies access when original task authorization fails',async()=>{
    mocks.access.mockResolvedValue(null);
    await expect(assertDiscussionAccess(90,{taskId:5,subtaskId:null})).rejects.toMatchObject({statusCode:404});
  });
});
