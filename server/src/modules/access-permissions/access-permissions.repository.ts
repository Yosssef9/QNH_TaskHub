import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import type {
  AccessPermission,
  ContractAccessAdminData,
  ContractAccessAdminUser,
  ContractAccessDelegation,
  ContractAccessScope,
  ProcurementAccessState,
  ProcurementEntityCode,
} from "./access-permissions.types.js";

interface AccessPermissionRecord {
  moduleCode: string;
  entityCode: string;
  permissionCode: string;
  resourceOwnerUserId: number | null;
}

interface ContractScopeRecord {
  ownerUserId: number;
  ownerUserCode: string;
  ownerUserName: string;
  isOwn: boolean;
  canManageAttachments: boolean;
}

interface ContractAccessAdminUserRecord {
  userId: number;
  userCode: string;
  userName: string;
  contractsAccess: boolean;
}

interface ContractAccessDelegationRecord {
  granteeUserId: number;
  granteeUserCode: string;
  granteeUserName: string;
  ownerUserId: number;
  ownerUserCode: string;
  ownerUserName: string;
  view: boolean;
  manageAttachments: boolean;
}

function mapPermission(record: AccessPermissionRecord): AccessPermission {
  if (
    record.moduleCode !== "PROCUREMENT" ||
    !["CONTRACTS", "ITEMS", "SUPPLIERS", "PRICE_QUOTES"].includes(record.entityCode) ||
    !["ACCESS", "VIEW", "MANAGE_ATTACHMENTS"].includes(record.permissionCode)
  ) {
    throw new Error("TaskHub access permission contains an unsupported code combination.");
  }

  return {
    moduleCode: "PROCUREMENT",
    entityCode: record.entityCode as AccessPermission["entityCode"],
    permissionCode: record.permissionCode as AccessPermission["permissionCode"],
    resourceOwnerUserId:
      record.resourceOwnerUserId === null ? null : Number(record.resourceOwnerUserId),
  };
}

export async function listUserPermissions(userId: number): Promise<AccessPermission[]> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("userId", sql.Int, userId).query<AccessPermissionRecord>(`
    SELECT
      module_code AS moduleCode,
      entity_code AS entityCode,
      permission_code AS permissionCode,
      resource_owner_user_id AS resourceOwnerUserId
    FROM dbo.TM_access_permissions
    WHERE grantee_user_id = @userId
      AND is_active = 1
    ORDER BY module_code, entity_code, permission_code, resource_owner_user_id;
  `);

  return result.recordset.map(mapPermission);
}

async function setPermission(
  transaction: DatabaseTransaction,
  input: {
    actorUserId: number;
    granteeUserId: number;
    entityCode: ProcurementEntityCode;
    permissionCode: "ACCESS" | "VIEW" | "MANAGE_ATTACHMENTS";
    resourceOwnerUserId: number | null;
    enabled: boolean;
  },
): Promise<void> {
  await transaction
    .request()
    .input("actorUserId", sql.Int, input.actorUserId)
    .input("granteeUserId", sql.Int, input.granteeUserId)
    .input("entityCode", sql.VarChar(40), input.entityCode)
    .input("permissionCode", sql.VarChar(40), input.permissionCode)
    .input("resourceOwnerUserId", sql.Int, input.resourceOwnerUserId)
    .input("enabled", sql.Bit, input.enabled)
    .query(`
      IF EXISTS (
        SELECT 1
        FROM dbo.TM_access_permissions WITH (UPDLOCK, HOLDLOCK)
        WHERE grantee_user_id = @granteeUserId
          AND module_code = 'PROCUREMENT'
          AND entity_code = @entityCode
          AND permission_code = @permissionCode
          AND (
            (resource_owner_user_id IS NULL AND @resourceOwnerUserId IS NULL)
            OR resource_owner_user_id = @resourceOwnerUserId
          )
      )
      BEGIN
        UPDATE dbo.TM_access_permissions
        SET
          is_active = @enabled,
          granted_by_user_id = CASE WHEN @enabled = 1 THEN @actorUserId ELSE granted_by_user_id END,
          granted_at_utc = CASE WHEN @enabled = 1 THEN SYSUTCDATETIME() ELSE granted_at_utc END,
          revoked_by_user_id = CASE WHEN @enabled = 0 THEN @actorUserId ELSE NULL END,
          revoked_at_utc = CASE WHEN @enabled = 0 THEN SYSUTCDATETIME() ELSE NULL END,
          updated_at_utc = SYSUTCDATETIME()
        WHERE grantee_user_id = @granteeUserId
          AND module_code = 'PROCUREMENT'
          AND entity_code = @entityCode
          AND permission_code = @permissionCode
          AND (
            (resource_owner_user_id IS NULL AND @resourceOwnerUserId IS NULL)
            OR resource_owner_user_id = @resourceOwnerUserId
          )
          AND is_active <> @enabled;
      END
      ELSE IF @enabled = 1
      BEGIN
        INSERT INTO dbo.TM_access_permissions (
          grantee_user_id,
          module_code,
          entity_code,
          permission_code,
          resource_owner_user_id,
          is_active,
          granted_by_user_id
        )
        VALUES (
          @granteeUserId,
          'PROCUREMENT',
          @entityCode,
          @permissionCode,
          @resourceOwnerUserId,
          1,
          @actorUserId
        );
      END;
    `);
}

export async function saveProcurementAccess(
  transaction: DatabaseTransaction,
  input: {
    actorUserId: number;
    granteeUserId: number;
    access: ProcurementAccessState;
  },
): Promise<void> {
  const entries: Array<[ProcurementEntityCode, boolean]> = [
    ["CONTRACTS", input.access.contracts],
    ["ITEMS", input.access.items],
    ["SUPPLIERS", input.access.suppliers],
    ["PRICE_QUOTES", input.access.priceQuotes],
  ];

  for (const [entityCode, enabled] of entries) {
    await setPermission(transaction, {
      actorUserId: input.actorUserId,
      granteeUserId: input.granteeUserId,
      entityCode,
      permissionCode: "ACCESS",
      resourceOwnerUserId: null,
      enabled,
    });
  }

  if (!input.access.contracts) {
    await transaction
      .request()
      .input("actorUserId", sql.Int, input.actorUserId)
      .input("targetUserId", sql.Int, input.granteeUserId)
      .query(`
        UPDATE dbo.TM_access_permissions
        SET
          is_active = 0,
          revoked_by_user_id = @actorUserId,
          revoked_at_utc = SYSUTCDATETIME(),
          updated_at_utc = SYSUTCDATETIME()
        WHERE module_code = 'PROCUREMENT'
          AND entity_code = 'CONTRACTS'
          AND permission_code IN ('VIEW', 'MANAGE_ATTACHMENTS')
          AND is_active = 1
          AND (
            grantee_user_id = @targetUserId
            OR resource_owner_user_id = @targetUserId
          );
      `);
  }
}

export async function listContractAccessScopes(userId: number): Promise<ContractAccessScope[]> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("userId", sql.Int, userId).query<ContractScopeRecord>(`
    SELECT
      owner.USER_ID AS ownerUserId,
      owner.USER_CODE AS ownerUserCode,
      owner.USER_NAME AS ownerUserName,
      CAST(CASE WHEN owner.USER_ID = @userId THEN 1 ELSE 0 END AS BIT) AS isOwn,
      CAST(
        CASE
          WHEN owner.USER_ID = @userId THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_access_permissions AS manage_permission
            WHERE manage_permission.grantee_user_id = @userId
              AND manage_permission.module_code = 'PROCUREMENT'
              AND manage_permission.entity_code = 'CONTRACTS'
              AND manage_permission.permission_code = 'MANAGE_ATTACHMENTS'
              AND manage_permission.resource_owner_user_id = owner.USER_ID
              AND manage_permission.is_active = 1
          ) THEN 1 ELSE 0
        END
        AS BIT
      ) AS canManageAttachments
    FROM dbo.users AS owner
    WHERE owner.IS_ACTIVE = 1
      AND (
        owner.USER_ID = @userId
        OR EXISTS (
          SELECT 1
          FROM dbo.TM_access_permissions AS view_permission
          WHERE view_permission.grantee_user_id = @userId
            AND view_permission.module_code = 'PROCUREMENT'
            AND view_permission.entity_code = 'CONTRACTS'
            AND view_permission.permission_code = 'VIEW'
            AND view_permission.resource_owner_user_id = owner.USER_ID
            AND view_permission.is_active = 1
        )
      )
    ORDER BY CASE WHEN owner.USER_ID = @userId THEN 0 ELSE 1 END, owner.USER_NAME, owner.USER_ID;
  `);

  return result.recordset.map((record) => ({
    ownerUserId: Number(record.ownerUserId),
    ownerUserCode: record.ownerUserCode,
    ownerUserName: record.ownerUserName,
    isOwn: record.isOwn,
    canManageAttachments: record.canManageAttachments,
  }));
}

export async function getContractAccessAdminData(): Promise<ContractAccessAdminData> {
  const pool = await getDatabasePool();
  const [usersResult, delegationsResult] = await Promise.all([
    pool.request().query<ContractAccessAdminUserRecord>(`
      SELECT
        portal.USER_ID AS userId,
        portal.USER_CODE AS userCode,
        portal.USER_NAME AS userName,
        CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_access_permissions AS permission
            WHERE permission.grantee_user_id = portal.USER_ID
              AND permission.module_code = 'PROCUREMENT'
              AND permission.entity_code = 'CONTRACTS'
              AND permission.permission_code = 'ACCESS'
              AND permission.resource_owner_user_id IS NULL
              AND permission.is_active = 1
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS contractsAccess
      FROM dbo.users AS portal
      INNER JOIN dbo.TM_user_access AS access
        ON access.portal_user_id = portal.USER_ID
       AND access.is_active = 1
      WHERE portal.IS_ACTIVE = 1
      ORDER BY portal.USER_NAME, portal.USER_ID;
    `),
    pool.request().query<ContractAccessDelegationRecord>(`
      SELECT
        grantee.USER_ID AS granteeUserId,
        grantee.USER_CODE AS granteeUserCode,
        grantee.USER_NAME AS granteeUserName,
        owner.USER_ID AS ownerUserId,
        owner.USER_CODE AS ownerUserCode,
        owner.USER_NAME AS ownerUserName,
        CAST(MAX(CASE WHEN permission.permission_code = 'VIEW' AND permission.is_active = 1 THEN 1 ELSE 0 END) AS BIT) AS view,
        CAST(MAX(CASE WHEN permission.permission_code = 'MANAGE_ATTACHMENTS' AND permission.is_active = 1 THEN 1 ELSE 0 END) AS BIT) AS manageAttachments
      FROM dbo.TM_access_permissions AS permission
      INNER JOIN dbo.users AS grantee ON grantee.USER_ID = permission.grantee_user_id
      INNER JOIN dbo.users AS owner ON owner.USER_ID = permission.resource_owner_user_id
      WHERE permission.module_code = 'PROCUREMENT'
        AND permission.entity_code = 'CONTRACTS'
        AND permission.permission_code IN ('VIEW', 'MANAGE_ATTACHMENTS')
        AND permission.resource_owner_user_id IS NOT NULL
      GROUP BY
        grantee.USER_ID,
        grantee.USER_CODE,
        grantee.USER_NAME,
        owner.USER_ID,
        owner.USER_CODE,
        owner.USER_NAME
      HAVING MAX(CASE WHEN permission.permission_code = 'VIEW' AND permission.is_active = 1 THEN 1 ELSE 0 END) = 1
      ORDER BY grantee.USER_NAME, owner.USER_NAME;
    `),
  ]);

  return {
    users: usersResult.recordset.map((record): ContractAccessAdminUser => ({
      userId: Number(record.userId),
      userCode: record.userCode,
      userName: record.userName,
      contractsAccess: record.contractsAccess,
    })),
    delegations: delegationsResult.recordset.map((record): ContractAccessDelegation => ({
      granteeUserId: Number(record.granteeUserId),
      granteeUserCode: record.granteeUserCode,
      granteeUserName: record.granteeUserName,
      ownerUserId: Number(record.ownerUserId),
      ownerUserCode: record.ownerUserCode,
      ownerUserName: record.ownerUserName,
      view: record.view,
      manageAttachments: record.manageAttachments,
    })),
  };
}

export async function saveContractDelegation(
  transaction: DatabaseTransaction,
  input: {
    actorUserId: number;
    granteeUserId: number;
    ownerUserId: number;
    view: boolean;
    manageAttachments: boolean;
  },
): Promise<void> {
  if (input.view) {
    await setPermission(transaction, {
      actorUserId: input.actorUserId,
      granteeUserId: input.granteeUserId,
      entityCode: "CONTRACTS",
      permissionCode: "ACCESS",
      resourceOwnerUserId: null,
      enabled: true,
    });
  }

  await setPermission(transaction, {
    actorUserId: input.actorUserId,
    granteeUserId: input.granteeUserId,
    entityCode: "CONTRACTS",
    permissionCode: "VIEW",
    resourceOwnerUserId: input.ownerUserId,
    enabled: input.view,
  });
  await setPermission(transaction, {
    actorUserId: input.actorUserId,
    granteeUserId: input.granteeUserId,
    entityCode: "CONTRACTS",
    permissionCode: "MANAGE_ATTACHMENTS",
    resourceOwnerUserId: input.ownerUserId,
    enabled: input.view && input.manageAttachments,
  });
}

export const accessPermissionsRepository = {
  listUserPermissions,
  saveProcurementAccess,
  listContractAccessScopes,
  getContractAccessAdminData,
  saveContractDelegation,
};
