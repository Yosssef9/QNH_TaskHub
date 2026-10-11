import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import * as transactions from "../../src/database/transaction.js";
import type { DatabaseTransaction } from "../../src/database/types.js";
import { generalTaskAssignmentsRepository } from "../../src/modules/general-task-assignments/general-task-assignments.repository.js";
import { reconcileParentCompletion } from "../../src/modules/general-task-assignments/general-task-assignments.completion.js";
import { meetingActionItemsRepository } from "../../src/modules/meeting-action-items/meeting-action-items.repository.js";
import { resolveTaskAccess } from "../../src/modules/meeting-action-items/meeting-action-items.access.js";
import { notificationsRepository } from "../../src/modules/notifications/notifications.repository.js";
import { taskDetailsRepository } from "../../src/modules/task-details/task-details.repository.js";
import { taskDetailsService } from "../../src/modules/task-details/task-details.service.js";
import { tasksRepository } from "../../src/modules/tasks/tasks.repository.js";
import { taskRecord, subtaskRecord, attachmentRecord } from "../fixtures/meeting-action-items.fixture.js";

const CREATOR=100, MAIN=200, CHILD=300, OTHER=400, TASK=1001, HIDDEN=2002, VISIBLE=2001;
const relation={taskId:TASK,ownerUserId:CREATOR,assigneeUserId:MAIN,assignedByUserId:CREATOR,
  assignedAtUtc:"2026-10-11T07:00:00.000Z",rowVersion:"0x0000000000000001"};
const task=taskRecord({id:TASK,title:"General work",actionMeetingId:null,actionMeetingTitle:null,
  actionAssigneeUserId:null,actionAssigneeName:null,actionAssignedByUserId:null,
  actionAssignedByName:null,actionAgendaItemId:null,actionAgendaTitle:null,actionAssignedAtUtc:null,
  autoCompletedFromSubtasks:false,completionSummary:null,subtaskTotal:2,subtaskCompleted:1});

afterEach(()=>vi.restoreAllMocks());

function arrange() {
  vi.spyOn(meetingActionItemsRepository,"findContext").mockResolvedValue(null);
  vi.spyOn(generalTaskAssignmentsRepository,"findContext").mockResolvedValue(relation);
  const allowed=vi.spyOn(generalTaskAssignmentsRepository,"hasAccessToTask").mockResolvedValue(true);
  const visible=vi.spyOn(generalTaskAssignmentsRepository,"visibleSubtaskIds").mockResolvedValue([VISIBLE]);
  vi.spyOn(tasksRepository,"findOwnedById").mockResolvedValue(task);
  const subtasks=vi.spyOn(taskDetailsRepository,"listSubtasks").mockResolvedValue([
    {...subtaskRecord(),id:VISIBLE,taskId:TASK,title:"My assigned child",assigneeUserId:CHILD},
    {...subtaskRecord(),id:HIDDEN,taskId:TASK,title:"Another user's confidential child",assigneeUserId:OTHER},
  ]);
  const attachments=vi.spyOn(taskDetailsRepository,"listAttachments").mockResolvedValue([
    {...attachmentRecord(),id:"00000000-0000-0000-0000-000000000001",taskId:null,subtaskId:VISIBLE},
    {...attachmentRecord(),id:"00000000-0000-0000-0000-000000000002",taskId:null,subtaskId:HIDDEN,originalFileName:"secret.pdf"},
    {...attachmentRecord(),id:"00000000-0000-0000-0000-000000000003",taskId:TASK,subtaskId:null},
  ]);
  const activity=vi.spyOn(taskDetailsRepository,"listActivity").mockResolvedValue([
    {id:1,actorUserId:OTHER,actorName:"Other",activityType:"SUBTASK_UPDATED",
      eventDataJson:JSON.stringify({subtaskId:HIDDEN,title:"secret"}),createdAtUtc:new Date()},
    {id:2,actorUserId:CHILD,actorName:"Child",activityType:"SUBTASK_COMPLETED",
      eventDataJson:JSON.stringify({subtaskId:VISIBLE}),createdAtUtc:new Date()},
    {id:3,actorUserId:CREATOR,actorName:"Creator",activityType:"STATUS_CHANGED",
      eventDataJson:JSON.stringify({from:"TODO",to:"IN_PROGRESS"}),createdAtUtc:new Date()},
  ]);
  return {allowed,visible,subtasks,attachments,activity};
}

describe("General task relationship-scoped visibility",()=>{
  it("allows a child assignee to see parent context but only their child/file/activity",async()=>{
    arrange();
    const details=await taskDetailsService.get(CHILD,TASK);
    assert.equal(details.task.title,"General work");
    assert.equal(details.task.listId,null);
    assert.equal(details.progress.total,2);
    assert.deepEqual(details.subtasks.map(item=>item.id),[VISIBLE]);
    assert.deepEqual(details.attachments.map(item=>item.subtaskId),[VISIBLE,null]);
    assert.deepEqual(details.activity.map(item=>item.activityType),["SUBTASK_COMPLETED","STATUS_CHANGED"]);
    assert.equal(details.capabilities.canEditDetails,false);
  });

  it("leaves unrelated people unable to open the main task",async()=>{
    const mocks=arrange();mocks.allowed.mockResolvedValue(false);
    assert.equal(await resolveTaskAccess(OTHER,TASK),null);
    await assert.rejects(taskDetailsService.get(OTHER,TASK),{statusCode:404});
  });

  it("shows the creator all child details",async()=>{
    arrange();
    const details=await taskDetailsService.get(CREATOR,TASK);
    assert.equal(details.subtasks.length,2);
    assert.equal(details.attachments.length,3);
    assert.equal(details.activity.length,3);
  });

  it("blocks child executor from completing a different person's subtask",async()=>{
    arrange();
    const transaction={} as DatabaseTransaction;
    vi.spyOn(transactions,"withTransaction").mockImplementation(async operation=>operation(transaction));
    vi.spyOn(taskDetailsRepository,"findSubtaskAccess").mockResolvedValue({taskId:TASK,ownerUserId:CREATOR});
    vi.spyOn(generalTaskAssignmentsRepository,"effectiveSubtaskAssignee").mockResolvedValue(OTHER);
    const write=vi.spyOn(taskDetailsRepository,"completeSubtask").mockResolvedValue(undefined);
    await assert.rejects(taskDetailsService.completeSubtask(CHILD,HIDDEN,true),
      {statusCode:403,code:"SUBTASK_NOT_ASSIGNED_TO_YOU"});
    assert.equal(write.mock.calls.length,0);
  });
});

describe("Automatic parent completion",()=>{
  it("completes all finished children together with task audit and creator notification",async()=>{
    const query=vi.fn().mockResolvedValue({recordset:[]});
    const request=()=>({input(){return this;},query});
    const transaction={request} as unknown as DatabaseTransaction;
    vi.spyOn(generalTaskAssignmentsRepository,"countIncompleteSubtasks").mockResolvedValue({total:3,incomplete:0});
    vi.spyOn(meetingActionItemsRepository,"findContext").mockResolvedValue(null);
    vi.spyOn(generalTaskAssignmentsRepository,"findContext").mockResolvedValue(relation);
    const activity=vi.spyOn(tasksRepository,"addActivity").mockResolvedValue(undefined);
    const notify=vi.spyOn(notificationsRepository,"ensureGeneralTaskNotification").mockResolvedValue(undefined);
    await reconcileParentCompletion(transaction,task,CREATOR,TASK,CHILD);
    assert.equal(query.mock.calls.length,1);
    assert.equal(activity.mock.calls[0]?.[3],"STATUS_CHANGED");
    assert.equal(notify.mock.calls.length,2);
  });

  it("never automatically completes a cancelled task",async()=>{
    const transaction={} as DatabaseTransaction;
    const counts=vi.spyOn(generalTaskAssignmentsRepository,"countIncompleteSubtasks");
    await reconcileParentCompletion(transaction,{...task,status:"CANCELLED"},CREATOR,TASK,CHILD);
    assert.equal(counts.mock.calls.length,0);
  });
});
