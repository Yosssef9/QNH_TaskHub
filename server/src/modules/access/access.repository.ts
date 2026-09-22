import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { ensureUserFoundationInTransaction } from "../auth/auth.repository.js";
import type { PortalUserRecord } from "../auth/auth.repository.js";
import type { TaskHubRoleCode } from "../auth/auth.types.js";
import type { AccessUserRecord } from "./access.mapper.js";
import type {
  AccessListQuery,
  AccessSortBy,
  CurrentAccessRecord,
  DelegationParticipantRecord,
} from "./access.types.js";

interface AccessUserRecordsPage {
  items: AccessUserRecord[];
  total: number;
}

interface CountRecord {
  total: number;
}

function permissionExistsExpression(
  alias: string,
  moduleCode: "PROCUREMENT" | "KPI_MANAGEMENT",
  entityCode: string | null = null,
): string {
  const entityPredicate =
    entityCode === null ? "" : `\n        AND permission.entity_code = '${entityCode}'`;
  return `EXISTS (
      SELECT 1
      FROM dbo.TM_access_permissions AS permission
      WHERE permission.grantee_user_id = ${alias}.USER_ID
        AND permission.module_code = '${moduleCode}'${entityPredicate}
        AND permission.permission_code = 'ACCESS'
        AND permission.resource_owner_user_id IS NULL
        AND permission.is_active = 1
    )`;
}

function procurementPermissionColumns(alias: string): string {
  const exists = (entity: string) => `
    CAST(CASE WHEN ${permissionExistsExpression(alias, "PROCUREMENT", entity)} THEN 1 ELSE 0 END AS BIT)`;

  return `
    ${exists("CONTRACTS")} AS contractsAccess,
    ${exists("ITEMS")} AS itemsAccess,
    ${exists("SUPPLIERS")} AS suppliersAccess,
    ${exists("PRICE_QUOTES")} AS priceQuotesAccess`;
}

function procurementHasAccessExpression(alias: string): string {
  return `CASE WHEN ${permissionExistsExpression(alias, "PROCUREMENT")} THEN 1 ELSE 0 END`;
}

function kpiWorkCyclesHasAccessExpression(alias: string): string {
  return `CASE WHEN ${permissionExistsExpression(alias, "KPI_MANAGEMENT", "KPI_WORK_CYCLES")} THEN 1 ELSE 0 END`;
}

function kpiWorkCyclesPermissionColumn(alias: string): string {
  return `
    CAST(${kpiWorkCyclesHasAccessExpression(alias)} AS BIT) AS kpiWorkCyclesAccess`;
}

function meetingPermissionExistsExpression(
  alias: string,
  permissionCode: "MEETING_ORGANIZE" | "MEETING_COORDINATE",
): string {
  return `EXISTS (
      SELECT 1 FROM dbo.TM_meeting_user_permissions AS permission
      WHERE permission.portal_user_id = ${alias}.USER_ID
        AND permission.permission_code = '${permissionCode}'
        AND permission.is_active = 1
    )`;
}

function meetingPermissionColumns(alias: string): string {
  return `
    CAST(CASE WHEN ${meetingPermissionExistsExpression(alias, "MEETING_ORGANIZE")} THEN 1 ELSE 0 END AS BIT) AS meetingOrganizeEnabled,
    CAST(CASE WHEN ${meetingPermissionExistsExpression(alias, "MEETING_COORDINATE")} THEN 1 ELSE 0 END AS BIT) AS meetingCoordinateEnabled`;
}

function accessFilterClause(alias: string, accessAlias: string): string {
  const procurementAccess = procurementHasAccessExpression(alias);
  const kpiWorkCyclesAccess = kpiWorkCyclesHasAccessExpression(alias);
  const organizer = meetingPermissionExistsExpression(alias, "MEETING_ORGANIZE");
  const coordinator = meetingPermissionExistsExpression(alias, "MEETING_COORDINATE");

  return `
    AND (
      @roleFilter = 'ALL'
      OR (@roleFilter = 'UNASSIGNED' AND ${accessAlias}.portal_user_id IS NULL)
      OR (@roleFilter IN ('USER', 'ADMIN') AND ${accessAlias}.role_code = @roleFilter)
    )
    AND (
      @statusFilter = 'ALL'
      OR (@statusFilter = 'UNASSIGNED' AND ${accessAlias}.portal_user_id IS NULL)
      OR (@statusFilter = 'ACTIVE' AND ${accessAlias}.portal_user_id IS NOT NULL AND ${accessAlias}.is_active = 1)
      OR (@statusFilter = 'INACTIVE' AND ${accessAlias}.portal_user_id IS NOT NULL AND ${accessAlias}.is_active = 0)
    )
    AND (
      @procurementFilter = 'ALL'
      OR (@procurementFilter = 'WITH_ACCESS' AND (${procurementAccess}) = 1)
      OR (@procurementFilter = 'WITHOUT_ACCESS' AND (${procurementAccess}) = 0)
    )
    AND (
      @kpiWorkCyclesFilter = 'ALL'
      OR (@kpiWorkCyclesFilter = 'WITH_ACCESS' AND (${kpiWorkCyclesAccess}) = 1)
      OR (@kpiWorkCyclesFilter = 'WITHOUT_ACCESS' AND (${kpiWorkCyclesAccess}) = 0)
    )
    AND (
      @meetingFilter = 'ALL'
      OR (@meetingFilter = 'ORGANIZER' AND ${organizer} AND NOT ${coordinator})
      OR (@meetingFilter = 'COORDINATOR' AND ${coordinator} AND NOT ${organizer})
      OR (@meetingFilter = 'BOTH' AND ${organizer} AND ${coordinator})
      OR (@meetingFilter = 'NONE' AND NOT ${organizer} AND NOT ${coordinator})
    )`;
}

function accessSortExpression(sortBy: AccessSortBy, alias: string, accessAlias: string): string {
  switch (sortBy) {
    case "userCode":
      return `${alias}.USER_CODE`;
    case "role":
      return `CASE WHEN ${accessAlias}.role_code IS NULL THEN 0 WHEN ${accessAlias}.role_code = 'USER' THEN 1 WHEN ${accessAlias}.role_code = 'ADMIN' THEN 2 ELSE 3 END`;
    case "procurement":
      return procurementHasAccessExpression(alias);
    case "kpiWorkCycles":
      return kpiWorkCyclesHasAccessExpression(alias);
    case "meetings":
      return `(
        CASE WHEN ${meetingPermissionExistsExpression(alias, "MEETING_ORGANIZE")} THEN 1 ELSE 0 END
        + CASE WHEN ${meetingPermissionExistsExpression(alias, "MEETING_COORDINATE")} THEN 2 ELSE 0 END
      )`;
    case "status":
      return `CASE WHEN ${accessAlias}.portal_user_id IS NULL THEN 0 WHEN ${accessAlias}.is_active = 0 THEN 1 ELSE 2 END`;
    case "userName":
    default:
      return `${alias}.USER_NAME`;
  }
}

export async function listAccessUsers(query: AccessListQuery): Promise<AccessUserRecordsPage> {
  const pool = await getDatabasePool();
  const offset = (query.page - 1) * query.pageSize;
  const search = query.search?.trim() || null;
  const filters = accessFilterClause("portal", "access");
  const sortExpression = accessSortExpression(query.sortBy, "portal", "access");
  const sortDirection = query.sortDirection === "desc" ? "DESC" : "ASC";

  const baseRequest = () =>
    pool
      .request()
      .input("search", sql.NVarChar(100), search)
      .input("roleFilter", sql.VarChar(20), query.role)
      .input("statusFilter", sql.VarChar(20), query.status)
      .input("procurementFilter", sql.VarChar(20), query.procurement)
      .input("kpiWorkCyclesFilter", sql.VarChar(20), query.kpiWorkCycles)
      .input("meetingFilter", sql.VarChar(20), query.meetings)
      .input("offset", sql.Int, offset)
      .input("pageSize", sql.Int, query.pageSize);

  const [itemsResult, countResult] = await Promise.all([
    baseRequest().query<AccessUserRecord>(`
      SELECT
        portal.USER_ID AS userId,
        portal.USER_CODE AS userCode,
        portal.USER_NAME AS userName,
        portal.email,
        CAST(portal.IS_ACTIVE AS BIT) AS portalIsActive,
        access.role_code AS roleCode,
        access.is_active AS accessIsActive,
        ${procurementPermissionColumns("portal")},
        ${kpiWorkCyclesPermissionColumn("portal")},
        ${meetingPermissionColumns("portal")}
      FROM dbo.users AS portal
      LEFT JOIN dbo.TM_user_access AS access ON access.portal_user_id = portal.USER_ID
      WHERE portal.IS_ACTIVE = 1
        AND (
          @search IS NULL
          OR portal.USER_CODE LIKE N'%' + @search + N'%'
          OR portal.USER_NAME LIKE N'%' + @search + N'%'
          OR portal.email LIKE N'%' + @search + N'%'
        )
        ${filters}
    ORDER BY ${sortExpression} ${sortDirection},
         CASE WHEN ${sortExpression} = portal.USER_NAME THEN NULL ELSE portal.USER_NAME END ASC,
         portal.USER_ID ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `),
    baseRequest().query<CountRecord>(`
      SELECT COUNT_BIG(1) AS total
      FROM dbo.users AS portal
      LEFT JOIN dbo.TM_user_access AS access ON access.portal_user_id = portal.USER_ID
      WHERE portal.IS_ACTIVE = 1
        AND (
          @search IS NULL
          OR portal.USER_CODE LIKE N'%' + @search + N'%'
          OR portal.USER_NAME LIKE N'%' + @search + N'%'
          OR portal.email LIKE N'%' + @search + N'%'
        )
        ${filters};
    `),
  ]);

  return { items: itemsResult.recordset, total: Number(countResult.recordset[0]?.total ?? 0) };
}

export async function findAccessUserById(userId: number): Promise<AccessUserRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("userId", sql.Int, userId).query<AccessUserRecord>(`
    SELECT TOP (1)
      portal.USER_ID AS userId,
      portal.USER_CODE AS userCode,
      portal.USER_NAME AS userName,
      portal.email,
      CAST(portal.IS_ACTIVE AS BIT) AS portalIsActive,
      access.role_code AS roleCode,
      access.is_active AS accessIsActive,
      ${procurementPermissionColumns("portal")},
      ${kpiWorkCyclesPermissionColumn("portal")},
      ${meetingPermissionColumns("portal")}
    FROM dbo.users AS portal
    LEFT JOIN dbo.TM_user_access AS access ON access.portal_user_id = portal.USER_ID
    WHERE portal.USER_ID = @userId;
  `);
  return result.recordset[0] ?? null;
}

export async function findPortalUserForUpdate(
  transaction: DatabaseTransaction,
  userId: number,
): Promise<PortalUserRecord | null> {
  const result = await transaction.request().input("userId", sql.Int, userId)
    .query<PortalUserRecord>(`
    SELECT TOP (1)
      USER_ID AS userId,
      USER_CODE AS userCode,
      USER_NAME AS userName,
      email,
      CAST(IS_ACTIVE AS BIT) AS isActive
    FROM dbo.users WITH (UPDLOCK, HOLDLOCK)
    WHERE USER_ID = @userId;
  `);
  return result.recordset[0] ?? null;
}

export async function findCurrentAccessForUpdate(
  transaction: DatabaseTransaction,
  userId: number,
): Promise<CurrentAccessRecord | null> {
  const result = await transaction.request().input("userId", sql.Int, userId)
    .query<CurrentAccessRecord>(`
    SELECT
      role_code AS roleCode,
      CAST(is_active AS BIT) AS isActive,
      CAST(CASE WHEN EXISTS (
        SELECT 1 FROM dbo.TM_meeting_user_permissions AS permission
        WHERE permission.portal_user_id = access.portal_user_id
          AND permission.permission_code = 'MEETING_ORGANIZE'
          AND permission.is_active = 1
      ) THEN 1 ELSE 0 END AS BIT) AS meetingOrganizeEnabled,
      CAST(CASE WHEN EXISTS (
        SELECT 1 FROM dbo.TM_meeting_user_permissions AS permission
        WHERE permission.portal_user_id = access.portal_user_id
          AND permission.permission_code = 'MEETING_COORDINATE'
          AND permission.is_active = 1
      ) THEN 1 ELSE 0 END AS BIT) AS meetingCoordinateEnabled
    FROM dbo.TM_user_access AS access WITH (UPDLOCK, HOLDLOCK)
    WHERE access.portal_user_id = @userId;
  `);
  return result.recordset[0] ?? null;
}

export async function countActiveAdminsForUpdate(
  transaction: DatabaseTransaction,
): Promise<number> {
  const result = await transaction.request().query<CountRecord>(`
    SELECT COUNT_BIG(1) AS total
    FROM dbo.TM_user_access WITH (UPDLOCK, HOLDLOCK)
    WHERE role_code = 'ADMIN' AND is_active = 1;
  `);
  return Number(result.recordset[0]?.total ?? 0);
}

export async function saveAccess(
  transaction: DatabaseTransaction,
  input: {
    actorUserId: number;
    targetUserId: number;
    roleCode: TaskHubRoleCode;
    isActive: boolean;
    accessExists: boolean;
  },
): Promise<void> {
  const request = transaction
    .request()
    .input("actorUserId", sql.Int, input.actorUserId)
    .input("targetUserId", sql.Int, input.targetUserId)
    .input("roleCode", sql.VarChar(20), input.roleCode)
    .input("isActive", sql.Bit, input.isActive);

  if (input.accessExists) {
    await request.query(`
      UPDATE dbo.TM_user_access
      SET role_code = @roleCode,
          is_active = @isActive,
          deactivated_by_user_id = CASE WHEN @isActive = 0 THEN @actorUserId ELSE NULL END,
          deactivated_at_utc = CASE WHEN @isActive = 0 THEN SYSUTCDATETIME() ELSE NULL END,
          updated_at_utc = SYSUTCDATETIME()
      WHERE portal_user_id = @targetUserId;
    `);
    return;
  }

  await request.query(`
    INSERT INTO dbo.TM_user_access (
      portal_user_id,
      role_code,
      is_active,
      granted_by_user_id,
      deactivated_by_user_id,
      deactivated_at_utc
    )
    VALUES (
      @targetUserId,
      @roleCode,
      @isActive,
      @actorUserId,
      CASE WHEN @isActive = 0 THEN @actorUserId ELSE NULL END,
      CASE WHEN @isActive = 0 THEN SYSUTCDATETIME() ELSE NULL END
    );
  `);
}

async function saveMeetingPermission(
  transaction: DatabaseTransaction,
  input: {
    actorUserId: number;
    targetUserId: number;
    permissionCode: "MEETING_ORGANIZE" | "MEETING_COORDINATE";
    enabled: boolean;
  },
): Promise<void> {
  await transaction
    .request()
    .input("actorUserId", sql.Int, input.actorUserId)
    .input("targetUserId", sql.Int, input.targetUserId)
    .input("permissionCode", sql.VarChar(40), input.permissionCode)
    .input("enabled", sql.Bit, input.enabled).query(`
      IF EXISTS (
        SELECT 1 FROM dbo.TM_meeting_user_permissions WITH (UPDLOCK, HOLDLOCK)
        WHERE portal_user_id = @targetUserId AND permission_code = @permissionCode
      )
      BEGIN
        UPDATE dbo.TM_meeting_user_permissions
        SET is_active = @enabled,
            granted_by_user_id = CASE WHEN @enabled = 1 THEN @actorUserId ELSE granted_by_user_id END,
            granted_at_utc = CASE WHEN @enabled = 1 THEN SYSUTCDATETIME() ELSE granted_at_utc END,
            revoked_by_user_id = CASE WHEN @enabled = 0 THEN @actorUserId ELSE NULL END,
            revoked_at_utc = CASE WHEN @enabled = 0 THEN SYSUTCDATETIME() ELSE NULL END
        WHERE portal_user_id = @targetUserId
          AND permission_code = @permissionCode
          AND is_active <> @enabled;
      END
      ELSE IF @enabled = 1
      BEGIN
        INSERT INTO dbo.TM_meeting_user_permissions (
          portal_user_id, permission_code, is_active, granted_by_user_id
        ) VALUES (@targetUserId, @permissionCode, 1, @actorUserId);
      END;
    `);
}

export async function saveMeetingPermissions(
  transaction: DatabaseTransaction,
  input: {
    actorUserId: number;
    targetUserId: number;
    meetingOrganizeEnabled: boolean;
    meetingCoordinateEnabled: boolean;
  },
): Promise<void> {
  await saveMeetingPermission(transaction, {
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    permissionCode: "MEETING_ORGANIZE",
    enabled: input.meetingOrganizeEnabled,
  });
  await saveMeetingPermission(transaction, {
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    permissionCode: "MEETING_COORDINATE",
    enabled: input.meetingCoordinateEnabled,
  });
}

export async function ensureContractSettingsInTransaction(
  transaction: DatabaseTransaction,
  userId: number,
): Promise<void> {
  await transaction.request().input("userId", sql.Int, userId).query(`
    IF OBJECT_ID(N'dbo.TM_contract_user_settings', N'U') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM dbo.TM_contract_user_settings WITH (UPDLOCK, HOLDLOCK)
         WHERE owner_user_id = @userId
       )
    BEGIN
      INSERT INTO dbo.TM_contract_user_settings (owner_user_id) VALUES (@userId);
    END;
  `);
}

export async function findDelegationParticipantForUpdate(
  transaction: DatabaseTransaction,
  userId: number,
): Promise<DelegationParticipantRecord | null> {
  const result = await transaction.request().input("userId", sql.Int, userId)
    .query<DelegationParticipantRecord>(`
    SELECT TOP (1)
      portal.USER_ID AS userId,
      CAST(CASE WHEN EXISTS (
        SELECT 1 FROM dbo.TM_access_permissions AS permission
        WHERE permission.grantee_user_id = portal.USER_ID
          AND permission.module_code = 'PROCUREMENT'
          AND permission.entity_code = 'CONTRACTS'
          AND permission.permission_code = 'ACCESS'
          AND permission.resource_owner_user_id IS NULL
          AND permission.is_active = 1
      ) THEN 1 ELSE 0 END AS BIT) AS contractsAccess
    FROM dbo.users AS portal WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.TM_user_access AS access WITH (UPDLOCK, HOLDLOCK)
      ON access.portal_user_id = portal.USER_ID
    WHERE portal.USER_ID = @userId
      AND portal.IS_ACTIVE = 1
      AND access.is_active = 1;
  `);
  return result.recordset[0] ?? null;
}

export const accessRepository = {
  listAccessUsers,
  findAccessUserById,
  findPortalUserForUpdate,
  findCurrentAccessForUpdate,
  countActiveAdminsForUpdate,
  saveAccess,
  saveMeetingPermissions,
  ensureUserFoundationInTransaction,
  ensureContractSettingsInTransaction,
  findDelegationParticipantForUpdate,
};
