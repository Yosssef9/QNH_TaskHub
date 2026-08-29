import { AppError } from "../../shared/errors/app-error.js";
import { mapKpi } from "./kpis.mapper.js";
import { kpisRepository, type KpisRepository } from "./kpis.repository.js";
import type { PersonalKpi, SaveKpiInput } from "./kpis.types.js";

export interface KpisService {
  list(ownerUserId: number): Promise<PersonalKpi[]>;
  get(ownerUserId: number, kpiId: number): Promise<PersonalKpi>;
  create(ownerUserId: number, input: SaveKpiInput): Promise<PersonalKpi>;
  update(ownerUserId: number, kpiId: number, input: SaveKpiInput): Promise<PersonalKpi>;
  setActive(ownerUserId: number, kpiId: number, isActive: boolean): Promise<PersonalKpi>;
  reorder(ownerUserId: number, ids: number[]): Promise<PersonalKpi[]>;
  archive(ownerUserId: number, kpiId: number): Promise<void>;
}

const notFound = () =>
  new AppError({
    statusCode: 404,
    code: "KPI_NOT_FOUND",
    message: "KPI not found.",
  });

const duplicate = () =>
  new AppError({
    statusCode: 409,
    code: "KPI_NAME_ALREADY_EXISTS",
    message: "An active KPI already uses this name.",
  });

function uniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "number" in error &&
    ([2601, 2627] as unknown[]).includes((error as { number?: unknown }).number)
  );
}

export function createKpisService(repository: KpisRepository): KpisService {
  async function get(ownerUserId: number, kpiId: number): Promise<PersonalKpi> {
    const found = await repository.find(ownerUserId, kpiId);

    if (!found) {
      throw notFound();
    }

    return mapKpi(found);
  }

  return {
    async list(ownerUserId) {
      return (await repository.list(ownerUserId)).map(mapKpi);
    },

    get,

    async create(ownerUserId, input) {
      if (await repository.nameExists(ownerUserId, input.name)) {
        throw duplicate();
      }

      try {
        const row = await repository.create(ownerUserId, input);

        if (!row) {
          throw new AppError({
            statusCode: 500,
            code: "KPI_CREATE_FAILED",
            message: "The KPI could not be created.",
          });
        }

        return mapKpi(row);
      } catch (error) {
        if (uniqueError(error)) {
          throw duplicate();
        }

        throw error;
      }
    },

    async update(ownerUserId, kpiId, input) {
      await get(ownerUserId, kpiId);

      if (await repository.nameExists(ownerUserId, input.name, kpiId)) {
        throw duplicate();
      }

      try {
        const row = await repository.update(ownerUserId, kpiId, input);

        if (!row) {
          throw notFound();
        }

        return mapKpi(row);
      } catch (error) {
        if (uniqueError(error)) {
          throw duplicate();
        }

        throw error;
      }
    },

    async setActive(ownerUserId, kpiId, isActive) {
      await get(ownerUserId, kpiId);

      if (!(await repository.setActive(ownerUserId, kpiId, isActive))) {
        throw notFound();
      }

      return get(ownerUserId, kpiId);
    },

    async reorder(ownerUserId, ids) {
      const current = await repository.listIds(ownerUserId);

      if (current.length !== ids.length || current.some((id) => !ids.includes(id))) {
        throw new AppError({
          statusCode: 409,
          code: "KPI_ORDER_MISMATCH",
          message: "The KPI order is outdated. Reload and try again.",
        });
      }

      await repository.reorder(ownerUserId, ids);

      return (await repository.list(ownerUserId)).map(mapKpi);
    },

    async archive(ownerUserId, kpiId) {
      await get(ownerUserId, kpiId);

      if (!(await repository.archive(ownerUserId, kpiId))) {
        throw new AppError({
          statusCode: 409,
          code: "KPI_ARCHIVE_CONFLICT",
          message: "The KPI changed before it could be archived.",
        });
      }
    },
  };
}

export const kpisService = createKpisService(kpisRepository);
