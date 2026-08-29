import { describe, expect, it } from "vitest";

import { mapTask } from "../../src/modules/tasks/tasks.mapper.js";

describe("tasks mapper", () => {
  it("normalizes SQL BIGINT KPI instance, template, cycle, and task identifiers to numbers", () => {
    const mapped = mapTask({
      id: "21" as unknown as number,
      listId: null,
      kpiInstanceId: "9" as unknown as number,
      kpiId: "7" as unknown as number,
      cycleId: "3" as unknown as number,
      cycleTitle: "Board cycle",
      kpiName: "Board completion",
      kpiIconKey: "gauge",
      kpiColor: "#0F766E",
      cycleClosedAtUtc: new Date("2026-08-27T05:00:00.000Z"),
      title: "KPI task",
      description: null,
      status: "TODO",
      priority: "MEDIUM",
      startDate: null,
      dueDate: null,
      referenceDate: null,
      displayOrder: 1,
      createdAtUtc: new Date("2026-08-27T00:00:00.000Z"),
      updatedAtUtc: null,
      completedAtUtc: null,
      cancelledAtUtc: null,
      cancellationReason: null,
      deletedAtUtc: null,
      isOverdue: false,
      subtaskTotal: 0,
      subtaskCompleted: 0,
    });

    expect(mapped.id).toBe(21);
    expect(mapped.kpiInstanceId).toBe(9);
    expect(mapped.kpiId).toBe(7);
    expect(mapped.cycleId).toBe(3);
    expect(mapped.listId).toBeNull();
    expect(mapped.isReadOnly).toBe(true);
  });

  it("normalizes a SQL BIGINT list identifier and keeps normal tasks outside KPI context", () => {
    const mapped = mapTask({
      id: "22" as unknown as number,
      listId: "4" as unknown as number,
      kpiInstanceId: null,
      kpiId: null,
      cycleId: null,
      cycleTitle: null,
      kpiName: null,
      kpiIconKey: null,
      kpiColor: null,
      cycleClosedAtUtc: null,
      title: "List task",
      description: null,
      status: "TODO",
      priority: "LOW",
      startDate: null,
      dueDate: null,
      referenceDate: null,
      displayOrder: 1,
      createdAtUtc: new Date("2026-08-27T00:00:00.000Z"),
      updatedAtUtc: null,
      completedAtUtc: null,
      cancelledAtUtc: null,
      cancellationReason: null,
      deletedAtUtc: null,
      isOverdue: false,
      subtaskTotal: 0,
      subtaskCompleted: 0,
    });

    expect(mapped.id).toBe(22);
    expect(mapped.listId).toBe(4);
    expect(mapped.kpiInstanceId).toBeNull();
    expect(mapped.kpiId).toBeNull();
    expect(mapped.cycleId).toBeNull();
    expect(mapped.isReadOnly).toBe(false);
  });
});
