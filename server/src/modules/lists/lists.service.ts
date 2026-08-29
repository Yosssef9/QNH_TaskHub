import { AppError } from "../../shared/errors/app-error.js";
import { mapPersonalList } from "./lists.mapper.js";
import { listsRepository, type ListsRepository } from "./lists.repository.js";
import type {
  CreateListInput,
  PersonalList,
  PersonalListRecord,
  UpdateListInput,
} from "./lists.types.js";

export interface ListsService {
  list(ownerUserId: number): Promise<PersonalList[]>;
  create(ownerUserId: number, input: CreateListInput): Promise<PersonalList>;
  update(ownerUserId: number, listId: number, input: UpdateListInput): Promise<PersonalList>;
  reorder(ownerUserId: number, listIds: number[]): Promise<PersonalList[]>;
  archive(ownerUserId: number, listId: number): Promise<void>;
}

function assertSameIds(actualIds: number[], requestedIds: number[]): void {
  if (
    actualIds.length !== requestedIds.length ||
    actualIds.some((id) => !requestedIds.includes(id))
  ) {
    throw new AppError({
      statusCode: 409,
      code: "LIST_ORDER_MISMATCH",
      message: "The list order is outdated. Reload the lists and try again.",
    });
  }
}

function duplicateNameError(): AppError {
  return new AppError({
    statusCode: 409,
    code: "LIST_NAME_ALREADY_EXISTS",
    message: "An active personal list already uses this name.",
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("number" in error)) return false;
  const errorNumber = (error as { number?: unknown }).number;
  return errorNumber === 2601 || errorNumber === 2627;
}

export function createListsService(repository: ListsRepository): ListsService {
  return {
    async list(ownerUserId) {
      return (await repository.listActive(ownerUserId)).map(mapPersonalList);
    },

    async create(ownerUserId, input) {
      if (await repository.activeNameExists(ownerUserId, input.name)) throw duplicateNameError();

      let created: PersonalListRecord | null;
      try {
        created = await repository.create(ownerUserId, input);
      } catch (error) {
        if (isUniqueConstraintError(error)) throw duplicateNameError();
        throw error;
      }
      if (!created) {
        throw new AppError({
          statusCode: 500,
          code: "LIST_CREATE_FAILED",
          message: "The personal list could not be created.",
        });
      }
      return mapPersonalList(created);
    },

    async update(ownerUserId, listId, input) {
      const current = await repository.findActiveOwnedById(ownerUserId, listId);
      if (!current) {
        throw new AppError({ statusCode: 404, code: "LIST_NOT_FOUND", message: "List not found." });
      }
      if (current.isDefault) {
        throw new AppError({
          statusCode: 409,
          code: "DEFAULT_LIST_IMMUTABLE",
          message: "The permanent My Tasks list cannot be customized.",
        });
      }
      if (
        input.name !== undefined &&
        (await repository.activeNameExists(ownerUserId, input.name, listId))
      ) {
        throw duplicateNameError();
      }

      let updated: PersonalListRecord | null;
      try {
        updated = await repository.update(ownerUserId, listId, input);
      } catch (error) {
        if (isUniqueConstraintError(error)) throw duplicateNameError();
        throw error;
      }
      if (!updated) {
        throw new AppError({ statusCode: 404, code: "LIST_NOT_FOUND", message: "List not found." });
      }
      return mapPersonalList(updated);
    },

    async reorder(ownerUserId, listIds) {
      const currentIds = await repository.listActiveCustomIds(ownerUserId);
      assertSameIds(currentIds, listIds);
      await repository.reorder(ownerUserId, listIds);
      return (await repository.listActive(ownerUserId)).map(mapPersonalList);
    },

    async archive(ownerUserId, listId) {
      const current = await repository.findActiveOwnedById(ownerUserId, listId);
      if (!current) {
        throw new AppError({ statusCode: 404, code: "LIST_NOT_FOUND", message: "List not found." });
      }
      if (current.isDefault) {
        throw new AppError({
          statusCode: 409,
          code: "DEFAULT_LIST_IMMUTABLE",
          message: "The permanent My Tasks list cannot be archived.",
        });
      }
      if (await repository.hasActiveTasks(ownerUserId, listId)) {
        throw new AppError({
          statusCode: 409,
          code: "LIST_NOT_EMPTY",
          message: "Move or remove the list's tasks before archiving it.",
        });
      }
      if (!(await repository.archive(ownerUserId, listId))) {
        throw new AppError({
          statusCode: 409,
          code: "LIST_ARCHIVE_CONFLICT",
          message: "The list changed before it could be archived. Try again.",
        });
      }
    },
  };
}

export const listsService = createListsService(listsRepository);
