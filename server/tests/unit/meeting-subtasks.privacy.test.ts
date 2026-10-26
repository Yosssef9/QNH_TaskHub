import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import { authRepository } from "../../src/modules/auth/auth.repository.js";
import { generalTaskAssignmentsRepository } from "../../src/modules/general-task-assignments/general-task-assignments.repository.js";
import { meetingActionItemsRepository } from "../../src/modules/meeting-action-items/meeting-action-items.repository.js";
import { meetingWorkspaceRepository } from "../../src/modules/meetings/meeting-workspace.repository.js";
import { taskDetailsRepository } from "../../src/modules/task-details/task-details.repository.js";
import { taskDetailsService } from "../../src/modules/task-details/task-details.service.js";
import { tasksRepository } from "../../src/modules/tasks/tasks.repository.js";
import { ASSIGNEE, OWNER, TASK, VIEWER, accessProfile, actionContext, attachmentRecord,
  meetingContext, subtaskRecord, taskRecord } from "../fixtures/meeting-action-items.fixture.js";

const childOfViewer = 3001;
const childOfMain = 3002;

function setup() {
  vi.spyOn(meetingActionItemsRepository, "findContext").mockResolvedValue(actionContext());
  vi.spyOn(meetingWorkspaceRepository, "findAccessContext").mockResolvedValue(meetingContext());
  vi.spyOn(authRepository, "findAccessProfile").mockResolvedValue(accessProfile());
  vi.spyOn(tasksRepository, "findOwnedById").mockResolvedValue(taskRecord());
  vi.spyOn(generalTaskAssignmentsRepository, "visibleSubtaskIds").mockImplementation(
    async (_, actor) => actor === VIEWER ? [childOfViewer] : actor === ASSIGNEE ? [childOfMain] : [],
  );
  vi.spyOn(taskDetailsRepository, "listSubtasks").mockResolvedValue([
    { ...subtaskRecord(), id: childOfViewer, title: "Private to Viewer", workNotes: "Viewer notes", assigneeUserId: VIEWER },
    { ...subtaskRecord(), id: childOfMain, title: "Private to main assignee", workNotes: "Confidential sibling notes", assigneeUserId: ASSIGNEE },
  ]);
  vi.spyOn(taskDetailsRepository, "listAttachments").mockResolvedValue([
    attachmentRecord({ id: "11111111-1111-4111-8111-111111111111", subtaskId: childOfViewer, originalFileName: "viewer.pdf" }),
    attachmentRecord({ id: "33333333-3333-4333-8333-333333333333", subtaskId: childOfMain, originalFileName: "secret.pdf" }),
    attachmentRecord({ id: "44444444-4444-4444-8444-444444444444", subtaskId: null, originalFileName: "shared-parent.pdf" }),
  ]);
  const when = new Date("2026-10-12T07:00:00Z");
  vi.spyOn(taskDetailsRepository, "findCreator").mockResolvedValue({userId:100,userName:"Task creator",userCode:"0100"});
  vi.spyOn(taskDetailsRepository, "listActivity").mockResolvedValue([
    { id: 1, activityType: "SUBTASK_COMPLETED", eventDataJson: JSON.stringify({ subtaskId: childOfViewer }), actorName: "Viewer", actorUserId: VIEWER, createdAtUtc: when },
    { id: 2, activityType: "SUBTASK_WORK_NOTES_UPDATED", eventDataJson: JSON.stringify({ subtaskId: childOfMain }), actorName: "Main", actorUserId: ASSIGNEE, createdAtUtc: when },
    { id: 3, activityType: "ATTACHMENT_REMOVED", eventDataJson: JSON.stringify({ fileName: "hidden.pdf" }), actorName: "Main", actorUserId: ASSIGNEE, createdAtUtc: when },
    { id: 4, activityType: "SUBTASKS_REORDERED", eventDataJson: null, actorName: "Organizer", actorUserId: OWNER, createdAtUtc: when },
    { id: 5, activityType: "STATUS_CHANGED", eventDataJson: JSON.stringify({ from: "TODO", to: "IN_PROGRESS" }), actorName: "Organizer", actorUserId: OWNER, createdAtUtc: when },
  ]);
}

afterEach(() => vi.restoreAllMocks());

describe("Meeting subtask executor privacy", () => {
  it("shows a child executor just their own child notes/files/activity and global progress", async () => {
    setup();
    const details = await taskDetailsService.get(VIEWER, TASK);
    assert.equal(details.actionItem?.meetingId, 10);
    assert.equal(details.capabilities.role, "ASSIGNEE");
    assert.equal(details.capabilities.canCompleteTask, false);
    assert.deepEqual(details.subtasks.map(s => s.id), [childOfViewer]);
    assert.deepEqual(details.attachments.map(a => a.originalFileName), ["viewer.pdf", "shared-parent.pdf"]);
    assert.deepEqual(details.activity.map(a => a.activityType), ["SUBTASK_COMPLETED", "STATUS_CHANGED"]);
    assert.deepEqual(details.progress, { total: 2, completed: 0, percentage: 0 });
    assert.equal(JSON.stringify(details).includes("Confidential sibling notes"), false);
  });

  it("hides child titles and files from an unrelated invited attendee", async () => {
    setup();
    vi.spyOn(generalTaskAssignmentsRepository, "visibleSubtaskIds").mockResolvedValue([]);
    const details = await taskDetailsService.get(VIEWER, TASK);
    assert.equal(details.capabilities.role, "VIEWER");
    assert.deepEqual(details.subtasks, []);
    assert.deepEqual(details.attachments.map(a => a.originalFileName), ["shared-parent.pdf"]);
    assert.deepEqual(details.activity.map(a => a.activityType), ["STATUS_CHANGED"]);
  });

  it("retains organizer's full child visibility without giving viewers a global permission", async () => {
    setup();
    const details = await taskDetailsService.get(OWNER, TASK);
    assert.equal(details.capabilities.role, "OWNER");
    assert.deepEqual(details.subtasks.map(s => s.id), [childOfViewer, childOfMain]);
  });
});

