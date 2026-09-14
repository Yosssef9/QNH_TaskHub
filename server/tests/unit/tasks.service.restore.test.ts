import { beforeEach, describe, expect, it, vi } from "vitest";

const accessPermissions = vi.hoisted(() => ({
  listUserPermissions: vi.fn(),
}));

const repository = vi.hoisted(() => ({
  findOwnedForUpdate: vi.fn(),
  ownedListExists: vi.fn(),
  ownedKpiInstanceIsOpen: vi.fn(),
  setDeleted: vi.fn(),
  addActivity: vi.fn(),
}));

vi.mock("../../src/database/transaction.js", () => ({
  withTransaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}),
}));

vi.mock("../../src/modules/tasks/tasks.repository.js", () => ({
  tasksRepository: repository,
}));

vi.mock("../../src/modules/access-permissions/access-permissions.repository.js", () => ({
  accessPermissionsRepository: accessPermissions,
}));

import { tasksService } from "../../src/modules/tasks/tasks.service.js";

const deletedKpiTask = {
  id: 44,
  listId: null,
  kpiInstanceId: 33,
  kpiId: 12,
  cycleId: 4,
  cycleTitle: "Board cycle",
  kpiName: "Board completion",
  kpiIconKey: "gauge",
  kpiColor: "#0F766E",
  cycleClosedAtUtc: null,
  title: "Prepare board pack",
  description: null,
  status: "TODO",
  priority: "MEDIUM",
  startDate: null,
  dueDate: null,
  referenceDate: null,
  displayOrder: 1,
  createdAtUtc: new Date("2026-08-20T08:00:00Z"),
  updatedAtUtc: null,
  completedAtUtc: null,
  cancelledAtUtc: null,
  cancellationReason: null,
  deletedAtUtc: new Date("2026-08-26T08:00:00Z"),
  isOverdue: false,
  subtaskTotal: 0,
  subtaskCompleted: 0,
};

describe("task restore container protection", () => {
  beforeEach(() => {
    accessPermissions.listUserPermissions.mockReset();
    accessPermissions.listUserPermissions.mockResolvedValue([
      {
        moduleCode: "KPI_MANAGEMENT",
        entityCode: "KPI_WORK_CYCLES",
        permissionCode: "ACCESS",
        resourceOwnerUserId: null,
      },
    ]);
    repository.findOwnedForUpdate.mockReset();
    repository.ownedListExists.mockReset();
    repository.ownedKpiInstanceIsOpen.mockReset();
    repository.setDeleted.mockReset();
    repository.addActivity.mockReset();
  });

  it("does not expose a KPI task after KPI + Work Cycles access is revoked", async () => {
    accessPermissions.listUserPermissions.mockResolvedValue([]);
    repository.findOwnedForUpdate.mockResolvedValue(deletedKpiTask);

    await expect(tasksService.restore(7, 44)).rejects.toMatchObject({
      statusCode: 404,
      code: "TASK_NOT_FOUND",
    });

    expect(repository.ownedKpiInstanceIsOpen).not.toHaveBeenCalled();
    expect(repository.setDeleted).not.toHaveBeenCalled();
  });

  it("does not restore a KPI task when its Work Cycle is unavailable", async () => {
    repository.findOwnedForUpdate.mockResolvedValue(deletedKpiTask);
    repository.ownedKpiInstanceIsOpen.mockResolvedValue(false);

    await expect(tasksService.restore(7, 44)).rejects.toMatchObject({
      statusCode: 409,
      code: "TASK_KPI_INSTANCE_UNAVAILABLE",
    });

    expect(repository.ownedKpiInstanceIsOpen).toHaveBeenCalledWith(7, 33, expect.anything());
    expect(repository.setDeleted).not.toHaveBeenCalled();
  });
});

