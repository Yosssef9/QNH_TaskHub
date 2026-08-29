import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { mapTask } from "../tasks/tasks.mapper.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import { tasksService } from "../tasks/tasks.service.js";
import type { TaskListResult } from "../tasks/tasks.types.js";
import { calculateKpi } from "./kpi-calculation.js";
import { calculateKpiTaskDueDate } from "./kpi-deadline.js";
import { kpiWorkRepository } from "./kpi-work.repository.js";
import type {
  CreateKpiTaskBody,
  GlobalKpiTaskListQuery,
  KpiPeriodQuery,
  KpiTaskDeadlineQuery,
  KpiTaskListQuery,
  SaveManualMeasurementBody,
} from "./kpi-work.schemas.js";
import { resolveKpiTaskDates } from "./kpi-task-dates.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";

async function summary(owner: number, instanceId: number, period: KpiPeriodQuery) {
  const kpi = await workCyclesService.getInstance(owner, instanceId);

  const tasks =
    kpi.taskPolicy.usesTasks && kpi.calculationMethod !== "SUBTASK_ON_TIME_RATE"
      ? await kpiWorkRepository.calculationTasks(owner, instanceId, period.periodStart, period.periodEnd)
      : [];

  const subtasks =
    kpi.calculationMethod === "SUBTASK_ON_TIME_RATE"
      ? await kpiWorkRepository.calculationSubtasks(
          owner,
          instanceId,
          period.periodStart,
          period.periodEnd,
        )
      : [];

  const manual = kpi.taskPolicy.usesTasks
    ? null
    : await kpiWorkRepository.manual(owner, instanceId, period.periodStart, period.periodEnd);

  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    ...calculateKpi({
      method: kpi.calculationMethod,
      tasks,
      subtasks,
      targetValue: kpi.targetValue,
      targetDirection: kpi.targetDirection,
      manualNumerator: manual?.numeratorValue == null ? null : Number(manual.numeratorValue),
      manualDenominator: manual?.denominatorValue == null ? null : Number(manual.denominatorValue),
      manualValue: manual?.manualValue == null ? null : Number(manual.manualValue),
      today: getCurrentDateInAppTimeZone(),
    }),
    manualNumerator: manual?.numeratorValue ?? null,
    manualDenominator: manual?.denominatorValue ?? null,
    manualValue: manual?.manualValue ?? null,
  };
}

function tasksNotSupported(): AppError {
  return new AppError({
    statusCode: 409,
    code: "KPI_TASKS_NOT_SUPPORTED",
    message: "This KPI is measured manually and does not use KPI tasks.",
  });
}

export const kpiWorkService = {
  async listAll(owner: number, query: GlobalKpiTaskListQuery): Promise<TaskListResult> {
    const result = await kpiWorkRepository.listAll(owner, query, getCurrentDateInAppTimeZone());

    return {
      items: result.records.map(mapTask),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  },

  async list(owner: number, instanceId: number, query: KpiTaskListQuery): Promise<TaskListResult> {
    const kpi = await workCyclesService.getInstance(owner, instanceId);
    if (!kpi.taskPolicy.allowsTasks) throw tasksNotSupported();

    const result = await kpiWorkRepository.list(owner, instanceId, query, getCurrentDateInAppTimeZone());

    return {
      items: result.records.map(mapTask),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  },

  async create(owner: number, instanceId: number, input: CreateKpiTaskBody) {
    const kpi = await workCyclesService.getInstance(owner, instanceId);

    if (!kpi.isActive) {
      throw new AppError({
        statusCode: 409,
        code: "WORK_CYCLE_CLOSED",
        message: "Reopen the Work Cycle before adding tasks.",
      });
    }

    const dates = await resolveKpiTaskDates(kpi, input);

    const id = await withTransaction(async (tx) => {
      if (!(await tasksRepository.ownedKpiInstanceIsOpen(owner, instanceId, tx))) {
        throw new AppError({
          statusCode: 409,
          code: "WORK_CYCLE_CLOSED",
          message: "Reopen the Work Cycle before adding tasks.",
        });
      }

      const created = await kpiWorkRepository.create(tx, owner, instanceId, {
        ...input,
        ...dates,
      });

      if (!created) {
        throw new AppError({
          statusCode: 500,
          code: "TASK_CREATE_FAILED",
          message: "Task could not be created.",
        });
      }

      await tasksRepository.addActivity(tx, owner, created, "CREATED", {
        kpiInstanceId: instanceId,
        cycleId: kpi.cycleId,
        kpiId: kpi.templateId,
        title: input.title,
      });

      return created;
    });

    return tasksService.get(owner, id);
  },

  async createGlobal(owner: number, cycleId: number, instanceId: number, input: CreateKpiTaskBody) {
    const instance = await workCyclesService.getInstance(owner, instanceId);
    if (instance.cycleId !== cycleId) {
      throw new AppError({ statusCode: 400, code: "KPI_INSTANCE_CYCLE_MISMATCH", message: "The KPI does not belong to the selected Work Cycle." });
    }
    return this.create(owner, instanceId, input);
  },

  async deadline(owner: number, instanceId: number, query: KpiTaskDeadlineQuery) {
    const kpi = await workCyclesService.getInstance(owner, instanceId);

    if (kpi.taskPolicy.dueDateMode !== "AUTO") {
      throw new AppError({
        statusCode: 409,
        code: "KPI_TASK_DEADLINE_NOT_AUTOMATIC",
        message: "This KPI does not calculate task due dates automatically.",
      });
    }

    return {
      dueDate: await calculateKpiTaskDueDate(kpi, query.referenceDate),
    };
  },

  summary,

  async saveManual(owner: number, instanceId: number, input: SaveManualMeasurementBody) {
    const kpi = await workCyclesService.getInstance(owner, instanceId);

    if (kpi.cycleClosedAtUtc) {
      throw new AppError({ statusCode: 409, code: "WORK_CYCLE_CLOSED", message: "Reopen the Work Cycle before changing measurements." });
    }

    if (kpi.calculationMethod === "MANUAL_RATIO") {
      if (
        input.numeratorValue === null ||
        input.denominatorValue === null ||
        input.manualValue !== null
      ) {
        throw new AppError({
          statusCode: 400,
          code: "MANUAL_RATIO_VALUES_REQUIRED",
          message: "Achieved and total values are required.",
        });
      }
    } else if (kpi.calculationMethod === "MANUAL_NUMBER") {
      if (
        input.manualValue === null ||
        input.numeratorValue !== null ||
        input.denominatorValue !== null
      ) {
        throw new AppError({
          statusCode: 400,
          code: "MANUAL_NUMBER_VALUE_REQUIRED",
          message: "One period value is required.",
        });
      }
    } else {
      throw new AppError({
        statusCode: 409,
        code: "KPI_NOT_MANUAL",
        message: "This KPI is calculated from tasks.",
      });
    }

    const calculated = calculateKpi({
      method: kpi.calculationMethod,
      tasks: [],
      subtasks: [],
      targetValue: kpi.targetValue,
      targetDirection: kpi.targetDirection,
      manualNumerator: input.numeratorValue,
      manualDenominator: input.denominatorValue,
      manualValue: input.manualValue,
      today: getCurrentDateInAppTimeZone(),
    });

    await withTransaction(async (tx) => {
      if (!(await tasksRepository.ownedKpiInstanceIsOpen(owner, instanceId, tx))) {
        throw new AppError({
          statusCode: 409,
          code: "WORK_CYCLE_CLOSED",
          message: "Reopen the Work Cycle before changing measurements.",
        });
      }
      const saved = await kpiWorkRepository.saveManualResult(
        tx,
        owner,
        instanceId,
        input,
        calculated,
        kpi.targetValue,
        kpi.targetDirection,
      );
      if (!saved) {
        throw new AppError({
          statusCode: 409,
          code: "KPI_PERIOD_FINALIZED",
          message: "A finalized KPI period cannot be changed.",
        });
      }
    });

    return {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      ...calculated,
      manualNumerator: input.numeratorValue,
      manualDenominator: input.denominatorValue,
      manualValue: input.manualValue,
    };
  },
};
