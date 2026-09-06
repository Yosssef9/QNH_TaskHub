import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { mapSavedView, mapSelection } from "./procurement-saved-views.mapper.js";
import { procurementSavedViewsRepository as repository } from "./procurement-saved-views.repository.js";
import type { ProcurementSavedView, ProcurementSavedViewDetail, ProcurementSavedViewInput } from "./procurement-saved-views.types.js";

function notFound(): AppError {
  return new AppError({ statusCode: 404, code: "SAVED_VIEW_NOT_FOUND", message: "Saved View was not found." });
}
function stale(): AppError {
  return new AppError({ statusCode: 409, code: "SAVED_VIEW_STALE", message: "Saved View changed after it was loaded. Reload and try again." });
}
function normalize(input: ProcurementSavedViewInput): ProcurementSavedViewInput {
  return {
    name: input.name.trim(),
    isDefault: input.isDefault,
    config: {
      ...input.config,
      itemIds: [...new Set(input.config.itemIds)],
      supplierIds: [...new Set(input.config.supplierIds)],
      category: input.config.category?.trim() || null,
      sortBy: input.config.sortBy?.trim() || null,
      columns: [...new Set(input.config.columns)],
    },
  };
}

export const procurementSavedViewsService = {
  async list(ownerUserId: number): Promise<ProcurementSavedView[]> {
    return (await repository.listSavedViews(ownerUserId)).map(mapSavedView);
  },
  async get(ownerUserId: number, savedViewId: number): Promise<ProcurementSavedViewDetail> {
    const row = await repository.findSavedView(ownerUserId, savedViewId);
    if (!row) throw notFound();
    const view = mapSavedView(row);
    const [items, suppliers] = await Promise.all([
      repository.resolveItemSelections(view.config.itemIds),
      repository.resolveSupplierSelections(view.config.supplierIds),
    ]);
    return { ...view, selectedItems: items.map(mapSelection), selectedSuppliers: suppliers.map(mapSelection) };
  },
  async create(ownerUserId: number, input: ProcurementSavedViewInput): Promise<ProcurementSavedViewDetail> {
    const normalized = normalize(input);
    const id = await withTransaction((transaction) => repository.createSavedView(transaction, ownerUserId, normalized));
    return this.get(ownerUserId, id);
  },
  async update(ownerUserId: number, savedViewId: number, input: ProcurementSavedViewInput, rowVersion: string): Promise<ProcurementSavedViewDetail> {
    const current = await repository.findSavedView(ownerUserId, savedViewId);
    if (!current) throw notFound();
    await withTransaction(async (transaction) => {
      const updated = await repository.updateSavedView(transaction, ownerUserId, savedViewId, normalize(input), rowVersion);
      if (!updated) throw stale();
    });
    return this.get(ownerUserId, savedViewId);
  },
  async remove(ownerUserId: number, savedViewId: number, rowVersion: string): Promise<void> {
    const current = await repository.findSavedView(ownerUserId, savedViewId);
    if (!current) throw notFound();
    if (!(await repository.deleteSavedView(ownerUserId, savedViewId, rowVersion))) throw stale();
  },
  async duplicate(ownerUserId: number, savedViewId: number, name?: string): Promise<ProcurementSavedViewDetail> {
    const current = await this.get(ownerUserId, savedViewId);
    return this.create(ownerUserId, {
      name: name?.trim() || `${current.name} Copy`,
      config: current.config,
      isDefault: false,
    });
  },
  async setDefault(ownerUserId: number, savedViewId: number): Promise<ProcurementSavedViewDetail> {
    if (!(await repository.setDefault(ownerUserId, savedViewId))) throw notFound();
    return this.get(ownerUserId, savedViewId);
  },
};
