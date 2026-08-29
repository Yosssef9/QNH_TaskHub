import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ListsRepository } from "../../src/modules/lists/lists.repository.js";
import { createListsService } from "../../src/modules/lists/lists.service.js";
import type { PersonalListRecord } from "../../src/modules/lists/lists.types.js";

const myTasks: PersonalListRecord = {
  id: 1,
  name: "My Tasks",
  iconKey: "list-todo",
  color: "#2563EB",
  isDefault: true,
  displayOrder: 0,
};

const customList: PersonalListRecord = {
  id: 2,
  name: "Planning",
  iconKey: "target",
  color: "#0D9488",
  isDefault: false,
  displayOrder: 1,
};

function createRepository(): ListsRepository {
  return {
    listActive: vi.fn(),
    findActiveOwnedById: vi.fn(),
    activeNameExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    listActiveCustomIds: vi.fn(),
    reorder: vi.fn(),
    hasActiveTasks: vi.fn(),
    archive: vi.fn(),
  };
}

describe("personal lists service", () => {
  let repository: ListsRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it("scopes list reads to the authenticated owner", async () => {
    vi.mocked(repository.listActive).mockResolvedValue([myTasks, customList]);

    const result = await createListsService(repository).list(7);

    expect(repository.listActive).toHaveBeenCalledWith(7);
    expect(result.map((list) => list.id)).toEqual([1, 2]);
  });

  it("does not reveal a list that is absent from the owner's scope", async () => {
    vi.mocked(repository.findActiveOwnedById).mockResolvedValue(null);

    await expect(
      createListsService(repository).update(7, 99, { name: "Private" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "LIST_NOT_FOUND" });
    expect(repository.findActiveOwnedById).toHaveBeenCalledWith(7, 99);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("protects the permanent My Tasks list from changes and archiving", async () => {
    vi.mocked(repository.findActiveOwnedById).mockResolvedValue(myTasks);
    const service = createListsService(repository);

    await expect(service.update(7, 1, { name: "Changed" })).rejects.toMatchObject({
      code: "DEFAULT_LIST_IMMUTABLE",
    });
    await expect(service.archive(7, 1)).rejects.toMatchObject({
      code: "DEFAULT_LIST_IMMUTABLE",
    });
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it("prevents a custom list with active tasks from being archived", async () => {
    vi.mocked(repository.findActiveOwnedById).mockResolvedValue(customList);
    vi.mocked(repository.hasActiveTasks).mockResolvedValue(true);

    await expect(createListsService(repository).archive(7, 2)).rejects.toMatchObject({
      code: "LIST_NOT_EMPTY",
    });
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it("rejects stale or forged list reorder payloads", async () => {
    vi.mocked(repository.listActiveCustomIds).mockResolvedValue([2, 3]);

    await expect(createListsService(repository).reorder(7, [2, 99])).rejects.toMatchObject({
      code: "LIST_ORDER_MISMATCH",
    });
    expect(repository.reorder).not.toHaveBeenCalled();
  });
});
