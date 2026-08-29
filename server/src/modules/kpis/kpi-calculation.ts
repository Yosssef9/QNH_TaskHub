import type { KpiDirection, KpiMethod } from "./kpis.types.js";

export interface CalculationTask {
  status: string;
  dueDate: string | null;
  completedDate: string | null;
  subtaskTotal: number;
  subtaskCompleted: number;
}

export interface CalculationSubtask {
  dueDate: string;
  completedDate: string | null;
}

export interface KpiCalculationInput {
  method: KpiMethod;
  tasks: CalculationTask[];
  subtasks: CalculationSubtask[];
  targetValue: number | null;
  targetDirection: KpiDirection | null;
  manualNumerator: number | null;
  manualDenominator: number | null;
  manualValue: number | null;
  today: string;
}

export interface KpiCalculationResult {
  numerator: number | null;
  denominator: number | null;
  actualValue: number | null;
  targetAchievement: number | null;
  status: "MET" | "NOT_MET" | "NO_TARGET" | "NO_DATA";
}

function target(
  actual: number,
  targetValue: number | null,
  direction: KpiDirection | null,
): Pick<KpiCalculationResult, "targetAchievement" | "status"> {
  if (targetValue === null || direction === null) {
    return { targetAchievement: null, status: "NO_TARGET" };
  }

  const met = direction === "HIGHER_IS_BETTER" ? actual >= targetValue : actual <= targetValue;

  if (targetValue === 0 || actual === 0) {
    return { targetAchievement: null, status: met ? "MET" : "NOT_MET" };
  }

  return {
    targetAchievement:
      direction === "HIGHER_IS_BETTER"
        ? (actual / targetValue) * 100
        : (targetValue / actual) * 100,
    status: met ? "MET" : "NOT_MET",
  };
}

export function calculateKpi(input: KpiCalculationInput): KpiCalculationResult {
  let numerator: number | null = null;
  let denominator: number | null = null;
  let actualValue: number | null = null;

  if (input.method === "MANUAL_NUMBER") {
    actualValue = input.manualValue;
  } else if (input.method === "MANUAL_RATIO") {
    numerator = input.manualNumerator;
    denominator = input.manualDenominator;

    if (numerator !== null && denominator !== null && denominator > 0) {
      actualValue = (numerator / denominator) * 100;
    }
  } else if (input.method === "TASK_COMPLETION_RATE") {
    const eligible = input.tasks.filter((task) => task.status !== "CANCELLED");
    denominator = eligible.length;
    numerator = eligible.filter((task) => task.status === "DONE").length;

    if (denominator > 0) actualValue = (numerator / denominator) * 100;
  } else if (input.method === "SUBTASK_COMPLETION_RATE") {
    const eligible = input.tasks.filter((task) => task.status !== "CANCELLED");
    denominator = eligible.reduce((sum, task) => sum + task.subtaskTotal, 0);
    numerator = eligible.reduce((sum, task) => sum + task.subtaskCompleted, 0);

    if (denominator > 0) actualValue = (numerator / denominator) * 100;
  } else if (input.method === "SUBTASK_ON_TIME_RATE") {
    const eligible = input.subtasks.filter(
      (subtask) => subtask.completedDate !== null || subtask.dueDate <= input.today,
    );

    denominator = eligible.length;
    numerator = eligible.filter(
      (subtask) =>
        subtask.completedDate !== null && subtask.completedDate <= subtask.dueDate,
    ).length;

    if (denominator > 0) actualValue = (numerator / denominator) * 100;
  } else {
    const eligible = input.tasks.filter(
      (task) =>
        task.status !== "CANCELLED" &&
        task.dueDate !== null &&
        (task.status === "DONE" || task.dueDate <= input.today),
    );

    denominator = eligible.length;
    numerator = eligible.filter(
      (task) =>
        task.status === "DONE" &&
        task.completedDate !== null &&
        task.dueDate !== null &&
        task.completedDate <= task.dueDate,
    ).length;

    if (denominator > 0) actualValue = (numerator / denominator) * 100;
  }

  if (actualValue === null) {
    return {
      numerator,
      denominator,
      actualValue: null,
      targetAchievement: null,
      status: "NO_DATA",
    };
  }

  return {
    numerator,
    denominator,
    actualValue,
    ...target(actualValue, input.targetValue, input.targetDirection),
  };
}
