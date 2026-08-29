import { describe, expect, it } from "vitest";
import { calculateKpi } from "../../src/modules/kpis/kpi-calculation.js";
import { shiftBusinessDays } from "../../src/modules/kpis/kpi-deadline.js";

describe("Saudi KPI calculations", () => {
  it("skips Friday, Saturday, and configured holidays", () => {
    expect(shiftBusinessDays("2026-08-30", 3, "AFTER", new Set(["2026-09-01"]))).toBe("2026-09-03");
  });

  it("does not count future unfinished on-time deadlines as failures", () => {
    const result = calculateKpi({
      method: "ON_TIME_RATE",
      tasks: [
        {
          status: "TODO",
          dueDate: "2026-09-10",
          completedDate: null,
          subtaskTotal: 0,
          subtaskCompleted: 0,
        },
      ],
      subtasks: [],
      targetValue: 90,
      targetDirection: "HIGHER_IS_BETTER",
      manualNumerator: null,
      manualDenominator: null,
      manualValue: null,
      today: "2026-09-01",
    });

    expect(result.numerator).toBe(0);
    expect(result.denominator).toBe(0);
    expect(result.status).toBe("NO_DATA");
  });

  it("counts an early completed on-time task immediately", () => {
    const result = calculateKpi({
      method: "ON_TIME_RATE",
      tasks: [
        {
          status: "DONE",
          dueDate: "2026-09-03",
          completedDate: "2026-09-02",
          subtaskTotal: 0,
          subtaskCompleted: 0,
        },
      ],
      subtasks: [],
      targetValue: 90,
      targetDirection: "HIGHER_IS_BETTER",
      manualNumerator: null,
      manualDenominator: null,
      manualValue: null,
      today: "2026-09-02",
    });

    expect(result.numerator).toBe(1);
    expect(result.denominator).toBe(1);
    expect(result.actualValue).toBe(100);
    expect(result.status).toBe("MET");
  });

  it("counts an unfinished task as a failure after its deadline arrives", () => {
    const result = calculateKpi({
      method: "ON_TIME_RATE",
      tasks: [
        {
          status: "TODO",
          dueDate: "2026-09-01",
          completedDate: null,
          subtaskTotal: 0,
          subtaskCompleted: 0,
        },
      ],
      subtasks: [],
      targetValue: 90,
      targetDirection: "HIGHER_IS_BETTER",
      manualNumerator: null,
      manualDenominator: null,
      manualValue: null,
      today: "2026-09-02",
    });

    expect(result.numerator).toBe(0);
    expect(result.denominator).toBe(1);
    expect(result.actualValue).toBe(0);
    expect(result.status).toBe("NOT_MET");
  });

  it("uses the stored automatic due date when calculating on-time performance", () => {
    const result = calculateKpi({
      method: "ON_TIME_RATE",
      tasks: [
        {
          status: "DONE",
          dueDate: "2026-08-26",
          completedDate: "2026-08-26",
          subtaskTotal: 0,
          subtaskCompleted: 0,
        },
        {
          status: "DONE",
          dueDate: "2026-08-26",
          completedDate: "2026-08-27",
          subtaskTotal: 0,
          subtaskCompleted: 0,
        },
      ],
      subtasks: [],
      targetValue: 90,
      targetDirection: "HIGHER_IS_BETTER",
      manualNumerator: null,
      manualDenominator: null,
      manualValue: null,
      today: "2026-08-31",
    });

    expect(result.actualValue).toBe(50);
    expect(result.status).toBe("NOT_MET");
  });

  it("calculates completion rate even when tasks have no due date", () => {
    const result = calculateKpi({
      method: "TASK_COMPLETION_RATE",
      tasks: [
        {
          status: "DONE",
          dueDate: null,
          completedDate: "2026-08-01",
          subtaskTotal: 0,
          subtaskCompleted: 0,
        },
        {
          status: "TODO",
          dueDate: null,
          completedDate: null,
          subtaskTotal: 0,
          subtaskCompleted: 0,
        },
      ],
      subtasks: [],
      targetValue: 40,
      targetDirection: "HIGHER_IS_BETTER",
      manualNumerator: null,
      manualDenominator: null,
      manualValue: null,
      today: "2026-08-31",
    });

    expect(result.actualValue).toBe(50);
    expect(result.targetAchievement).toBe(125);
    expect(result.status).toBe("MET");
  });
  it("calculates subtask on-time rate and ignores future unfinished subtasks", () => {
    const result = calculateKpi({
      method: "SUBTASK_ON_TIME_RATE",
      tasks: [],
      subtasks: [
        { dueDate: "2026-08-10", completedDate: "2026-08-08" },
        { dueDate: "2026-08-12", completedDate: "2026-08-14" },
        { dueDate: "2026-08-15", completedDate: null },
        { dueDate: "2026-08-30", completedDate: null },
      ],
      targetValue: 90,
      targetDirection: "HIGHER_IS_BETTER",
      manualNumerator: null,
      manualDenominator: null,
      manualValue: null,
      today: "2026-08-20",
    });

    expect(result.numerator).toBe(1);
    expect(result.denominator).toBe(3);
    expect(result.actualValue).toBeCloseTo(33.333333, 5);
    expect(result.status).toBe("NOT_MET");
  });

  it("counts a subtask completed before a future deadline immediately", () => {
    const result = calculateKpi({
      method: "SUBTASK_ON_TIME_RATE",
      tasks: [],
      subtasks: [{ dueDate: "2026-09-10", completedDate: "2026-09-01" }],
      targetValue: 90,
      targetDirection: "HIGHER_IS_BETTER",
      manualNumerator: null,
      manualDenominator: null,
      manualValue: null,
      today: "2026-09-01",
    });

    expect(result.numerator).toBe(1);
    expect(result.denominator).toBe(1);
    expect(result.actualValue).toBe(100);
    expect(result.status).toBe("MET");
  });

});

