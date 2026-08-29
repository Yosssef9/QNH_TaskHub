import { AppError } from "../../shared/errors/app-error.js";
import type { TaskStatus } from "./tasks.constants.js";
import type { TaskRecord } from "./tasks.types.js";

export function assertTaskWritable(task: Pick<TaskRecord, "cycleClosedAtUtc">): void {
  if (task.cycleClosedAtUtc) {
    throw new AppError({
      statusCode: 409,
      code: "WORK_CYCLE_CLOSED",
      message: "Reopen the Work Cycle before changing this task.",
    });
  }
}

const allowedTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ["IN_PROGRESS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["TODO", "DONE", "CANCELLED"],
  DONE: ["TODO"],
  CANCELLED: ["TODO"],
};

export function assertTaskStatusTransition(current: TaskStatus, next: TaskStatus): void {
  if (current === next) return;
  if (allowedTransitions[current].includes(next)) return;

  throw new AppError({
    statusCode: 409,
    code: "TASK_STATUS_TRANSITION_INVALID",
    message: `A task cannot move from ${current} to ${next}.`,
  });
}
