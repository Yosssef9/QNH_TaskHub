import type { KpiDeadlineSource, KpiMethod } from "./kpis.types.js";

export type KpiDueDateMode = "AUTO" | "REQUIRED" | "OPTIONAL" | "NONE";
export type KpiSubtaskDueDateMode = "REQUIRED" | "OPTIONAL" | "NONE";

export interface KpiTaskPolicy {
  allowsTasks: boolean;
  usesTasks: boolean;
  dueDateMode: KpiDueDateMode;
  requiresReferenceDate: boolean;
  subtaskDueDateMode: KpiSubtaskDueDateMode;
}

const fixedPolicies: Record<Exclude<KpiMethod, "ON_TIME_RATE">, KpiTaskPolicy> = {
  TASK_COMPLETION_RATE: {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: "OPTIONAL",
    requiresReferenceDate: false,
    subtaskDueDateMode: "OPTIONAL",
  },
  SUBTASK_COMPLETION_RATE: {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: "OPTIONAL",
    requiresReferenceDate: false,
    subtaskDueDateMode: "OPTIONAL",
  },
  SUBTASK_ON_TIME_RATE: {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: "OPTIONAL",
    requiresReferenceDate: false,
    subtaskDueDateMode: "REQUIRED",
  },
  MANUAL_RATIO: {
    allowsTasks: true,
    usesTasks: false,
    dueDateMode: "OPTIONAL",
    requiresReferenceDate: false,
    subtaskDueDateMode: "OPTIONAL",
  },
  MANUAL_NUMBER: {
    allowsTasks: true,
    usesTasks: false,
    dueDateMode: "OPTIONAL",
    requiresReferenceDate: false,
    subtaskDueDateMode: "OPTIONAL",
  },
};

export function getKpiTaskPolicy(
  method: KpiMethod,
  deadlineSource: KpiDeadlineSource | null = null,
): KpiTaskPolicy {
  if (method !== "ON_TIME_RATE") {
    return fixedPolicies[method];
  }

  if (deadlineSource === "TASK_DUE_DATE") {
    return {
      allowsTasks: true,
      usesTasks: true,
      dueDateMode: "REQUIRED",
      requiresReferenceDate: false,
      subtaskDueDateMode: "OPTIONAL",
    };
  }

  return {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: "AUTO",
    requiresReferenceDate: true,
    subtaskDueDateMode: "OPTIONAL",
  };
}
