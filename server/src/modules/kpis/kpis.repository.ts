import { getDatabasePool, sql } from "../../database/sql.js";
import type { KpiRecord, SaveKpiInput } from "./kpis.types.js";

const selectFields = `k.id, k.name, k.description, k.icon_key AS iconKey, k.color,
  k.calculation_method AS calculationMethod, k.period_type AS periodType,
  k.measurement_unit AS measurementUnit, k.target_value AS targetValue,
  k.target_direction AS targetDirection, k.deadline_source AS deadlineSource,
  k.business_day_offset AS businessDayOffset, k.deadline_direction AS deadlineDirection,
  k.reference_date_label AS referenceDateLabel,
  k.numerator_label AS numeratorLabel, k.denominator_label AS denominatorLabel,
  k.value_label AS valueLabel, k.display_order AS displayOrder, k.is_active AS isActive,
  (SELECT COUNT_BIG(*) FROM dbo.TM_tasks t INNER JOIN dbo.TM_kpi_instances i ON i.id=t.kpi_instance_id AND i.owner_user_id=t.owner_user_id
    WHERE t.owner_user_id=k.owner_user_id AND i.kpi_id=k.id AND t.deleted_at_utc IS NULL) AS taskCount`;

function bindSave(request: sql.Request, input: SaveKpiInput): sql.Request {
  return request
    .input("name", sql.NVarChar(150), input.name)
    .input("description", sql.NVarChar(1500), input.description)
    .input("iconKey", sql.VarChar(50), input.iconKey)
    .input("color", sql.VarChar(7), input.color)
    .input("method", sql.VarChar(30), input.calculationMethod)
    .input("period", sql.VarChar(10), input.periodType)
    .input(
      "unit",
      sql.VarChar(10),
      input.calculationMethod === "MANUAL_NUMBER" ? "NUMBER" : "PERCENT",
    )
    .input("target", sql.Decimal(19, 4), input.targetValue)
    .input("targetDirection", sql.VarChar(20), input.targetDirection)
    .input("deadlineSource", sql.VarChar(20), input.deadlineSource)
    .input("offset", sql.SmallInt, input.businessDayOffset)
    .input("deadlineDirection", sql.VarChar(10), input.deadlineDirection)
    .input("referenceLabel", sql.NVarChar(100), input.referenceDateLabel)
    .input("numeratorLabel", sql.NVarChar(100), input.numeratorLabel)
    .input("denominatorLabel", sql.NVarChar(100), input.denominatorLabel)
    .input("valueLabel", sql.NVarChar(100), input.valueLabel);
}

export interface KpisRepository {
  list(ownerUserId: number): Promise<KpiRecord[]>;
  find(ownerUserId: number, kpiId: number): Promise<KpiRecord | null>;
  nameExists(ownerUserId: number, name: string, excludedId?: number): Promise<boolean>;
  create(ownerUserId: number, input: SaveKpiInput): Promise<KpiRecord | null>;
  update(ownerUserId: number, kpiId: number, input: SaveKpiInput): Promise<KpiRecord | null>;
  setActive(ownerUserId: number, kpiId: number, isActive: boolean): Promise<boolean>;
  listIds(ownerUserId: number): Promise<number[]>;
  reorder(ownerUserId: number, ids: number[]): Promise<void>;
  archive(ownerUserId: number, kpiId: number): Promise<boolean>;
}

export async function list(ownerUserId: number): Promise<KpiRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .query<KpiRecord>(
      `SELECT ${selectFields} FROM dbo.TM_kpis k WHERE k.owner_user_id=@ownerUserId AND k.archived_at_utc IS NULL ORDER BY k.display_order,k.id;`,
    );

  return result.recordset;
}

export async function find(ownerUserId: number, kpiId: number): Promise<KpiRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("kpiId", sql.BigInt, kpiId)
    .query<KpiRecord>(
      `SELECT ${selectFields} FROM dbo.TM_kpis k WHERE k.owner_user_id=@ownerUserId AND k.id=@kpiId AND k.archived_at_utc IS NULL;`,
    );

  return result.recordset[0] ?? null;
}

export async function nameExists(
  ownerUserId: number,
  name: string,
  excludedId?: number,
): Promise<boolean> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("name", sql.NVarChar(150), name)
    .input("excludedId", sql.BigInt, excludedId ?? null)
    .query<{ exists: boolean }>(
      `SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.TM_kpis WHERE owner_user_id=@ownerUserId AND name=@name AND archived_at_utc IS NULL AND (@excludedId IS NULL OR id<>@excludedId)) THEN 1 ELSE 0 END AS BIT) AS [exists];`,
    );

  return result.recordset[0]?.exists ?? false;
}

export async function create(ownerUserId: number, input: SaveKpiInput): Promise<KpiRecord | null> {
  const pool = await getDatabasePool();
  const request = bindSave(pool.request().input("ownerUserId", sql.Int, ownerUserId), input);

  const result = await request.query<KpiRecord>(
    `INSERT dbo.TM_kpis(owner_user_id,name,description,icon_key,color,calculation_method,period_type,measurement_unit,target_value,target_direction,deadline_source,business_day_offset,deadline_direction,reference_date_label,numerator_label,denominator_label,value_label,display_order) SELECT @ownerUserId,@name,@description,@iconKey,@color,@method,@period,@unit,@target,@targetDirection,@deadlineSource,@offset,@deadlineDirection,@referenceLabel,@numeratorLabel,@denominatorLabel,@valueLabel,ISNULL(MAX(display_order),0)+1 FROM dbo.TM_kpis WHERE owner_user_id=@ownerUserId AND archived_at_utc IS NULL; DECLARE @id BIGINT=SCOPE_IDENTITY(); SELECT ${selectFields} FROM dbo.TM_kpis k WHERE k.id=@id;`,
  );

  return result.recordset[0] ?? null;
}

export async function update(
  ownerUserId: number,
  kpiId: number,
  input: SaveKpiInput,
): Promise<KpiRecord | null> {
  const pool = await getDatabasePool();

  const request = bindSave(
    pool.request().input("ownerUserId", sql.Int, ownerUserId).input("kpiId", sql.BigInt, kpiId),
    input,
  );

  const result = await request.query<KpiRecord>(
    `UPDATE dbo.TM_kpis SET name=@name,description=@description,icon_key=@iconKey,color=@color,calculation_method=@method,period_type=@period,measurement_unit=@unit,target_value=@target,target_direction=@targetDirection,deadline_source=@deadlineSource,business_day_offset=@offset,deadline_direction=@deadlineDirection,reference_date_label=@referenceLabel,numerator_label=@numeratorLabel,denominator_label=@denominatorLabel,value_label=@valueLabel,updated_at_utc=SYSUTCDATETIME() WHERE id=@kpiId AND owner_user_id=@ownerUserId AND archived_at_utc IS NULL; SELECT ${selectFields} FROM dbo.TM_kpis k WHERE k.id=@kpiId AND k.owner_user_id=@ownerUserId AND k.archived_at_utc IS NULL;`,
  );

  return result.recordset[0] ?? null;
}

export async function setActive(
  ownerUserId: number,
  kpiId: number,
  isActive: boolean,
): Promise<boolean> {
  const pool = await getDatabasePool();

  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("kpiId", sql.BigInt, kpiId)
    .input("isActive", sql.Bit, isActive)
    .query(
      `UPDATE dbo.TM_kpis SET is_active=@isActive,updated_at_utc=SYSUTCDATETIME() WHERE id=@kpiId AND owner_user_id=@ownerUserId AND archived_at_utc IS NULL;`,
    );

  return result.rowsAffected[0] === 1;
}

export async function listIds(ownerUserId: number): Promise<number[]> {
  const pool = await getDatabasePool();

  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .query<{ id: number }>(
      `SELECT id FROM dbo.TM_kpis WHERE owner_user_id=@ownerUserId AND archived_at_utc IS NULL ORDER BY display_order,id;`,
    );

  return result.recordset.map((x) => Number(x.id));
}

export async function reorder(ownerUserId: number, ids: number[]): Promise<void> {
  const pool = await getDatabasePool();
  const json = JSON.stringify(ids.map((id, index) => ({ id, displayOrder: index + 1 })));

  await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("json", sql.NVarChar(sql.MAX), json)
    .query(
      `UPDATE k SET display_order=o.displayOrder,updated_at_utc=SYSUTCDATETIME() FROM dbo.TM_kpis k JOIN OPENJSON(@json) WITH(id BIGINT '$.id',displayOrder INT '$.displayOrder') o ON o.id=k.id WHERE k.owner_user_id=@ownerUserId AND k.archived_at_utc IS NULL;`,
    );
}

export async function archive(ownerUserId: number, kpiId: number): Promise<boolean> {
  const pool = await getDatabasePool();

  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("kpiId", sql.BigInt, kpiId)
    .query(
      `UPDATE dbo.TM_kpis SET is_active=0,archived_at_utc=SYSUTCDATETIME(),updated_at_utc=SYSUTCDATETIME()
        WHERE id=@kpiId AND owner_user_id=@ownerUserId AND archived_at_utc IS NULL;`,
    );

  return result.rowsAffected[0] === 1;
}

export const kpisRepository: KpisRepository = {
  list,
  find,
  nameExists,
  create,
  update,
  setActive,
  listIds,
  reorder,
  archive,
};
