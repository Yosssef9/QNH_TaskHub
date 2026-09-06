import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { rowVersionToBuffer } from "../../shared/utils/sql-row-version.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
import type { ProcurementSavedViewInput } from "./procurement-saved-views.types.js";

export interface SavedViewRecord {
  id: number | string;
  name: string;
  configJson: string;
  isDefault: boolean | number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  rowVersion: unknown;
}

export interface SelectionRecord {
  id: number | string;
  code: string;
  name: string;
}

function selectSql(): string {
  return `
    view_row.id,
    view_row.view_name AS name,
    view_row.view_config_json AS configJson,
    view_row.is_default AS isDefault,
    view_row.created_at_utc AS createdAtUtc,
    view_row.updated_at_utc AS updatedAtUtc,
    view_row.row_version AS rowVersion
  `;
}

function bindInput(request: import("mssql").Request, input: ProcurementSavedViewInput): void {
  request
    .input("name", sql.NVarChar(120), input.name)
    .input("configJson", sql.NVarChar(sql.MAX), JSON.stringify(input.config))
    .input("isDefault", sql.Bit, input.isDefault);
}

export async function listSavedViews(ownerUserId: number): Promise<SavedViewRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("ownerUserId", sql.Int, ownerUserId).query<SavedViewRecord>(`
    SELECT ${selectSql()}
    FROM dbo.TM_procurement_saved_views AS view_row
    WHERE view_row.owner_user_id = @ownerUserId
    ORDER BY view_row.is_default DESC, view_row.view_name ASC, view_row.id ASC;
  `);
  return result.recordset;
}

export async function findSavedView(ownerUserId: number, savedViewId: number, transaction?: DatabaseTransaction): Promise<SavedViewRecord | null> {
  const request = transaction ? transaction.request() : (await getDatabasePool()).request();
  const result = await request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("savedViewId", sql.BigInt, savedViewId)
    .query<SavedViewRecord>(`
      SELECT TOP (1) ${selectSql()}
      FROM dbo.TM_procurement_saved_views AS view_row ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      WHERE view_row.id = @savedViewId
        AND view_row.owner_user_id = @ownerUserId;
    `);
  return result.recordset[0] ?? null;
}

export async function createSavedView(transaction: DatabaseTransaction, ownerUserId: number, input: ProcurementSavedViewInput): Promise<number> {
  if (input.isDefault) {
    await transaction.request().input("ownerUserId", sql.Int, ownerUserId).query(`
      UPDATE dbo.TM_procurement_saved_views SET is_default = 0, updated_at_utc = SYSUTCDATETIME()
      WHERE owner_user_id = @ownerUserId AND is_default = 1;
    `);
  }
  const request = transaction.request().input("ownerUserId", sql.Int, ownerUserId);
  bindInput(request, input);
  const result = await request.query<{ id: number | string }>(`
    INSERT INTO dbo.TM_procurement_saved_views (owner_user_id, view_name, view_config_json, is_default)
    OUTPUT inserted.id
    VALUES (@ownerUserId, @name, @configJson, @isDefault);
  `);
  return Number(result.recordset[0]?.id);
}

export async function updateSavedView(transaction: DatabaseTransaction, ownerUserId: number, savedViewId: number, input: ProcurementSavedViewInput, rowVersion: string): Promise<boolean> {
  const bytes = rowVersionToBuffer(rowVersion);
  if (!bytes) return false;
  if (input.isDefault) {
    await transaction.request().input("ownerUserId", sql.Int, ownerUserId).input("savedViewId", sql.BigInt, savedViewId).query(`
      UPDATE dbo.TM_procurement_saved_views SET is_default = 0, updated_at_utc = SYSUTCDATETIME()
      WHERE owner_user_id = @ownerUserId AND id <> @savedViewId AND is_default = 1;
    `);
  }
  const request = transaction.request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("savedViewId", sql.BigInt, savedViewId)
    .input("rowVersion", sql.VarBinary(8), bytes);
  bindInput(request, input);
  const result = await request.query(`
    UPDATE dbo.TM_procurement_saved_views
    SET view_name = @name,
        view_config_json = @configJson,
        is_default = @isDefault,
        updated_at_utc = SYSUTCDATETIME()
    WHERE id = @savedViewId
      AND owner_user_id = @ownerUserId
      AND row_version = @rowVersion;
  `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function deleteSavedView(ownerUserId: number, savedViewId: number, rowVersion: string): Promise<boolean> {
  const bytes = rowVersionToBuffer(rowVersion);
  if (!bytes) return false;
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("savedViewId", sql.BigInt, savedViewId)
    .input("rowVersion", sql.VarBinary(8), bytes)
    .query(`
      DELETE FROM dbo.TM_procurement_saved_views
      WHERE id = @savedViewId AND owner_user_id = @ownerUserId AND row_version = @rowVersion;
    `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function setDefault(ownerUserId: number, savedViewId: number): Promise<boolean> {
  const pool = await getDatabasePool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const exists = await transaction.request().input("ownerUserId", sql.Int, ownerUserId).input("savedViewId", sql.BigInt, savedViewId).query<{ id: number | string }>(`
      SELECT TOP (1) id FROM dbo.TM_procurement_saved_views WITH (UPDLOCK, HOLDLOCK)
      WHERE id = @savedViewId AND owner_user_id = @ownerUserId;
    `);
    if (!exists.recordset[0]) {
      await transaction.rollback();
      return false;
    }
    await transaction.request().input("ownerUserId", sql.Int, ownerUserId).query(`
      UPDATE dbo.TM_procurement_saved_views SET is_default = 0, updated_at_utc = SYSUTCDATETIME()
      WHERE owner_user_id = @ownerUserId AND is_default = 1;
    `);
    await transaction.request().input("ownerUserId", sql.Int, ownerUserId).input("savedViewId", sql.BigInt, savedViewId).query(`
      UPDATE dbo.TM_procurement_saved_views SET is_default = 1, updated_at_utc = SYSUTCDATETIME()
      WHERE id = @savedViewId AND owner_user_id = @ownerUserId;
    `);
    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function resolveItemSelections(itemIds: number[]): Promise<SelectionRecord[]> {
  if (itemIds.length === 0) return [];
  const pool = await getDatabasePool();
  const result = await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(itemIds)).query<SelectionRecord>(`
    SELECT
      CONVERT(BIGINT, item.ITEM_NO) AS id,
      CONVERT(NVARCHAR(100), item.ITEM_CODE) AS code,
      CONVERT(NVARCHAR(500), item.ITEM_NAME) AS name
    FROM ${PROCUREMENT_DB_OBJECTS.itemsTable} AS item
    INNER JOIN OPENJSON(@ids) WITH (id BIGINT '$') AS selected ON selected.id = CONVERT(BIGINT, item.ITEM_NO)
    ORDER BY item.ITEM_NAME, item.ITEM_NO;
  `);
  return result.recordset;
}

export async function resolveSupplierSelections(supplierIds: number[]): Promise<SelectionRecord[]> {
  if (supplierIds.length === 0) return [];
  const pool = await getDatabasePool();
  const result = await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(supplierIds)).query<SelectionRecord>(`
    SELECT
      CONVERT(BIGINT, supplier.SUPPLIER_ID) AS id,
      CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) AS code,
      CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME) AS name
    FROM ${PROCUREMENT_DB_OBJECTS.suppliersTable} AS supplier
    INNER JOIN OPENJSON(@ids) WITH (id BIGINT '$') AS selected ON selected.id = CONVERT(BIGINT, supplier.SUPPLIER_ID)
    ORDER BY supplier.SUPPLIER_NAME, supplier.SUPPLIER_ID;
  `);
  return result.recordset;
}


export const procurementSavedViewsRepository = {
  listSavedViews,
  findSavedView,
  createSavedView,
  updateSavedView,
  deleteSavedView,
  setDefault,
  resolveItemSelections,
  resolveSupplierSelections,
};
