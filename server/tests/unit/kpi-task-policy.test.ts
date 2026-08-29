import { describe, expect, it } from "vitest";

import { getKpiTaskPolicy } from "../../src/modules/kpis/kpi-task-policy.js";

describe("KPI task policy", () => {
  it("uses an automatic task deadline for reference-date on-time KPIs", () => {
    expect(getKpiTaskPolicy("ON_TIME_RATE", "REFERENCE_DATE")).toEqual({
      allowsTasks: true,
      usesTasks: true,
      dueDateMode: "AUTO",
      requiresReferenceDate: true,
      subtaskDueDateMode: "OPTIONAL",
    });
  });

  it("requires a user-entered task deadline for task-due-date on-time KPIs", () => {
    expect(getKpiTaskPolicy("ON_TIME_RATE", "TASK_DUE_DATE")).toEqual({
      allowsTasks: true,
      usesTasks: true,
      dueDateMode: "REQUIRED",
      requiresReferenceDate: false,
      subtaskDueDateMode: "OPTIONAL",
    });
  });

  it.each(["TASK_COMPLETION_RATE", "SUBTASK_COMPLETION_RATE"] as const)(
    "%s uses KPI tasks with optional dates",
    (method) => {
      expect(getKpiTaskPolicy(method)).toEqual({
        allowsTasks: true,
        usesTasks: true,
        dueDateMode: "OPTIONAL",
        requiresReferenceDate: false,
        subtaskDueDateMode: "OPTIONAL",
      });
    },
  );

  it("requires subtask due dates for subtask on-time KPIs", () => {
    expect(getKpiTaskPolicy("SUBTASK_ON_TIME_RATE")).toEqual({
      allowsTasks: true,
      usesTasks: true,
      dueDateMode: "OPTIONAL",
      requiresReferenceDate: false,
      subtaskDueDateMode: "REQUIRED",
    });
  });

  it.each(["MANUAL_RATIO", "MANUAL_NUMBER"] as const)(
    "%s accepts supporting tasks without using them in the calculation",
    (method) => {
      expect(getKpiTaskPolicy(method)).toEqual({
        allowsTasks: true,
        usesTasks: false,
        dueDateMode: "OPTIONAL",
        requiresReferenceDate: false,
        subtaskDueDateMode: "OPTIONAL",
      });
    },
  );
});
