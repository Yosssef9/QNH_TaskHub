import { AppError } from "../../shared/errors/app-error.js";
import { normalizeSqlRowVersion } from "../../shared/utils/sql-row-version.js";
import { savedViewConfigSchema } from "./procurement-saved-views.schemas.js";
import type { SavedViewRecord, SelectionRecord } from "./procurement-saved-views.repository.js";
import type { ProcurementSavedView, ProcurementSavedViewSelection } from "./procurement-saved-views.types.js";

export function mapSavedView(record: SavedViewRecord): ProcurementSavedView {
  let parsed: unknown;
  try { parsed = JSON.parse(record.configJson); }
  catch { throw new AppError({ statusCode: 500, code: "INVALID_SAVED_VIEW_CONFIG", message: "Saved View configuration is invalid." }); }
  const config = savedViewConfigSchema.parse(parsed);
  const rowVersion = normalizeSqlRowVersion(record.rowVersion);
  if (!rowVersion) throw new AppError({ statusCode: 500, code: "INVALID_SAVED_VIEW_VERSION", message: "Saved View concurrency token is invalid." });
  return {
    id: Number(record.id),
    name: record.name,
    config,
    isDefault: Boolean(record.isDefault),
    createdAtUtc: record.createdAtUtc.toISOString(),
    updatedAtUtc: record.updatedAtUtc.toISOString(),
    rowVersion,
  };
}

export function mapSelection(record: SelectionRecord): ProcurementSavedViewSelection {
  return { id: Number(record.id), code: record.code, name: record.name };
}
