import { describe, expect, it, vi } from "vitest";

import type { KpisRepository } from "../../src/modules/kpis/kpis.repository.js";
import { createKpisService } from "../../src/modules/kpis/kpis.service.js";
import type { KpiRecord, SaveKpiInput } from "../../src/modules/kpis/kpis.types.js";

const manualRatioRecord: KpiRecord = {
  id: 1,
  name: "Board requests",
  description: null,
  iconKey: "gauge",
  color: "#0F766E",
  calculationMethod: "MANUAL_RATIO",
  periodType: "MONTHLY",
  measurementUnit: "PERCENT",
  targetValue: 90,
  targetDirection: "HIGHER_IS_BETTER",
  deadlineSource: null,
  businessDayOffset: null,
  deadlineDirection: null,
  referenceDateLabel: null,
  numeratorLabel: "Completed",
  denominatorLabel: "Total",
  valueLabel: null,
  displayOrder: 1,
  isActive: true,
  taskCount: 4,
};

const taskCompletionInput: SaveKpiInput = {
  name: "Board requests",
  description: null,
  iconKey: "gauge",
  color: "#0F766E",
  calculationMethod: "TASK_COMPLETION_RATE",
  periodType: "MONTHLY",
  targetValue: 95,
  targetDirection: "HIGHER_IS_BETTER",
  deadlineSource: null,
  businessDayOffset: null,
  deadlineDirection: null,
  referenceDateLabel: null,
  numeratorLabel: null,
  denominatorLabel: null,
  valueLabel: null,
};

function createRepository(overrides: Partial<KpisRepository> = {}): KpisRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    find: vi.fn().mockResolvedValue(manualRatioRecord),
    nameExists: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({
      ...manualRatioRecord,
      calculationMethod: "TASK_COMPLETION_RATE",
      targetValue: 95,
      numeratorLabel: null,
      denominatorLabel: null,
    }),
    setActive: vi.fn().mockResolvedValue(true),
    listIds: vi.fn().mockResolvedValue([]),
    reorder: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("KPI template service", () => {
  it("allows a template calculation method to change even when historical instances have tasks", async () => {
    const repository = createRepository();
    const service = createKpisService(repository);

    await expect(service.update(7, 1, taskCompletionInput)).resolves.toMatchObject({
      calculationMethod: "TASK_COMPLETION_RATE",
      targetValue: 95,
    });

    expect(repository.update).toHaveBeenCalledWith(7, 1, taskCompletionInput);
  });

  it("allows deadline policy changes because existing KPI instances keep their snapshots", async () => {
    const referenceOnTimeRecord: KpiRecord = {
      ...manualRatioRecord,
      calculationMethod: "ON_TIME_RATE",
      deadlineSource: "REFERENCE_DATE",
      businessDayOffset: 5,
      deadlineDirection: "BEFORE",
      referenceDateLabel: "Meeting date",
    };
    const input: SaveKpiInput = {
      ...taskCompletionInput,
      calculationMethod: "ON_TIME_RATE",
      deadlineSource: "TASK_DUE_DATE",
    };
    const repository = createRepository({
      find: vi.fn().mockResolvedValue(referenceOnTimeRecord),
      update: vi.fn().mockResolvedValue({
        ...referenceOnTimeRecord,
        deadlineSource: "TASK_DUE_DATE",
        businessDayOffset: null,
        deadlineDirection: null,
        referenceDateLabel: null,
      }),
    });
    const service = createKpisService(repository);

    await expect(service.update(7, 1, input)).resolves.toMatchObject({
      deadlineSource: "TASK_DUE_DATE",
    });
    expect(repository.update).toHaveBeenCalledWith(7, 1, input);
  });

  it("still rejects duplicate active template names", async () => {
    const repository = createRepository({ nameExists: vi.fn().mockResolvedValue(true) });
    const service = createKpisService(repository);

    await expect(service.update(7, 1, taskCompletionInput)).rejects.toMatchObject({
      code: "KPI_NAME_ALREADY_EXISTS",
      statusCode: 409,
    });
    expect(repository.update).not.toHaveBeenCalled();
  });
});
