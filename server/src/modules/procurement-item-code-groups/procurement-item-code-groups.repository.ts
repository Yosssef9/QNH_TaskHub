import { getDatabasePool, sql } from "../../database/sql.js";
import { rowVersionToBuffer, normalizeSqlRowVersion } from "../../shared/utils/sql-row-version.js";
import type { GroupInput } from "./procurement-item-code-groups.schemas.js";

const TABLE = "dbo.TM_procurement_item_code_groups";

interface GroupRecord {
  id: number | string;
  name: string;
  prefix: string;
  rowVersion: unknown;
}
export interface ItemCodeGroup {
  id: number;
  name: string;
  prefix: string;
  rowVersion: string;
}
function map(row: GroupRecord): ItemCodeGroup {
  const version = normalizeSqlRowVersion(row.rowVersion);
  if (!version) throw new Error("Invalid item code group version from database.");
  return { id: Number(row.id), name: row.name, prefix: row.prefix, rowVersion: version };
}
const select = "id, group_name AS name, code_prefix AS prefix, row_version AS rowVersion";

export async function listGroups(): Promise<ItemCodeGroup[]> {
  const pool = await getDatabasePool();
  const result = await pool.request().query<GroupRecord>(`SELECT ${select} FROM ${TABLE} ORDER BY group_name ASC, id ASC`);
  return result.recordset.map(map);
}
export async function findGroup(id: number): Promise<ItemCodeGroup | null> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("id", sql.BigInt, id).query<GroupRecord>(`SELECT ${select} FROM ${TABLE} WHERE id = @id`);
  return result.recordset[0] ? map(result.recordset[0]) : null;
}
export async function createGroup(input: GroupInput): Promise<ItemCodeGroup> {
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("name", sql.NVarChar(120), input.name)
    .input("prefix", sql.VarChar(20), input.prefix)
    .query<GroupRecord>(`INSERT INTO ${TABLE} (group_name, code_prefix)
      OUTPUT inserted.id AS id, inserted.group_name AS name, inserted.code_prefix AS prefix, inserted.row_version AS rowVersion
      VALUES (@name, @prefix)`);
  return map(result.recordset[0]!);
}
export async function updateGroup(id: number, input: GroupInput, rowVersion: string): Promise<ItemCodeGroup | null> {
  const bytes = rowVersionToBuffer(rowVersion);
  if (!bytes) return null;
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("id", sql.BigInt, id)
    .input("rowVersion", sql.VarBinary(8), bytes)
    .input("name", sql.NVarChar(120), input.name)
    .input("prefix", sql.VarChar(20), input.prefix)
    .query<GroupRecord>(`UPDATE ${TABLE} SET group_name = @name, code_prefix = @prefix, updated_at_utc = SYSUTCDATETIME()
      OUTPUT inserted.id AS id, inserted.group_name AS name, inserted.code_prefix AS prefix, inserted.row_version AS rowVersion
      WHERE id = @id AND row_version = @rowVersion`);
  return result.recordset[0] ? map(result.recordset[0]) : null;
}
export async function deleteGroup(id: number, rowVersion: string): Promise<boolean> {
  const bytes = rowVersionToBuffer(rowVersion);
  if (!bytes) return false;
  const pool = await getDatabasePool();
  const result = await pool.request().input("id", sql.BigInt, id).input("rowVersion", sql.VarBinary(8), bytes)
    .query(`DELETE FROM ${TABLE} WHERE id = @id AND row_version = @rowVersion`);
  return (result.rowsAffected[0] ?? 0) === 1;
}
