import { describe, expect, it } from "vitest";

import { assertTaskStatusTransition } from "../../src/modules/tasks/tasks.policy.js";

describe("task status policy", () => {
  it.each([
    ["TODO", "IN_PROGRESS"],
    ["TODO", "DONE"],
    ["IN_PROGRESS", "CANCELLED"],
    ["DONE", "TODO"],
    ["CANCELLED", "TODO"],
  ] as const)("allows %s to move to %s", (current, next) => {
    expect(() => assertTaskStatusTransition(current, next)).not.toThrow();
  });

  it.each([
    ["DONE", "IN_PROGRESS"],
    ["DONE", "CANCELLED"],
    ["CANCELLED", "DONE"],
  ] as const)("rejects %s moving directly to %s", (current, next) => {
    expect(() => assertTaskStatusTransition(current, next)).toThrowError(
      expect.objectContaining({ code: "TASK_STATUS_TRANSITION_INVALID", statusCode: 409 }),
    );
  });
});
