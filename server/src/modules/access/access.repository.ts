import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { ensureUserFoundationInTransaction } from "../auth/auth.repository.js";
import type { PortalUserRecord } from "../auth/auth.repository.js";
import type { TaskHubRoleCode } from "../auth/auth.types.js";
import type { AccessUserRecord } from "./access.mapper.js";
import type { AccessListQuery, CurrentAccessRecord } from "./access.types.js";

interface AccessUserRecordsPage {
  items: AccessUserRecord[];
  total: number;
}

interface CountRecord {
  total: number;
}

export async function listAccessUsers(query: AccessListQuery): Promise<AccessUserRecordsPage> {
  const pool = await getDatabasePool();
  const offset = (query.page - 1) * query.pageSize;
  const search = query.search?.trim() || null;

  const baseRequest = () =>
    pool
      .request()
      .input("search", sql.NVarChar(100), search)
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
        CAST(COALESCE(access.contracts_enabled, 0) AS BIT) AS contractsEnabled,
        CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_user_permissions AS permission
            WHERE permission.portal_user_id = portal.USER_ID
              AND permission.permission_code = 'MEETING_ORGANIZE'
              AND permission.is_active = 1
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS meetingOrganizeEnabled,
        CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_user_permissions AS permission
            WHERE permission.portal_user_id = portal.USER_ID
              AND permission.permission_code = 'MEETING_COORDINATE'
              AND permission.is_active = 1
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS meetingCoordinateEnabled
      FROM dbo.users AS portal
      LEFT JOIN dbo.TM_user_access AS access
        ON access.portal_user_id = portal.USER_ID
      WHERE portal.IS_ACTIVE = 1
        AND (
          @search IS NULL
          OR portal.USER_CODE LIKE N'%' + @search + N'%'
          OR portal.USER_NAME LIKE N'%' + @search + N'%'
          OR portal.email LIKE N'%' + @search + N'%'
        )
      ORDER BY portal.USER_NAME, portal.USER_ID
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `),
    baseRequest().query<CountRecord>(`
      SELECT COUNT_BIG(1) AS total
      FROM dbo.users AS portal
      WHERE portal.IS_ACTIVE = 1
        AND (
          @search IS NULL
          OR portal.USER_CODE LIKE N'%' + @search + N'%'
          OR portal.USER_NAME LIKE N'%' + @search + N'%'
          OR portal.email LIKE N'%' + @search + N'%'
        );
    `),
  ]);

  return {
    items: itemsResult.recordset,
    total: Number(countResult.recordset[0]?.total ?? 0),
  };
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
        CAST(COALESCE(access.contracts_enabled, 0) AS BIT) AS contractsEnabled,
        CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_user_permissions AS permission
            WHERE permission.portal_user_id = portal.USER_ID
              AND permission.permission_code = 'MEETING_ORGANIZE'
              AND permission.is_active = 1
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS meetingOrganizeEnabled,
        CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_user_permissions AS permission
            WHERE permission.portal_user_id = portal.USER_ID
              AND permission.permission_code = 'MEETING_COORDINATE'
              AND permission.is_active = 1
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS meetingCoordinateEnabled
      FROM dbo.users AS portal
      LEFT JOIN dbo.TM_user_access AS access
        ON access.portal_user_id = portal.USER_ID
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
        is_active AS isActive,
        CAST(contracts_enabled AS BIT) AS contractsEnabled,
        CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_user_permissions AS permission
            WHERE permission.portal_user_id = access.portal_user_id
              AND permission.permission_code = 'MEETING_ORGANIZE'
              AND permission.is_active = 1
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS meetingOrganizeEnabled,
        CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_user_permissions AS permission
            WHERE permission.portal_user_id = access.portal_user_id
              AND permission.permission_code = 'MEETING_COORDINATE'
              AND permission.is_active = 1
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS meetingCoordinateEnabled
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
    WHERE role_code = 'ADMIN'
      AND is_active = 1;
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
    contractsEnabled: boolean;
  },
): Promise<void> {
  const request = transaction
    .request()
    .input("actorUserId", sql.Int, input.actorUserId)
    .input("targetUserId", sql.Int, input.targetUserId)
    .input("roleCode", sql.VarChar(20), input.roleCode)
    .input("isActive", sql.Bit, input.isActive)
    .input("contractsEnabled", sql.Bit, input.contractsEnabled);

  if (input.accessExists) {
    await request.query(`
      UPDATE dbo.TM_user_access
      SET
        role_code = @roleCode,
        is_active = @isActive,
        contracts_enabled = @contractsEnabled,
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
      contracts_enabled,
      granted_by_user_id,
      deactivated_by_user_id,
      deactivated_at_utc
    )
    VALUES (
      @targetUserId,
      @roleCode,
      @isActive,
      @contractsEnabled,
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
    .input("enabled", sql.Bit, input.enabled)
    .query(`
      IF EXISTS (
        SELECT 1
        FROM dbo.TM_meeting_user_permissions WITH (UPDLOCK, HOLDLOCK)
        WHERE portal_user_id = @targetUserId
          AND permission_code = @permissionCode
      )
      BEGIN
        UPDATE dbo.TM_meeting_user_permissions
        SET
          is_active = @enabled,
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
          portal_user_id,
          permission_code,
          is_active,
          granted_by_user_id
        )
        VALUES (
          @targetUserId,
          @permissionCode,
          1,
          @actorUserId
        );
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
         SELECT 1
         FROM dbo.TM_contract_user_settings WITH (UPDLOCK, HOLDLOCK)
         WHERE owner_user_id = @userId
       )
    BEGIN
      INSERT INTO dbo.TM_contract_user_settings (owner_user_id) VALUES (@userId);
    END;
  `);
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
};
