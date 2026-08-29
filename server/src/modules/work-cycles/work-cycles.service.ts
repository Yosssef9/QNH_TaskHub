import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { mapKpiInstance, mapWorkCycle } from "./work-cycles.mapper.js";
import { workCyclesRepository } from "./work-cycles.repository.js";
import type { AddCycleKpisBody, CreateCycleBody, UpdateCycleBody } from "./work-cycles.schemas.js";

const notFound = () => new AppError({ statusCode: 404, code: "WORK_CYCLE_NOT_FOUND", message: "Work Cycle not found." });
const closed = () => new AppError({ statusCode: 409, code: "WORK_CYCLE_CLOSED", message: "Reopen the Work Cycle before changing it." });
const duplicate = () => new AppError({ statusCode: 409, code: "WORK_CYCLE_NAME_ALREADY_EXISTS", message: "An active Work Cycle already uses this title." });

function uniqueError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "number" in error && [2601, 2627].includes(Number((error as { number?: unknown }).number));
}

async function get(owner: number, cycleId: number) {
  const result = await workCyclesRepository.find(owner, cycleId, getCurrentDateInAppTimeZone());
  if (!result.cycle) throw notFound();
  const instances = result.instances.map(mapKpiInstance);
  return mapWorkCycle(result.cycle, instances);
}

async function getCurrent(owner: number) {
  const currentCycleId = await workCyclesRepository.reconcileCurrent(owner);
  return currentCycleId ? get(owner, currentCycleId) : null;
}

export const workCyclesService = {
  async list(owner: number) {
    await workCyclesRepository.reconcileCurrent(owner);
    const result = await workCyclesRepository.list(owner, getCurrentDateInAppTimeZone());
    const instances = result.instances.map(mapKpiInstance);
    return result.cycles.map((cycle) =>
      mapWorkCycle(cycle, instances.filter((instance) => instance.cycleId === Number(cycle.id))),
    );
  },
  get,
  current: getCurrent,
  async getInstance(owner: number, instanceId: number) {
    const record = await workCyclesRepository.findInstance(owner, instanceId);
    if (!record) throw new AppError({ statusCode: 404, code: "KPI_INSTANCE_NOT_FOUND", message: "KPI instance not found." });
    return mapKpiInstance(record);
  },
  async create(owner: number, input: CreateCycleBody) {
    try {
      const cycleId = await withTransaction(async (tx) => {
        const id = await workCyclesRepository.createCycle(tx, owner, input);
        if (!id) throw new AppError({ statusCode: 500, code: "WORK_CYCLE_CREATE_FAILED", message: "Work Cycle could not be created." });
        const added = await workCyclesRepository.addInstances(tx, owner, id, input.kpiIds);
        if (added !== input.kpiIds.length) {
          throw new AppError({ statusCode: 400, code: "WORK_CYCLE_KPIS_INVALID", message: "Every selected KPI must be active, private, and unique." });
        }
        return id;
      });
      await workCyclesRepository.reconcileCurrent(owner);
      return get(owner, cycleId);
    } catch (error) {
      if (uniqueError(error)) throw duplicate();
      throw error;
    }
  },
  async update(owner: number, cycleId: number, input: UpdateCycleBody) {
    const current = await get(owner, cycleId);
    if (current.closedAtUtc) throw closed();
    try {
      if (!(await workCyclesRepository.update(owner, cycleId, input))) throw closed();
      return get(owner, cycleId);
    } catch (error) {
      if (uniqueError(error)) throw duplicate();
      throw error;
    }
  },
  async addKpis(owner: number, cycleId: number, input: AddCycleKpisBody) {
    const current = await get(owner, cycleId);
    if (current.closedAtUtc) throw closed();
    await withTransaction(async (tx) => {
      if (!(await workCyclesRepository.cycleIsOpen(owner, cycleId, tx))) throw closed();
      const added = await workCyclesRepository.addInstances(tx, owner, cycleId, input.kpiIds);
      if (added !== input.kpiIds.length) throw new AppError({ statusCode: 409, code: "WORK_CYCLE_KPI_ALREADY_ADDED", message: "A selected KPI is unavailable or already exists in this Cycle." });
    });
    return get(owner, cycleId);
  },
  async removeInstance(owner: number, cycleId: number, instanceId: number) {
    const current = await get(owner, cycleId);
    if (current.closedAtUtc) throw closed();
    if (!current.instances.some((instance) => instance.id === instanceId)) {
      throw new AppError({ statusCode: 404, code: "KPI_INSTANCE_NOT_FOUND", message: "KPI instance not found." });
    }
    if (!(await workCyclesRepository.removeEmptyInstance(owner, cycleId, instanceId))) {
      throw new AppError({ statusCode: 409, code: "KPI_INSTANCE_NOT_EMPTY", message: "A KPI instance containing work cannot be removed." });
    }
  },
  async setCurrent(owner: number, cycleId: number) {
    if (!(await workCyclesRepository.setCurrent(owner, cycleId))) {
      throw new AppError({
        statusCode: 409,
        code: "WORK_CYCLE_CANNOT_BE_CURRENT",
        message: "Only an open Work Cycle can be selected as the current Cycle.",
      });
    }
    return get(owner, cycleId);
  },
  async close(owner: number, cycleId: number) {
    if (!(await workCyclesRepository.setClosed(owner, cycleId, true))) throw notFound();
    await workCyclesRepository.reconcileCurrent(owner);
    return get(owner, cycleId);
  },
  async reopen(owner: number, cycleId: number) {
    if (!(await workCyclesRepository.setClosed(owner, cycleId, false))) throw notFound();
    await workCyclesRepository.reconcileCurrent(owner);
    return get(owner, cycleId);
  },
  async archive(owner: number, cycleId: number) {
    const current = await get(owner, cycleId);
    if (!current.closedAtUtc) {
      throw new AppError({ statusCode: 409, code: "WORK_CYCLE_MUST_BE_CLOSED", message: "Close the Work Cycle before archiving it." });
    }
    if (!(await workCyclesRepository.archive(owner, cycleId))) {
      throw new AppError({ statusCode: 409, code: "WORK_CYCLE_ARCHIVE_CONFLICT", message: "The Work Cycle changed before it could be archived." });
    }
    await workCyclesRepository.reconcileCurrent(owner);
  },
  async reorder(owner: number, ids: number[]) {
    const current = await this.list(owner);
    if (current.length !== ids.length || current.some((cycle) => !ids.includes(cycle.id))) {
      throw new AppError({ statusCode: 400, code: "WORK_CYCLE_ORDER_INVALID", message: "Cycle order must contain every active Cycle exactly once." });
    }
    await workCyclesRepository.reorderCycles(owner, ids);
    return this.list(owner);
  },
  async reorderInstances(owner: number, cycleId: number, ids: number[]) {
    const cycle = await get(owner, cycleId);
    if (cycle.closedAtUtc) throw closed();
    if (cycle.instances.length !== ids.length || cycle.instances.some((instance) => !ids.includes(instance.id))) {
      throw new AppError({ statusCode: 400, code: "KPI_INSTANCE_ORDER_INVALID", message: "KPI order must contain every instance exactly once." });
    }
    await workCyclesRepository.reorderInstances(owner, cycleId, ids);
    return get(owner, cycleId);
  },
};
