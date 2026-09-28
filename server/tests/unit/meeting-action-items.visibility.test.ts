import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import type { DatabaseTransaction } from "../../src/database/types.js";
import { authRepository } from "../../src/modules/auth/auth.repository.js";
import { accessPermissionsRepository } from "../../src/modules/access-permissions/access-permissions.repository.js";
import { resolveTaskAccess } from "../../src/modules/meeting-action-items/meeting-action-items.access.js";
import { meetingActionItemsRepository } from "../../src/modules/meeting-action-items/meeting-action-items.repository.js";
import { meetingWorkspaceRepository } from "../../src/modules/meetings/meeting-workspace.repository.js";
import { tasksRepository } from "../../src/modules/tasks/tasks.repository.js";
import {
  OWNER, ASSIGNEE, VIEWER, TASK, MEETING,
  accessProfile, meetingContext, actionContext, taskRecord,
} from "../fixtures/meeting-action-items.fixture.js";

function arrange() {
  return {
    relation: vi.spyOn(meetingActionItemsRepository, "findContext").mockResolvedValue(actionContext()),
    profile: vi.spyOn(authRepository, "findAccessProfile").mockResolvedValue(accessProfile()),
    meeting: vi.spyOn(meetingWorkspaceRepository, "findAccessContext").mockResolvedValue(meetingContext()),
    owned: vi.spyOn(tasksRepository, "findOwnedById").mockResolvedValue(null),
    ownedLocked: vi.spyOn(tasksRepository, "findOwnedForUpdate").mockResolvedValue(null),
  };
}

function assertViewer(result: Awaited<ReturnType<typeof resolveTaskAccess>>) {
  assert.ok(result);
  assert.equal(result.ownerUserId, OWNER);
  assert.equal(result.capabilities.role, "VIEWER");
  for (const [key, value] of Object.entries(result.capabilities)) {
    if (key !== "role") assert.equal(value, false, `${key} must be denied to Viewer`);
  }
}

afterEach(() => vi.restoreAllMocks());

describe("Meeting Action Item read access", () => {
  it("preserves Organizer management capabilities without granting completion", async () => {
    arrange();
    const resolved = await resolveTaskAccess(OWNER, TASK);
    assert.ok(resolved);
    assert.equal(resolved.capabilities.role, "OWNER");
    assert.equal(resolved.capabilities.canEditDetails, true);
    assert.equal(resolved.capabilities.canManageSubtasks, true);
    assert.equal(resolved.capabilities.canUploadAttachments, true);
    assert.equal(resolved.capabilities.canDeleteAnyAttachment, true);
    assert.equal(resolved.capabilities.canCompleteTask, false);
    assert.equal(resolved.capabilities.canCompleteSubtasks, false);
  });

  it("preserves the current assignee's execution capabilities", async () => {
    arrange();
    const resolved = await resolveTaskAccess(ASSIGNEE, TASK);
    assert.ok(resolved);
    assert.equal(resolved.capabilities.role, "ASSIGNEE");
    assert.equal(resolved.capabilities.canCompleteTask, true);
    assert.equal(resolved.capabilities.canCompleteSubtasks, true);
    assert.equal(resolved.capabilities.canUploadAttachments, true);
    assert.equal(resolved.capabilities.canEditDetails, false);
    assert.equal(resolved.capabilities.canDeleteRestoreTask, false);
  });

  it("gives another attendee only Viewer capabilities", async () => {
    arrange();
    assertViewer(await resolveTaskAccess(VIEWER, TASK));
  });

  it("allows a Coordinator who is not invited, without granting Organizer powers", async () => {
    const mocks = arrange();
    mocks.meeting.mockResolvedValue(meetingContext({ isAttendee: false }));
    mocks.profile.mockResolvedValue(accessProfile({ meetingCoordinateEnabled: true }));
    assertViewer(await resolveTaskAccess(VIEWER, TASK));
  });

  for (const status of ["SCHEDULED", "CANCELLED", "PENDING_APPROVAL", "REJECTED"] as const) {
    it(`uses normal attendee Meeting visibility for ${status}`, async () => {
      const mocks = arrange();
      mocks.meeting.mockResolvedValue(meetingContext({ status }));
      const result = await resolveTaskAccess(VIEWER, TASK);
      if (status === "SCHEDULED" || status === "CANCELLED") assertViewer(result);
      else assert.equal(result, null);
    });
  }

  for (const grants of [
    { roleCode: "USER" },
    { roleCode: "ADMIN" },
    { roleCode: "USER", meetingOrganizeEnabled: true },
  ]) {
    it(`denies an unrelated user with ${JSON.stringify(grants)}`, async () => {
      const mocks = arrange();
      mocks.meeting.mockResolvedValue(meetingContext({ isAttendee: false }));
      mocks.profile.mockResolvedValue(accessProfile(grants));
      assert.equal(await resolveTaskAccess(VIEWER, TASK), null);
      assert.equal(mocks.owned.mock.calls.length, 0);
    });
  }

  it("revokes inherited access when the attendee relationship is removed", async () => {
    const mocks = arrange();
    assertViewer(await resolveTaskAccess(VIEWER, TASK));
    mocks.meeting.mockResolvedValue(meetingContext({ isAttendee: false }));
    assert.equal(await resolveTaskAccess(VIEWER, TASK), null);
  });

  it("does not let stale assignment bypass loss of Meeting visibility", async () => {
    const mocks = arrange();
    mocks.meeting.mockResolvedValue(meetingContext({ isAttendee: false }));
    assert.equal(await resolveTaskAccess(ASSIGNEE, TASK), null);
  });

  it("reduces a former assignee who remains a participant to Viewer", async () => {
    const mocks = arrange();
    mocks.relation.mockResolvedValue(actionContext({ assigneeUserId: 400 }));
    assertViewer(await resolveTaskAccess(ASSIGNEE, TASK));
  });

  it("does not cache a revoked Coordinator grant", async () => {
    const mocks = arrange();
    mocks.meeting.mockResolvedValue(meetingContext({ isAttendee: false }));
    mocks.profile.mockResolvedValue(accessProfile({ meetingCoordinateEnabled: true }));
    assertViewer(await resolveTaskAccess(VIEWER, TASK));
    mocks.profile.mockResolvedValue(accessProfile({ meetingCoordinateEnabled: false }));
    assert.equal(await resolveTaskAccess(VIEWER, TASK), null);
  });

  it("denies inactive or missing TaskHub access", async () => {
    const mocks = arrange();
    mocks.profile.mockResolvedValue(accessProfile({ isActive: false, meetingCoordinateEnabled: true }));
    assert.equal(await resolveTaskAccess(VIEWER, TASK), null);
    mocks.profile.mockResolvedValue(null);
    assert.equal(await resolveTaskAccess(VIEWER, TASK), null);
  });

  it("denies a missing parent Meeting", async () => {
    const mocks = arrange();
    mocks.meeting.mockResolvedValue(null);
    assert.equal(await resolveTaskAccess(VIEWER, TASK), null);
  });

  it("keeps deleted Action Items owner-only", async () => {
    arrange();
    assert.equal(await resolveTaskAccess(VIEWER, TASK, true), null);
    assert.equal(await resolveTaskAccess(ASSIGNEE, TASK, true), null);
    const owner = await resolveTaskAccess(OWNER, TASK, true);
    assert.equal(owner?.capabilities.role, "OWNER");
  });

  it("uses the actual parent Meeting and transaction, not a client-supplied Meeting", async () => {
    const mocks = arrange();
    const transaction = {} as DatabaseTransaction;
    assertViewer(await resolveTaskAccess(VIEWER, TASK, false, transaction));
    assert.deepEqual(mocks.meeting.mock.calls[0], [MEETING, VIEWER, transaction]);
  });

  it("does not grant access to another user's unrelated personal task", async () => {
    const mocks = arrange();
    mocks.relation.mockResolvedValue(null);
    assert.equal(await resolveTaskAccess(VIEWER, TASK), null);
    assert.equal(mocks.profile.mock.calls.length, 0);
    assert.equal(mocks.owned.mock.calls[0]?.[0], VIEWER);
  });

  it("preserves full capabilities for a normal owned personal task", async () => {
    const mocks = arrange();
    mocks.relation.mockResolvedValue(null);
    mocks.owned.mockResolvedValue(taskRecord());
    const result = await resolveTaskAccess(VIEWER, TASK);
    assert.ok(result);
    assert.equal(result.context, null);
    assert.equal(result.ownerUserId, VIEWER);
    assert.equal(result.capabilities.canCompleteTask, true);
    assert.equal(result.capabilities.canEditDetails, true);
  });

  it("does not bypass the existing KPI/Work Cycle access check", async () => {
    const mocks = arrange();
    mocks.relation.mockResolvedValue(null);
    mocks.owned.mockResolvedValue(taskRecord({ kpiInstanceId: 77 }));
    vi.spyOn(accessPermissionsRepository, "listUserPermissions").mockResolvedValue([]);
    assert.equal(await resolveTaskAccess(VIEWER, TASK), null);
  });
});
