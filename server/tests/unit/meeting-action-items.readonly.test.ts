import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import * as transactions from "../../src/database/transaction.js";
import type { DatabaseTransaction } from "../../src/database/types.js";
import { authRepository } from "../../src/modules/auth/auth.repository.js";
import { meetingActionItemsRepository } from "../../src/modules/meeting-action-items/meeting-action-items.repository.js";
import { meetingActionItemsService } from "../../src/modules/meeting-action-items/meeting-action-items.service.js";
import { meetingSchedulingRepository } from "../../src/modules/meetings/meeting-scheduling.repository.js";
import { meetingWorkspaceRepository } from "../../src/modules/meetings/meeting-workspace.repository.js";
import { notificationsRepository } from "../../src/modules/notifications/notifications.repository.js";
import * as storage from "../../src/modules/task-details/attachment-storage.js";
import { taskDetailsRepository } from "../../src/modules/task-details/task-details.repository.js";
import { taskDetailsService } from "../../src/modules/task-details/task-details.service.js";
import { tasksRepository } from "../../src/modules/tasks/tasks.repository.js";
import { tasksService } from "../../src/modules/tasks/tasks.service.js";
import {
  OWNER, ASSIGNEE, VIEWER, TASK, MEETING, SUBTASK, FILE,
  accessProfile, meetingAccess, meetingContext, actionContext,
  taskRecord, subtaskRecord, attachmentRecord,
} from "../fixtures/meeting-action-items.fixture.js";

function arrange(uploadedByUserId = ASSIGNEE) {
  const transaction = {} as DatabaseTransaction;
  vi.spyOn(transactions, "withTransaction").mockImplementation(async (operation) => operation(transaction));
  const relation = vi.spyOn(meetingActionItemsRepository, "findContext").mockResolvedValue(actionContext());
  const profile = vi.spyOn(authRepository, "findAccessProfile").mockResolvedValue(accessProfile());
  const meeting = vi.spyOn(meetingWorkspaceRepository, "findAccessContext").mockResolvedValue(meetingContext());
  const owned = vi.spyOn(tasksRepository, "findOwnedById").mockResolvedValue(taskRecord());
  const locked = vi.spyOn(tasksRepository, "findOwnedForUpdate").mockResolvedValue(taskRecord());
  vi.spyOn(tasksRepository, "ownedListExists").mockResolvedValue(true);
  const update = vi.spyOn(tasksRepository, "update").mockResolvedValue(undefined);
  const status = vi.spyOn(tasksRepository, "changeStatus").mockResolvedValue(undefined);
  const deletion = vi.spyOn(tasksRepository, "setDeleted").mockResolvedValue(undefined);
  const activity = vi.spyOn(tasksRepository, "addActivity").mockResolvedValue(undefined);
  const meetingActivity = vi.spyOn(meetingSchedulingRepository, "addActivity").mockResolvedValue(undefined);
  const notification = vi.spyOn(notificationsRepository, "ensureMeetingActionItemNotification").mockResolvedValue(undefined);
  vi.spyOn(taskDetailsRepository, "listSubtasks").mockResolvedValue([subtaskRecord()]);
  vi.spyOn(taskDetailsRepository, "listAttachments").mockResolvedValue([attachmentRecord({ uploadedByUserId })]);
  vi.spyOn(taskDetailsRepository, "listActivity").mockResolvedValue([]);
  vi.spyOn(taskDetailsRepository, "findSubtaskAccess").mockResolvedValue({ taskId: TASK, ownerUserId: OWNER });
  vi.spyOn(taskDetailsRepository, "findSubtask").mockResolvedValue(subtaskRecord());
  vi.spyOn(taskDetailsRepository, "findAttachmentAccess").mockResolvedValue({ taskId: TASK, ownerUserId: OWNER, uploadedByUserId });
  const file = vi.spyOn(taskDetailsRepository, "findAttachment").mockResolvedValue(attachmentRecord({ uploadedByUserId }));
  const createSubtask = vi.spyOn(taskDetailsRepository, "createSubtask").mockResolvedValue(SUBTASK);
  const updateSubtask = vi.spyOn(taskDetailsRepository, "updateSubtask").mockResolvedValue(undefined);
  const completeSubtask = vi.spyOn(taskDetailsRepository, "completeSubtask").mockResolvedValue(undefined);
  const deleteSubtask = vi.spyOn(taskDetailsRepository, "deleteSubtask").mockResolvedValue(undefined);
  const reorder = vi.spyOn(taskDetailsRepository, "reorderSubtasks").mockResolvedValue(undefined);
  const createFile = vi.spyOn(taskDetailsRepository, "createAttachment").mockResolvedValue(attachmentRecord());
  const deleteFile = vi.spyOn(taskDetailsRepository, "deleteAttachment").mockResolvedValue(undefined);
  const store = vi.spyOn(storage, "storeAttachment").mockResolvedValue("private-test-key.pdf");
  const read = vi.spyOn(storage, "readAttachment").mockResolvedValue(Buffer.from("test"));
  const remove = vi.spyOn(storage, "removeStoredAttachment").mockResolvedValue(undefined);
  return { relation, profile, meeting, owned, locked, file, update, status, deletion,
    activity, meetingActivity, notification, createSubtask, updateSubtask, completeSubtask, deleteSubtask,
    reorder, createFile, deleteFile, store, read, remove };
}

function uploadFile(): Express.Multer.File {
  // The service uses only these fields. No filesystem/network is used in these tests.
  return { originalname: "test.pdf", buffer: Buffer.from("test"), size: 4, mimetype: "application/pdf" } as Express.Multer.File;
}

function assertNoWrites(mocks: ReturnType<typeof arrange>) {
  for (const key of ["update", "status", "deletion", "activity", "meetingActivity", "notification",
    "createSubtask", "updateSubtask", "completeSubtask", "deleteSubtask", "reorder",
    "createFile", "deleteFile", "store", "remove"] as const) {
    assert.equal(mocks[key].mock.calls.length, 0, `${key} must not run for a Viewer`);
  }
}

afterEach(() => vi.restoreAllMocks());

describe("Meeting Viewer read-only server enforcement", () => {
  it("returns full details, subtasks, progress, and attachment metadata read-only", async () => {
    arrange();
    const details = await taskDetailsService.get(VIEWER, TASK);
    assert.equal(details.capabilities.role, "VIEWER");
    assert.equal(details.task.isReadOnly, true);
    assert.equal(details.task.description, "Full task description");
    assert.equal(details.subtasks[0]?.title, "Shared subtask");
    assert.equal(details.progress.total, 1);
    assert.equal(details.attachments[0]?.originalFileName, "test-report.pdf");
    assert.equal(Object.hasOwn(details.attachments[0]!, "storageKey"), false);
    assert.equal(details.actionItem?.assigneeUserId, ASSIGNEE);
  });

  it("also marks the generic GET Task representation read-only", async () => {
    arrange();
    assert.equal((await tasksService.get(VIEWER, TASK)).isReadOnly, true);
  });

  for (const parent of ["task", "subtask"] as const) {
    it(`allows reading a ${parent} attachment through the protected download/preview service`, async () => {
      const mocks = arrange();
      mocks.file.mockResolvedValue(attachmentRecord(parent === "subtask" ? { taskId: null, subtaskId: SUBTASK } : {}));
      const result = await taskDetailsService.download(VIEWER, FILE);
      assert.equal(result.buffer.toString(), "test");
      assert.equal(mocks.read.mock.calls.length, 1);
      assertNoWrites(mocks);
    });
  }

  it("rejects Viewer changes to administrative fields and list placement", async () => {
    const mocks = arrange();
    await assert.rejects(tasksService.update(VIEWER, TASK, {
      title: "Changed", description: "Changed", priority: "HIGH", listId: 9,
    }), { statusCode: 403, code: "TASK_EDIT_FORBIDDEN" });
    assertNoWrites(mocks);
  });

  for (const next of ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const) {
    it(`rejects Viewer status ${next}, including no-op status requests`, async () => {
      const mocks = arrange();
      await assert.rejects(tasksService.changeStatus(VIEWER, TASK, { status: next }), {
        statusCode: 403, code: "TASK_STATUS_FORBIDDEN",
      });
      assertNoWrites(mocks);
    });
  }

  it("rejects Viewer task deletion", async () => {
    const mocks = arrange();
    await assert.rejects(tasksService.remove(VIEWER, TASK), { statusCode: 403, code: "TASK_DELETE_FORBIDDEN" });
    assertNoWrites(mocks);
  });

  it("does not expose or restore a deleted task for a Viewer", async () => {
    const mocks = arrange();
    await assert.rejects(tasksService.restore(VIEWER, TASK), { statusCode: 404, code: "TASK_NOT_FOUND" });
    assertNoWrites(mocks);
  });

  const subtaskWrites = [
    ["create", () => taskDetailsService.createSubtask(VIEWER, TASK, { title: "New" }), "SUBTASK_MANAGEMENT_FORBIDDEN"],
    ["edit", () => taskDetailsService.updateSubtask(VIEWER, SUBTASK, { title: "Changed" }), "SUBTASK_MANAGEMENT_FORBIDDEN"],
    ["delete", () => taskDetailsService.deleteSubtask(VIEWER, SUBTASK), "SUBTASK_MANAGEMENT_FORBIDDEN"],
    ["reorder", () => taskDetailsService.reorder(VIEWER, TASK, [SUBTASK]), "SUBTASK_MANAGEMENT_FORBIDDEN"],
    ["complete", () => taskDetailsService.completeSubtask(VIEWER, SUBTASK, true), "SUBTASK_COMPLETION_FORBIDDEN"],
    ["reopen", () => taskDetailsService.completeSubtask(VIEWER, SUBTASK, false), "SUBTASK_COMPLETION_FORBIDDEN"],
  ] as const;
  for (const [label, operation, code] of subtaskWrites) {
    it(`rejects Viewer subtask ${label}`, async () => {
      const mocks = arrange();
      await assert.rejects(operation(), { statusCode: 403, code });
      assertNoWrites(mocks);
    });
  }

  for (const parent of [{ taskId: TASK }, { subtaskId: SUBTASK }]) {
    it(`rejects Viewer upload to ${JSON.stringify(parent)} before storing bytes`, async () => {
      const mocks = arrange();
      await assert.rejects(taskDetailsService.upload(VIEWER, parent, uploadFile()), {
        statusCode: 403, code: "ATTACHMENT_UPLOAD_FORBIDDEN",
      });
      assertNoWrites(mocks);
    });
  }

  for (const uploader of [ASSIGNEE, VIEWER]) {
    it(`rejects Viewer deletion of attachments uploaded by ${uploader}`, async () => {
      const mocks = arrange(uploader);
      await assert.rejects(taskDetailsService.deleteAttachment(VIEWER, FILE), {
        statusCode: 403, code: "ATTACHMENT_DELETE_FORBIDDEN",
      });
      assertNoWrites(mocks);
    });
  }

  it("rechecks uploader authority inside the transaction after reassignment", async () => {
    const mocks = arrange(ASSIGNEE);
    mocks.relation.mockResolvedValueOnce(actionContext()).mockResolvedValue(actionContext({ assigneeUserId: 400 }));
    await assert.rejects(taskDetailsService.deleteAttachment(ASSIGNEE, FILE), {
      statusCode: 403, code: "ATTACHMENT_DELETE_FORBIDDEN",
    });
    assertNoWrites(mocks);
  });

  it("revoking Meeting visibility blocks details and attachment bytes", async () => {
    const mocks = arrange();
    mocks.meeting.mockResolvedValue(meetingContext({ isAttendee: false }));
    await assert.rejects(taskDetailsService.get(VIEWER, TASK), { statusCode: 404, code: "TASK_NOT_FOUND" });
    await assert.rejects(taskDetailsService.download(VIEWER, FILE), { statusCode: 404, code: "ATTACHMENT_NOT_FOUND" });
    assert.equal(mocks.read.mock.calls.length, 0);
    assertNoWrites(mocks);
  });

  it("does not grant create/reassign privileges to another participant", async () => {
    arrange();
    await assert.rejects(meetingActionItemsService.create(VIEWER, meetingAccess(), MEETING, {
      title: "New", priority: "MEDIUM", assigneeUserId: ASSIGNEE,
    }), { statusCode: 403, code: "MEETING_ORGANIZER_REQUIRED" });
    await assert.rejects(meetingActionItemsService.reassign(VIEWER, meetingAccess(), MEETING, TASK, {
      assigneeUserId: VIEWER, rowVersion: "0x0000000000000001",
    }), { statusCode: 403, code: "MEETING_ORGANIZER_REQUIRED" });
  });

  it("does not grant create/reassign privileges to a Coordinator", async () => {
    const mocks = arrange();
    mocks.meeting.mockResolvedValue(meetingContext({ isAttendee: false }));
    const access = meetingAccess({ meetingCoordinateEnabled: true });
    await assert.rejects(meetingActionItemsService.create(VIEWER, access, MEETING, {
      title: "New", priority: "MEDIUM", assigneeUserId: ASSIGNEE,
    }), { statusCode: 403, code: "MEETING_ORGANIZER_REQUIRED" });
    await assert.rejects(meetingActionItemsService.reassign(VIEWER, access, MEETING, TASK, {
      assigneeUserId: VIEWER, rowVersion: "0x0000000000000001",
    }), { statusCode: 403, code: "MEETING_ORGANIZER_REQUIRED" });
  });
});

describe("Existing Organizer and assignee behavior", () => {
  it("still lets the Organizer edit details", async () => {
    const mocks = arrange();
    await tasksService.update(OWNER, TASK, { title: "Updated by Organizer" });
    assert.equal(mocks.update.mock.calls.length, 1);
    assert.equal(mocks.activity.mock.calls.length, 1);
  });

  it("still prevents the Organizer completing the assigned task", async () => {
    const mocks = arrange();
    await assert.rejects(tasksService.changeStatus(OWNER, TASK, { status: "DONE" }), {
      statusCode: 403, code: "MEETING_ACTION_ITEM_OWNER_CANNOT_COMPLETE",
    });
    assertNoWrites(mocks);
  });

  it("still lets the Organizer cancel the task", async () => {
    const mocks = arrange();
    await tasksService.changeStatus(OWNER, TASK, { status: "CANCELLED" });
    assert.equal(mocks.status.mock.calls.length, 1);
  });

  for (const next of ["IN_PROGRESS", "DONE"] as const) {
    it(`still lets the assignee set ${next}`, async () => {
      const mocks = arrange();
      await tasksService.changeStatus(ASSIGNEE, TASK, { status: next });
      assert.equal(mocks.status.mock.calls.length, 1);
      assert.equal(mocks.notification.mock.calls.length, next === "DONE" ? 1 : 0);
      if (next === "DONE") assert.equal(mocks.notification.mock.calls[0]?.[0], OWNER);
    });
  }

  it("still lets the assignee reopen a completed task", async () => {
    const mocks = arrange();
    mocks.locked.mockResolvedValue(taskRecord({ status: "DONE", completedAtUtc: new Date() }));
    await tasksService.changeStatus(ASSIGNEE, TASK, { status: "TODO" });
    assert.equal(mocks.status.mock.calls.length, 1);
  });

  it("still prevents assignee cancellation", async () => {
    const mocks = arrange();
    await assert.rejects(tasksService.changeStatus(ASSIGNEE, TASK, { status: "CANCELLED" }), {
      statusCode: 403, code: "MEETING_ACTION_ITEM_ASSIGNEE_STATUS_FORBIDDEN",
    });
    assertNoWrites(mocks);
  });

  it("still lets the current assignee complete a subtask", async () => {
    const mocks = arrange();
    await taskDetailsService.completeSubtask(ASSIGNEE, SUBTASK, true);
    assert.equal(mocks.completeSubtask.mock.calls.length, 1);
  });

  it("still lets the assignee upload and delete their own attachment", async () => {
    const mocks = arrange();
    await taskDetailsService.upload(ASSIGNEE, { taskId: TASK }, uploadFile());
    assert.equal(mocks.createFile.mock.calls.length, 1);
    await taskDetailsService.deleteAttachment(ASSIGNEE, FILE);
    assert.equal(mocks.deleteFile.mock.calls.length, 1);
    assert.equal(mocks.remove.mock.calls.length, 1);
  });

  it("still denies the assignee deleting another person's attachment", async () => {
    const mocks = arrange(OWNER);
    await assert.rejects(taskDetailsService.deleteAttachment(ASSIGNEE, FILE), {
      statusCode: 403, code: "ATTACHMENT_DELETE_FORBIDDEN",
    });
    assertNoWrites(mocks);
  });

  it("still lets the Organizer delete any attachment", async () => {
    const mocks = arrange();
    await taskDetailsService.deleteAttachment(OWNER, FILE);
    assert.equal(mocks.deleteFile.mock.calls.length, 1);
  });
});

