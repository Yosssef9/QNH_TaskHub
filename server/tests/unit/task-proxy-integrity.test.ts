import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import type { DatabaseTransaction } from '../../src/database/types.js';
import * as transactions from '../../src/database/transaction.js';
import { resolveTaskAccess } from '../../src/modules/meeting-action-items/meeting-action-items.access.js';
import { generalTaskAssignmentsService } from '../../src/modules/general-task-assignments/general-task-assignments.service.js';
import { generalTaskAssignmentsRepository as assignments } from '../../src/modules/general-task-assignments/general-task-assignments.repository.js';
import { taskProxiesRepository } from '../../src/modules/general-task-assignments/task-proxies.repository.js';
import { tasksRepository } from '../../src/modules/tasks/tasks.repository.js';
import { taskDetailsRepository } from '../../src/modules/task-details/task-details.repository.js';
import { notifyGeneralTask, notifyRemovedAssignment } from '../../src/modules/general-task-assignments/general-task-assignments.email-events.js';
import { taskRecord } from '../fixtures/meeting-action-items.fixture.js';

vi.mock('../../src/modules/meeting-action-items/meeting-action-items.access.js',()=>({resolveTaskAccess:vi.fn()}));
vi.mock('../../src/modules/general-task-assignments/general-task-assignments.email-events.js',()=>({
  notifyGeneralTask:vi.fn(),notifyRemovedAssignment:vi.fn(),notifyTaskOwnerActivity:vi.fn(),
}));
const OWNER=100, RESPONSIBLE=200, PROXY=300, OTHER=400, TASK=789, CHILD=790;
const baseTask=taskRecord({id:TASK,title:'IT report',actionMeetingId:null,actionMeetingTitle:null,
  actionAssigneeUserId:null,actionAssigneeName:null,actionAssignedByUserId:null,
  actionAssignedByName:null,actionAgendaItemId:null,actionAgendaTitle:null,actionAssignedAtUtc:null});
const activeAccess=(actor:number)=>({
  ownerUserId:OWNER,context:null,collaborationActive:false,
  generalAssignment:{taskId:TASK,ownerUserId:OWNER,assigneeUserId:RESPONSIBLE,
    assignedByUserId:OWNER,assignedAtUtc:'2026-10-29T00:00:00Z',rowVersion:'0x0000000000000001'},
  capabilities:{role:'ASSIGNEE' as const,canEditDetails:false,canManageSubtasks:false,
    canCompleteSubtasks:true,canUploadAttachments:true,canDeleteAnyAttachment:false,
    canCompleteTask:true,canChangeNonCompletionStatus:true,canDeleteRestoreTask:false},
  ...(actor===PROXY?{proxyGrant:{id:10,taskId:TASK,subtaskId:null,principalUserId:RESPONSIBLE,
    proxyUserId:PROXY,proxyName:'Proxy',proxyCode:'300',appointedAtUtc:'2026-10-29T00:00:00Z'}}:{}),
});
function setup(){
  const transaction={request:vi.fn(()=>({input:vi.fn().mockReturnThis(),query:vi.fn().mockResolvedValue({recordset:[]})}))} as unknown as DatabaseTransaction;
  vi.spyOn(transactions,'withTransaction').mockImplementation(async fn=>fn(transaction));
  vi.spyOn(tasksRepository,'findOwnedForUpdate').mockResolvedValue(baseTask);
  vi.spyOn(tasksRepository,'addActivity').mockResolvedValue(undefined);
  vi.spyOn(taskProxiesRepository,'grants').mockResolvedValue([]);
  vi.spyOn(taskProxiesRepository,'set').mockResolvedValue(true);
  vi.spyOn(assignments,'isEligibleUser').mockResolvedValue(true);
  vi.mocked(resolveTaskAccess).mockResolvedValue(activeAccess(RESPONSIBLE));
  return transaction;
}
afterEach(()=>vi.restoreAllMocks());

describe('Task Proxy accountability and access',()=>{
  it('only the original responsible user can appoint a proxy, with audit attribution',async()=>{
    setup();
    await generalTaskAssignmentsService.setProxy(RESPONSIBLE,TASK,null,PROXY);
    assert.equal(vi.mocked(taskProxiesRepository.set).mock.calls[0]?.[1]?.proxyId,PROXY);
    const audit=vi.mocked(tasksRepository.addActivity).mock.calls[0];
    assert.equal(audit?.[3],'TASK_PROXY_ASSIGNED');
    assert.equal(audit?.[5],RESPONSIBLE);
    assert.equal(vi.mocked(notifyGeneralTask).mock.calls[0]?.[1]?.[0],PROXY);
  });
  it('creator cannot manage the employee proxy',async()=>{
    setup();
    vi.mocked(resolveTaskAccess).mockResolvedValueOnce({...activeAccess(OWNER),capabilities:{...activeAccess(OWNER).capabilities,role:'OWNER'}});
    await assert.rejects(generalTaskAssignmentsService.setProxy(OWNER,TASK,null,PROXY));
    assert.equal(vi.mocked(taskProxiesRepository.set).mock.calls.length,0);
  });
  it('an existing proxy cannot delegate further',async()=>{
    setup();
    vi.mocked(resolveTaskAccess).mockResolvedValueOnce(activeAccess(PROXY));
    await assert.rejects(generalTaskAssignmentsService.setProxy(PROXY,TASK,null,OTHER));
    assert.equal(vi.mocked(taskProxiesRepository.set).mock.calls.length,0);
  });
  it('responsible assignee cannot appoint themselves or the task creator',async()=>{
    setup();
    await assert.rejects(generalTaskAssignmentsService.setProxy(RESPONSIBLE,TASK,null,RESPONSIBLE),{code:'TASK_PROXY_INVALID'});
    await assert.rejects(generalTaskAssignmentsService.setProxy(RESPONSIBLE,TASK,null,OWNER),{code:'TASK_PROXY_INVALID'});
  });
  it('removing the proxy writes an audit event and revokes the old grant',async()=>{
    setup();
    vi.mocked(taskProxiesRepository.grants).mockResolvedValueOnce([{
      id:1,taskId:TASK,subtaskId:null,principalUserId:RESPONSIBLE,proxyUserId:PROXY,
      proxyName:'Mohammed',proxyCode:'300',appointedAtUtc:'2026-10-29T00:00:00Z',
    }]);
    await generalTaskAssignmentsService.setProxy(RESPONSIBLE,TASK,null,null);
    assert.equal(vi.mocked(taskProxiesRepository.set).mock.calls[0]?.[1]?.proxyId,null);
    assert.equal(vi.mocked(tasksRepository.addActivity).mock.calls[0]?.[3],'TASK_PROXY_REMOVED');
    assert.equal(vi.mocked(notifyRemovedAssignment).mock.calls[0]?.[2],PROXY);
  });
  it('delegation on an individual subtask requires its own responsible assignee',async()=>{
    setup();
    vi.spyOn(taskDetailsRepository,'findSubtask').mockResolvedValue({taskId:TASK,id:CHILD} as never);
    vi.spyOn(assignments,'effectiveSubtaskAssignee').mockResolvedValue(OTHER);
    await assert.rejects(generalTaskAssignmentsService.setProxy(RESPONSIBLE,TASK,CHILD,PROXY),{code:'TASK_PROXY_MANAGE_FORBIDDEN'});
    assert.equal(vi.mocked(taskProxiesRepository.set).mock.calls.length,0);
  });
  it('summary entries remain authored by the actual proxy, not their principal',async()=>{
    setup();
    vi.mocked(resolveTaskAccess).mockResolvedValueOnce(activeAccess(PROXY));
    vi.spyOn(taskProxiesRepository,'isExecutor').mockResolvedValue(true);
    const insert=vi.spyOn(assignments,'addCompletionSummaryEntry').mockResolvedValue(99);
    await generalTaskAssignmentsService.saveCompletionSummary(PROXY,TASK,'Work completed');
    assert.deepEqual(insert.mock.calls[0]?.slice(1),[OWNER,TASK,PROXY,'Work completed']);
  });
});
