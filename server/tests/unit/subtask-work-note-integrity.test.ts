import assert from 'node:assert/strict';
import {afterEach,describe,it,vi} from 'vitest';
import {resolveTaskAccess} from '../../src/modules/meeting-action-items/meeting-action-items.access.js';
vi.mock('../../src/modules/meeting-action-items/meeting-action-items.access.js',()=>({resolveTaskAccess:vi.fn()}));
vi.mock('../../src/modules/general-task-assignments/general-task-assignments.email-events.js',()=>({
  notifyTaskOwnerActivity:vi.fn(),notifyGeneralTask:vi.fn(),notifyRemovedAssignment:vi.fn(),
}));
import * as transactions from '../../src/database/transaction.js';
import type {DatabaseTransaction} from '../../src/database/types.js';
import {generalTaskAssignmentsService} from '../../src/modules/general-task-assignments/general-task-assignments.service.js';
import {generalTaskAssignmentsRepository as repo} from '../../src/modules/general-task-assignments/general-task-assignments.repository.js';
import {taskDetailsRepository} from '../../src/modules/task-details/task-details.repository.js';
import {tasksRepository} from '../../src/modules/tasks/tasks.repository.js';
import {meetingActionItemsRepository} from '../../src/modules/meeting-action-items/meeting-action-items.repository.js';
import {collaborationRepository} from '../../src/modules/collaboration/collaboration.repository.js';
import {taskRecord,subtaskRecord} from '../fixtures/meeting-action-items.fixture.js';

const OWNER=100, ASSIGNEE=200, TASK=123, SUBTASK=456;
const task=taskRecord({id:TASK,title:'IT work',actionMeetingId:null,actionMeetingTitle:null,
  actionAssigneeUserId:null,actionAssigneeName:null,actionAssignedByUserId:null,
  actionAssignedByName:null,actionAgendaItemId:null,actionAgendaTitle:null,
  actionAssignedAtUtc:null,autoCompletedFromSubtasks:false,completionSummary:null});

afterEach(()=>vi.restoreAllMocks());
function setup(){
  const transaction={} as DatabaseTransaction;
  vi.spyOn(transactions,'withTransaction').mockImplementation(async fn=>fn(transaction));
  vi.spyOn(taskDetailsRepository,'findSubtaskAccess').mockResolvedValue({taskId:TASK,ownerUserId:OWNER});
  vi.spyOn(taskDetailsRepository,'findSubtask').mockResolvedValue({...subtaskRecord(),id:SUBTASK,taskId:TASK,title:'Subtask',workNotes:'Historical writing'});
  vi.spyOn(tasksRepository,'findOwnedForUpdate').mockResolvedValue(task);
  vi.spyOn(collaborationRepository,'active').mockResolvedValue(false);
  vi.spyOn(meetingActionItemsRepository,'findContext').mockResolvedValue(null);
  vi.mocked(resolveTaskAccess).mockResolvedValue({
    ownerUserId:OWNER,context:null,collaborationActive:false,
    generalAssignment:{taskId:TASK,ownerUserId:OWNER,assigneeUserId:ASSIGNEE,
      assignedByUserId:OWNER,assignedAtUtc:'2026-10-27T00:00:00Z',rowVersion:'0x0000000000000001'},
    capabilities:{role:'OWNER',canEditDetails:true,canManageSubtasks:true,canCompleteSubtasks:true,
      canUploadAttachments:true,canDeleteAnyAttachment:true,canCompleteTask:false,
      canChangeNonCompletionStatus:true,canDeleteRestoreTask:true},
  });
  vi.spyOn(repo,'findContext').mockResolvedValue({taskId:TASK,ownerUserId:OWNER,assigneeUserId:ASSIGNEE,
    assignedByUserId:OWNER,assignedAtUtc:'2026-10-27T00:00:00Z',rowVersion:'0x0000000000000001'});
  vi.spyOn(repo,'effectiveSubtaskAssignee').mockResolvedValue(ASSIGNEE);
  const addNote=vi.spyOn(repo,'addWorkNote').mockResolvedValue(99);
  const writeAssignment=vi.spyOn(repo,'setSubtaskAssignee').mockResolvedValue(undefined);
  const activity=vi.spyOn(tasksRepository,'addActivity').mockResolvedValue(undefined);
  return {addNote,writeAssignment,activity};
}

describe('Legacy subtask Work Note authorship and assignment protection',()=>{
  it('rejects creator self-assignment while someone else is responsible',async()=>{
    const {writeAssignment}=setup();
    await assert.rejects(generalTaskAssignmentsService.assignSubtask(OWNER,SUBTASK,OWNER),
      {statusCode:409,code:'SUBTASK_CREATOR_SELF_ASSIGNMENT'});
    assert.equal(writeAssignment.mock.calls.length,0);
  });
  it('blocks changing main responsibility while an explicit creator-assigned subtask remains',async()=>{
    const {writeAssignment}=setup();
    vi.spyOn(repo,'isEligibleUser').mockResolvedValue(true);
    vi.spyOn(repo,'ownerHasExplicitSubtaskAssignment').mockResolvedValue(true);
    const ensure=vi.spyOn(repo,'ensureRelation').mockResolvedValue(undefined);
    vi.spyOn(repo,'findContext').mockResolvedValue(null);
    await assert.rejects(generalTaskAssignmentsService.assignMain(OWNER,TASK,ASSIGNEE),
      {statusCode:409,code:'SUBTASK_OWNER_OVERRIDE_EXISTS'});
    assert.equal(ensure.mock.calls.length,0);
    assert.equal(writeAssignment.mock.calls.length,0);
  });
  it('appends a note as its authenticated author without overwriting historical notes',async()=>{
    const {addNote,activity}=setup();
    await generalTaskAssignmentsService.saveWorkNotes(ASSIGNEE,SUBTASK,'  New contribution  ');
    assert.deepEqual(addNote.mock.calls[0]?.slice(1),[OWNER,TASK,SUBTASK,ASSIGNEE,'New contribution']);
    assert.equal(activity.mock.calls[0]?.[3],'SUBTASK_WORK_NOTES_UPDATED');
    assert.equal(activity.mock.calls[0]?.[5],ASSIGNEE);
    assert.deepEqual(activity.mock.calls[0]?.[4],{subtaskId:SUBTASK,subtaskTitle:'Subtask',noteId:99});
  });
  it('rejects an unassigned actor writing another person’s subtask notes',async()=>{
    const {addNote}=setup();
    await assert.rejects(generalTaskAssignmentsService.saveWorkNotes(OWNER,SUBTASK,'Changed'),
      {statusCode:403,code:'WORK_NOTES_FORBIDDEN'});
    assert.equal(addNote.mock.calls.length,0);
  });
  it('rejects empty notes before inserting an entry',async()=>{
    const {addNote}=setup();
    await assert.rejects(generalTaskAssignmentsService.saveWorkNotes(ASSIGNEE,SUBTASK,'  '),
      {statusCode:400,code:'WORK_NOTE_EMPTY'});
    assert.equal(addNote.mock.calls.length,0);
  });
});
