import { describe, expect, it } from "vitest";

import { mapSubtask } from "../../src/modules/task-details/task-details.mapper.js";

describe("task-details mapper", () => {
  it("normalizes SQL BIGINT subtask identifiers to numbers", () => {
    const mapped = mapSubtask({
      id: "11",
      taskId: "20",
      title: "Prepare report",
      isCompleted: false,
      dueDate: null,
      displayOrder: 1,
      createdAtUtc: new Date("2026-08-27T00:00:00.000Z"),
      updatedAtUtc: null,
      completedAtUtc: null,
    });

    expect(mapped.id).toBe(11);
    expect(mapped.taskId).toBe(20);
  });
});
