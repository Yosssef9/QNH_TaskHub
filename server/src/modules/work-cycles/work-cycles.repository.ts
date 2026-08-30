import { getDatabasePool, sql } from "../../database/sql.js";
import type { DatabaseTransaction } from "../../database/types.js";
import type { CreateCycleBody, UpdateCycleBody } from "./work-cycles.schemas.js";
import type { KpiInstanceRecord, WorkCycleRecord } from "./work-cycles.types.js";

const cycleSelect = `cycle.id, cycle.title, cycle.description, cycle.icon_key AS iconKey,
  cycle.color, cycle.start_date AS startDate, cycle.end_date AS endDate,
  cycle.display_order AS displayOrder, cycle.closed_at_utc AS closedAtUtc,
  cycle.archived_at_utc AS archivedAtUtc,
  CAST(CASE WHEN settings.current_work_cycle_id=cycle.id THEN 1 ELSE 0 END AS BIT) AS isCurrent,
  ISNULL(work.total, 0) AS taskCount, ISNULL(work.completed, 0) AS completedTaskCount,
  ISNULL(work.overdue, 0) AS overdueTaskCount`;
const cycleWorkApply = `OUTER APPLY (
  SELECT COUNT_BIG(*) AS total,
    SUM(CASE WHEN task.status='DONE' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN task.due_date<@today AND task.status NOT IN('DONE','CANCELLED') THEN 1 ELSE 0 END) AS overdue
  FROM dbo.TM_kpi_instances instance
  INNER JOIN dbo.TM_tasks task ON task.kpi_instance_id=instance.id
    AND task.owner_user_id=instance.owner_user_id AND task.deleted_at_utc IS NULL
  WHERE instance.cycle_id=cycle.id AND instance.owner_user_id=cycle.owner_user_id
) work`;

const instanceSelect = `instance.id, instance.kpi_id AS templateId, instance.cycle_id AS cycleId,
  cycle.title AS cycleTitle, cycle.closed_at_utc AS cycleClosedAtUtc,
  instance.name_snapshot AS name, instance.description_snapshot AS description,
  instance.icon_key_snapshot AS iconKey, instance.color_snapshot AS color,
  instance.calculation_method_snapshot AS calculationMethod,
  instance.period_type_snapshot AS periodType,
  instance.measurement_unit_snapshot AS measurementUnit,
  instance.target_value_snapshot AS targetValue,
  instance.target_direction_snapshot AS targetDirection,
  instance.deadline_source_snapshot AS deadlineSource,
  instance.business_day_offset_snapshot AS businessDayOffset,
  instance.deadline_direction_snapshot AS deadlineDirection,
  instance.reference_date_label_snapshot AS referenceDateLabel,
  instance.numerator_label_snapshot AS numeratorLabel,
  instance.denominator_label_snapshot AS denominatorLabel,
  instance.value_label_snapshot AS valueLabel,
  instance.display_order AS displayOrder,
  CAST(CASE WHEN cycle.closed_at_utc IS NULL AND cycle.archived_at_utc IS NULL THEN 1 ELSE 0 END AS BIT) AS isActive,
  (SELECT COUNT_BIG(*) FROM dbo.TM_tasks task WHERE task.owner_user_id=instance.owner_user_id
    AND task.kpi_instance_id=instance.id AND task.deleted_at_utc IS NULL) AS taskCount`;

async function listInstances(owner: number, cycleId?: number): Promise<KpiInstanceRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("owner", sql.Int, owner)
    .input("cycleId", sql.BigInt, cycleId ?? null)
    .query<KpiInstanceRecord>(`SELECT ${instanceSelect}
      FROM dbo.TM_kpi_instances instance
      INNER JOIN dbo.TM_work_cycles cycle ON cycle.id=instance.cycle_id
        AND cycle.owner_user_id=instance.owner_user_id
      WHERE instance.owner_user_id=@owner AND cycle.archived_at_utc IS NULL
        AND (@cycleId IS NULL OR instance.cycle_id=@cycleId)
      ORDER BY cycle.display_order, cycle.id, instance.display_order, instance.id;`);
  return result.recordset;
}

export const workCyclesRepository = {
  async list(owner: number, today: string) {
    const pool = await getDatabasePool();
    const [cycles, instances] = await Promise.all([
      pool.request().input("owner", sql.Int, owner).input("today", sql.Date, today)
        .query<WorkCycleRecord>(`SELECT ${cycleSelect} FROM dbo.TM_work_cycles cycle
          LEFT JOIN dbo.TM_user_settings settings ON settings.portal_user_id=cycle.owner_user_id
          ${cycleWorkApply}
          WHERE cycle.owner_user_id=@owner AND cycle.archived_at_utc IS NULL
          ORDER BY cycle.display_order,cycle.id;`),
      listInstances(owner),
    ]);
    return { cycles: cycles.recordset, instances };
  },

  async find(owner: number, cycleId: number, today: string) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId)
      .input("today", sql.Date, today)
      .query<WorkCycleRecord>(`SELECT TOP(1) ${cycleSelect} FROM dbo.TM_work_cycles cycle
        LEFT JOIN dbo.TM_user_settings settings ON settings.portal_user_id=cycle.owner_user_id
        ${cycleWorkApply}
        WHERE cycle.id=@cycleId AND cycle.owner_user_id=@owner AND cycle.archived_at_utc IS NULL;`);
    return { cycle: result.recordset[0] ?? null, instances: await listInstances(owner, cycleId) };
  },

  async findInstance(owner: number, instanceId: number) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("instanceId", sql.BigInt, instanceId)
      .query<KpiInstanceRecord>(`SELECT TOP(1) ${instanceSelect}
        FROM dbo.TM_kpi_instances instance
        INNER JOIN dbo.TM_work_cycles cycle ON cycle.id=instance.cycle_id
          AND cycle.owner_user_id=instance.owner_user_id
        WHERE instance.id=@instanceId AND instance.owner_user_id=@owner
          AND cycle.archived_at_utc IS NULL;`);
    return result.recordset[0] ?? null;
  },

  async createCycle(tx: DatabaseTransaction, owner: number, input: CreateCycleBody) {
    const result = await tx
      .request()
      .input("owner", sql.Int, owner)
      .input("title", sql.NVarChar(1000), input.title)
      .input("description", sql.NVarChar(1500), input.description ?? null)
      .input("icon", sql.VarChar(50), input.iconKey)
      .input("color", sql.VarChar(7), input.color)
      .input("start", sql.Date, input.startDate ?? null)
      .input("end", sql.Date, input.endDate ?? null).query<{
      id: number;
    }>(`INSERT dbo.TM_work_cycles(owner_user_id,title,description,icon_key,color,start_date,end_date,display_order)
        OUTPUT inserted.id
        SELECT @owner,@title,@description,@icon,@color,@start,@end,ISNULL(MAX(display_order),0)+1
        FROM dbo.TM_work_cycles WHERE owner_user_id=@owner AND archived_at_utc IS NULL;`);
    return result.recordset[0]?.id ?? null;
  },

  async addInstances(tx: DatabaseTransaction, owner: number, cycleId: number, kpiIds: number[]) {
    const json = JSON.stringify(kpiIds);
    const result = await tx
      .request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId)
      .input("json", sql.NVarChar(sql.MAX), json).query(`INSERT dbo.TM_kpi_instances(
          owner_user_id,cycle_id,kpi_id,name_snapshot,description_snapshot,icon_key_snapshot,
          color_snapshot,calculation_method_snapshot,period_type_snapshot,measurement_unit_snapshot,
          target_value_snapshot,target_direction_snapshot,deadline_source_snapshot,
          business_day_offset_snapshot,deadline_direction_snapshot,reference_date_label_snapshot,
          numerator_label_snapshot,denominator_label_snapshot,value_label_snapshot,display_order)
        SELECT @owner,@cycleId,kpi.id,kpi.name,kpi.description,kpi.icon_key,kpi.color,
          kpi.calculation_method,kpi.period_type,kpi.measurement_unit,kpi.target_value,
          kpi.target_direction,kpi.deadline_source,kpi.business_day_offset,kpi.deadline_direction,
          kpi.reference_date_label,kpi.numerator_label,kpi.denominator_label,kpi.value_label,
          base.max_order + TRY_CONVERT(INT,requested.[key]) + 1
        FROM OPENJSON(@json) requested
        INNER JOIN dbo.TM_kpis kpi ON kpi.id=TRY_CONVERT(BIGINT,requested.value) AND kpi.owner_user_id=@owner
          AND kpi.archived_at_utc IS NULL AND kpi.is_active=1
        CROSS APPLY(SELECT ISNULL(MAX(display_order),0) max_order FROM dbo.TM_kpi_instances
          WHERE owner_user_id=@owner AND cycle_id=@cycleId) base
        WHERE NOT EXISTS(SELECT 1 FROM dbo.TM_kpi_instances existing
          WHERE existing.cycle_id=@cycleId AND existing.kpi_id=kpi.id);`);
    return result.rowsAffected[0] ?? 0;
  },

  async cycleIsOpen(owner: number, cycleId: number, tx?: DatabaseTransaction) {
    const request = tx ? tx.request() : (await getDatabasePool()).request();
    const result = await request
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId).query<{
      id: number;
    }>(`SELECT TOP(1) id FROM dbo.TM_work_cycles ${tx ? "WITH(UPDLOCK,HOLDLOCK)" : ""}
        WHERE id=@cycleId AND owner_user_id=@owner AND closed_at_utc IS NULL AND archived_at_utc IS NULL;`);
    return Boolean(result.recordset[0]);
  },

  async update(owner: number, cycleId: number, input: UpdateCycleBody) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId)
      .input("title", sql.NVarChar(1000), input.title ?? null)
      .input("description", sql.NVarChar(1500), input.description ?? null)
      .input("hasDescription", sql.Bit, input.description !== undefined)
      .input("icon", sql.VarChar(50), input.iconKey ?? null)
      .input("color", sql.VarChar(7), input.color ?? null)
      .input("start", sql.Date, input.startDate ?? null)
      .input("hasStart", sql.Bit, input.startDate !== undefined)
      .input("end", sql.Date, input.endDate ?? null)
      .input("hasEnd", sql.Bit, input.endDate !== undefined)
      .query(`UPDATE dbo.TM_work_cycles SET title=COALESCE(@title,title),
        description=CASE WHEN @hasDescription=1 THEN @description ELSE description END,
        icon_key=COALESCE(@icon,icon_key),color=COALESCE(@color,color),
        start_date=CASE WHEN @hasStart=1 THEN @start ELSE start_date END,
        end_date=CASE WHEN @hasEnd=1 THEN @end ELSE end_date END,updated_at_utc=SYSUTCDATETIME()
        WHERE id=@cycleId AND owner_user_id=@owner AND closed_at_utc IS NULL AND archived_at_utc IS NULL;`);
    return result.rowsAffected[0] === 1;
  },

  async setClosed(owner: number, cycleId: number, closed: boolean) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId)
      .query(`UPDATE dbo.TM_work_cycles SET closed_at_utc=${closed ? "COALESCE(closed_at_utc,SYSUTCDATETIME())" : "NULL"},updated_at_utc=SYSUTCDATETIME()
        WHERE id=@cycleId AND owner_user_id=@owner AND archived_at_utc IS NULL;`);
    return result.rowsAffected[0] === 1;
  },

  async archive(owner: number, cycleId: number) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId)
      .query(`UPDATE dbo.TM_work_cycles SET archived_at_utc=SYSUTCDATETIME(),updated_at_utc=SYSUTCDATETIME()
        WHERE id=@cycleId AND owner_user_id=@owner AND closed_at_utc IS NOT NULL AND archived_at_utc IS NULL;`);
    return result.rowsAffected[0] === 1;
  },

  async setCurrent(owner: number, cycleId: number) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId).query(`UPDATE settings
        SET current_work_cycle_id=@cycleId,updated_at_utc=SYSUTCDATETIME()
        FROM dbo.TM_user_settings settings
        WHERE settings.portal_user_id=@owner
          AND EXISTS(
            SELECT 1 FROM dbo.TM_work_cycles cycle
            WHERE cycle.id=@cycleId
              AND cycle.owner_user_id=@owner
              AND cycle.closed_at_utc IS NULL
              AND cycle.archived_at_utc IS NULL
          );`);
    return result.rowsAffected[0] === 1;
  },

  async reconcileCurrent(owner: number) {
    const pool = await getDatabasePool();
    const result = await pool.request().input("owner", sql.Int, owner).query<{
      currentCycleId: number | null;
    }>(`
        DECLARE @current BIGINT;
        DECLARE @openCount BIGINT;
        DECLARE @onlyCycle BIGINT;

        SELECT @current=current_work_cycle_id
        FROM dbo.TM_user_settings WITH (UPDLOCK)
        WHERE portal_user_id=@owner;

        IF @current IS NOT NULL
           AND NOT EXISTS(
             SELECT 1 FROM dbo.TM_work_cycles
             WHERE id=@current
               AND owner_user_id=@owner
               AND closed_at_utc IS NULL
               AND archived_at_utc IS NULL
           )
        BEGIN
          UPDATE dbo.TM_user_settings
          SET current_work_cycle_id=NULL,updated_at_utc=SYSUTCDATETIME()
          WHERE portal_user_id=@owner;
          SET @current=NULL;
        END;

        IF @current IS NULL
        BEGIN
          SELECT @openCount=COUNT_BIG(*),@onlyCycle=MIN(id)
          FROM dbo.TM_work_cycles
          WHERE owner_user_id=@owner
            AND closed_at_utc IS NULL
            AND archived_at_utc IS NULL;

          IF @openCount=1
          BEGIN
            UPDATE dbo.TM_user_settings
            SET current_work_cycle_id=@onlyCycle,updated_at_utc=SYSUTCDATETIME()
            WHERE portal_user_id=@owner;
            SET @current=@onlyCycle;
          END;
        END;

        SELECT @current AS currentCycleId;
      `);
    return result.recordset[0]?.currentCycleId ?? null;
  },

  async removeEmptyInstance(owner: number, cycleId: number, instanceId: number) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId)
      .input("instanceId", sql.BigInt, instanceId)
      .query(`DELETE instance FROM dbo.TM_kpi_instances instance
        INNER JOIN dbo.TM_work_cycles cycle ON cycle.id=instance.cycle_id AND cycle.owner_user_id=instance.owner_user_id
        WHERE instance.id=@instanceId AND instance.cycle_id=@cycleId AND instance.owner_user_id=@owner
          AND cycle.closed_at_utc IS NULL AND cycle.archived_at_utc IS NULL
          AND NOT EXISTS(SELECT 1 FROM dbo.TM_tasks WHERE owner_user_id=@owner AND kpi_instance_id=instance.id)
          AND NOT EXISTS(SELECT 1 FROM dbo.TM_kpi_period_results WHERE owner_user_id=@owner AND kpi_instance_id=instance.id);`);
    return result.rowsAffected[0] === 1;
  },

  async reorderCycles(owner: number, ids: number[]) {
    const pool = await getDatabasePool();
    const json = JSON.stringify(ids.map((id, index) => ({ id, order: index + 1 })));
    await pool.request().input("owner", sql.Int, owner).input("json", sql.NVarChar(sql.MAX), json)
      .query(`UPDATE cycle SET display_order=ordered.[order],updated_at_utc=SYSUTCDATETIME()
        FROM dbo.TM_work_cycles cycle INNER JOIN OPENJSON(@json) WITH(id BIGINT '$.id',[order] INT '$.order') ordered ON ordered.id=cycle.id
        WHERE cycle.owner_user_id=@owner AND cycle.archived_at_utc IS NULL;`);
  },

  async reorderInstances(owner: number, cycleId: number, ids: number[]) {
    const pool = await getDatabasePool();
    const json = JSON.stringify(ids.map((id, index) => ({ id, order: index + 1 })));
    await pool
      .request()
      .input("owner", sql.Int, owner)
      .input("cycleId", sql.BigInt, cycleId)
      .input("json", sql.NVarChar(sql.MAX), json)
      .query(`UPDATE instance SET display_order=ordered.[order],updated_at_utc=SYSUTCDATETIME()
        FROM dbo.TM_kpi_instances instance INNER JOIN OPENJSON(@json) WITH(id BIGINT '$.id',[order] INT '$.order') ordered ON ordered.id=instance.id
        INNER JOIN dbo.TM_work_cycles cycle ON cycle.id=instance.cycle_id AND cycle.owner_user_id=instance.owner_user_id
        WHERE instance.owner_user_id=@owner AND instance.cycle_id=@cycleId AND cycle.closed_at_utc IS NULL AND cycle.archived_at_utc IS NULL;`);
  },
};
