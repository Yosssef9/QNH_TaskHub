import { getDatabasePool, sql } from "../../database/sql.js";
import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import type { CreateListInput, PersonalListRecord, UpdateListInput } from "./lists.types.js";

interface ExistsRecord {
  exists: boolean;
}

export interface ListsRepository {
  listActive(ownerUserId: number): Promise<PersonalListRecord[]>;
  findActiveOwnedById(ownerUserId: number, listId: number): Promise<PersonalListRecord | null>;
  activeNameExists(ownerUserId: number, name: string, excludedListId?: number): Promise<boolean>;
  create(ownerUserId: number, input: CreateListInput): Promise<PersonalListRecord | null>;
  update(
    ownerUserId: number,
    listId: number,
    input: UpdateListInput,
  ): Promise<PersonalListRecord | null>;
  listActiveCustomIds(ownerUserId: number): Promise<number[]>;
  reorder(ownerUserId: number, listIds: number[]): Promise<void>;
  hasActiveTasks(ownerUserId: number, listId: number): Promise<boolean>;
  archive(ownerUserId: number, listId: number): Promise<boolean>;
}

export async function listActive(ownerUserId: number): Promise<PersonalListRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("ownerUserId", sql.Int, ownerUserId)
    .query<PersonalListRecord>(`
      SELECT id, name, icon_key AS iconKey, color, is_default AS isDefault,
        display_order AS displayOrder
      FROM dbo.TM_lists
      WHERE owner_user_id = @ownerUserId
        AND archived_at_utc IS NULL
      ORDER BY is_default DESC, display_order, id;
    `);

  return result.recordset;
}

export async function findActiveOwnedById(
  ownerUserId: number,
  listId: number,
): Promise<PersonalListRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("listId", sql.BigInt, listId).query<PersonalListRecord>(`
      SELECT TOP (1) id, name, icon_key AS iconKey, color, is_default AS isDefault,
        display_order AS displayOrder
      FROM dbo.TM_lists
      WHERE id = @listId
        AND owner_user_id = @ownerUserId
        AND archived_at_utc IS NULL;
    `);

  return result.recordset[0] ?? null;
}

export async function activeNameExists(
  ownerUserId: number,
  name: string,
  excludedListId?: number,
): Promise<boolean> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("name", sql.NVarChar(120), name)
    .input("excludedListId", sql.BigInt, excludedListId ?? null).query<ExistsRecord>(`
      SELECT CAST(CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.TM_lists
        WHERE owner_user_id = @ownerUserId
          AND name = @name
          AND archived_at_utc IS NULL
          AND (@excludedListId IS NULL OR id <> @excludedListId)
      ) THEN 1 ELSE 0 END AS BIT) AS [exists];
    `);

  return result.recordset[0]?.exists ?? false;
}

export async function create(
  ownerUserId: number,
  input: CreateListInput,
): Promise<PersonalListRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("name", sql.NVarChar(120), input.name)
    .input("iconKey", sql.VarChar(50), input.iconKey)
    .input("color", sql.VarChar(7), input.color).query<PersonalListRecord>(`
      INSERT INTO dbo.TM_lists (owner_user_id, name, icon_key, color, display_order)
      OUTPUT inserted.id, inserted.name, inserted.icon_key AS iconKey, inserted.color,
        inserted.is_default AS isDefault, inserted.display_order AS displayOrder
      SELECT @ownerUserId, @name, @iconKey, @color,
        ISNULL(MAX(display_order), 0) + 1
      FROM dbo.TM_lists
      WHERE owner_user_id = @ownerUserId
        AND archived_at_utc IS NULL;
    `);

  return result.recordset[0] ?? null;
}

export async function update(
  ownerUserId: number,
  listId: number,
  input: UpdateListInput,
): Promise<PersonalListRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("listId", sql.BigInt, listId)
    .input("name", sql.NVarChar(120), input.name ?? null)
    .input("iconKey", sql.VarChar(50), input.iconKey ?? null)
    .input("color", sql.VarChar(7), input.color ?? null).query<PersonalListRecord>(`
      UPDATE dbo.TM_lists
      SET name = COALESCE(@name, name),
        icon_key = COALESCE(@iconKey, icon_key),
        color = COALESCE(@color, color),
        updated_at_utc = SYSUTCDATETIME()
      OUTPUT inserted.id, inserted.name, inserted.icon_key AS iconKey, inserted.color,
        inserted.is_default AS isDefault, inserted.display_order AS displayOrder
      WHERE id = @listId
        AND owner_user_id = @ownerUserId
        AND is_default = 0
        AND archived_at_utc IS NULL;
    `);

  return result.recordset[0] ?? null;
}

export async function listActiveCustomIds(ownerUserId: number): Promise<number[]> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("ownerUserId", sql.Int, ownerUserId).query<{
    id: number | string;
  }>(`
      SELECT id
      FROM dbo.TM_lists
      WHERE owner_user_id = @ownerUserId
        AND is_default = 0
        AND archived_at_utc IS NULL
      ORDER BY display_order, id;
    `);

  return result.recordset.map((record) => parsePositiveIntegerId(record.id, "list id"));
}

export async function reorder(ownerUserId: number, listIds: number[]): Promise<void> {
  const pool = await getDatabasePool();
  const orderingJson = JSON.stringify(
    listIds.map((id, index) => ({ id, displayOrder: index + 1 })),
  );

  await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("orderingJson", sql.NVarChar(sql.MAX), orderingJson).query(`
      UPDATE list
      SET list.display_order = ordering.displayOrder,
        list.updated_at_utc = SYSUTCDATETIME()
      FROM dbo.TM_lists AS list
      INNER JOIN OPENJSON(@orderingJson)
        WITH (id BIGINT '$.id', displayOrder INT '$.displayOrder') AS ordering
        ON ordering.id = list.id
      WHERE list.owner_user_id = @ownerUserId
        AND list.is_default = 0
        AND list.archived_at_utc IS NULL;
    `);
}

export async function hasActiveTasks(ownerUserId: number, listId: number): Promise<boolean> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("listId", sql.BigInt, listId).query<ExistsRecord>(`
      SELECT CAST(CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.TM_tasks
        WHERE owner_user_id = @ownerUserId
          AND list_id = @listId
          AND deleted_at_utc IS NULL
      ) THEN 1 ELSE 0 END AS BIT) AS [exists];
    `);

  return result.recordset[0]?.exists ?? false;
}

export async function archive(ownerUserId: number, listId: number): Promise<boolean> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("listId", sql.BigInt, listId).query(`
      UPDATE dbo.TM_lists
      SET archived_at_utc = SYSUTCDATETIME(), updated_at_utc = SYSUTCDATETIME()
      WHERE id = @listId
        AND owner_user_id = @ownerUserId
        AND is_default = 0
        AND archived_at_utc IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM dbo.TM_tasks
          WHERE owner_user_id = @ownerUserId
            AND list_id = @listId
            AND deleted_at_utc IS NULL
        );
    `);

  return result.rowsAffected[0] === 1;
}

export const listsRepository: ListsRepository = {
  listActive,
  findActiveOwnedById,
  activeNameExists,
  create,
  update,
  listActiveCustomIds,
  reorder,
  hasActiveTasks,
  archive,
};
