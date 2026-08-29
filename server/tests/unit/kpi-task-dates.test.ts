import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveKpiTaskDates } from "../../src/modules/kpis/kpi-task-dates.js";
import type { PersonalKpi } from "../../src/modules/kpis/kpis.types.js";

const deadline = vi.hoisted(() => vi.fn());

vi.mock("../../src/modules/kpis/kpi-deadline.js", () => ({
  calculateKpiTaskDueDate: deadline,
}));

const baseKpi: PersonalKpi = {
  id: 1,
  name: "KPI",
  description: null,
  iconKey: "gauge",
  color: "#0F766E",
  calculationMethod: "TASK_COMPLETION_RATE",
  periodType: "MONTHLY",
  measurementUnit: "PERCENT",
  targetValue: 90,
  targetDirection: "HIGHER_IS_BETTER",
  deadlineSource: null,
  businessDayOffset: null,
  deadlineDirection: null,
  referenceDateLabel: null,
  numeratorLabel: null,
  denominatorLabel: null,
  valueLabel: null,
  displayOrder: 0,
  isActive: true,
  taskCount: 0,
  taskPolicy: {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: "OPTIONAL",
    requiresReferenceDate: false,
    subtaskDueDateMode: "OPTIONAL",
  },
};

const onTimeKpi: PersonalKpi = {
  ...baseKpi,
  calculationMethod: "ON_TIME_RATE",
  deadlineSource: "REFERENCE_DATE",
  businessDayOffset: 5,
  deadlineDirection: "BEFORE",
  referenceDateLabel: "Board meeting date",
  taskPolicy: {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: "AUTO",
    requiresReferenceDate: true,
    subtaskDueDateMode: "OPTIONAL",
  },
};

const manualKpi: PersonalKpi = {
  ...baseKpi,
  calculationMethod: "MANUAL_RATIO",
  taskPolicy: {
    allowsTasks: true,
    usesTasks: false,
    dueDateMode: "OPTIONAL",
    requiresReferenceDate: false,
    subtaskDueDateMode: "OPTIONAL",
  },
};

const taskDueDateKpi: PersonalKpi = {
  ...baseKpi,
  calculationMethod: "ON_TIME_RATE",
  deadlineSource: "TASK_DUE_DATE",
  taskPolicy: {
    allowsTasks: true,
    usesTasks: true,
    dueDateMode: "REQUIRED",
    requiresReferenceDate: false,
    subtaskDueDateMode: "OPTIONAL",
  },
};

describe("KPI task date policy", () => {
  beforeEach(() => {
    deadline.mockReset();
    deadline.mockResolvedValue("2026-08-26");
  });

  it("calculates the due date for an on-time KPI", async () => {
    await expect(
      resolveKpiTaskDates(onTimeKpi, {
        startDate: null,
        referenceDate: "2026-09-02",
      }),
    ).resolves.toEqual({
      startDate: null,
      dueDate: "2026-08-26",
      referenceDate: "2026-09-02",
    });

    expect(deadline).toHaveBeenCalledWith(onTimeKpi, "2026-09-02");
  });

  it("preserves the stored deadline when the reference date did not change", async () => {
    const result = await resolveKpiTaskDates(
      onTimeKpi,
      {},
      {
        startDate: null,
        dueDate: "2026-08-26",
        referenceDate: "2026-09-02",
      },
    );

    expect(result.dueDate).toBe("2026-08-26");
    expect(deadline).not.toHaveBeenCalled();
  });

  it("allows completion-rate KPI tasks without due dates", async () => {
    await expect(
      resolveKpiTaskDates(baseKpi, {
        startDate: null,
        dueDate: null,
        referenceDate: null,
      }),
    ).resolves.toEqual({
      startDate: null,
      dueDate: null,
      referenceDate: null,
    });
  });

  it("allows supporting tasks for manual KPI methods without changing the manual calculation", async () => {
    await expect(
      resolveKpiTaskDates(manualKpi, {
        startDate: null,
        dueDate: null,
        referenceDate: null,
      }),
    ).resolves.toEqual({ startDate: null, dueDate: null, referenceDate: null });
  });

  it("requires a user-entered due date for task-due-date on-time KPIs", async () => {
    await expect(
      resolveKpiTaskDates(taskDueDateKpi, {
        startDate: null,
        dueDate: null,
        referenceDate: null,
      }),
    ).rejects.toMatchObject({ code: "KPI_TASK_DUE_DATE_REQUIRED" });
  });

  it("accepts a user-entered due date for task-due-date on-time KPIs", async () => {
    await expect(
      resolveKpiTaskDates(taskDueDateKpi, {
        startDate: "2026-08-20",
        dueDate: "2026-08-25",
        referenceDate: null,
      }),
    ).resolves.toEqual({
      startDate: "2026-08-20",
      dueDate: "2026-08-25",
      referenceDate: null,
    });

    expect(deadline).not.toHaveBeenCalled();
  });

  it("rejects a client-managed due date for an automatic KPI", async () => {
    await expect(
      resolveKpiTaskDates(onTimeKpi, {
        referenceDate: "2026-09-02",
        dueDate: "2026-08-27",
      }),
    ).rejects.toMatchObject({ code: "KPI_TASK_DUE_DATE_MANAGED" });
  });
});

