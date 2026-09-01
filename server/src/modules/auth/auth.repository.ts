import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { withTransaction } from "../../database/transaction.js";

export interface PortalUserRecord {
  userId: number;
  userCode: string;
  userName: string;
  email: string | null;
  isActive: boolean;
}

export interface AccessProfileRecord {
  roleCode: string;
  isActive: boolean;
  contractsEnabled: boolean;
  meetingOrganizeEnabled?: boolean;
  meetingCoordinateEnabled?: boolean;
  languageCode: string | null;
  theme: string | null;
  sidebarCollapsed: boolean | null;
  calendarShowAdjacentDates: boolean | null;
  timezone: string | null;
  hasDefaultList: boolean;
}

export interface AuthRepository {
  findPortalUserByCode(userCode: string): Promise<PortalUserRecord | null>;
  findAccessProfile(userId: number): Promise<AccessProfileRecord | null>;
  ensureUserFoundation(userId: number): Promise<void>;
}

export async function findPortalUserByCode(userCode: string): Promise<PortalUserRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("userCode", sql.NVarChar(10), userCode)
    .query<PortalUserRecord>(`
      SELECT TOP (1)
        USER_ID AS userId,
        USER_CODE AS userCode,
        USER_NAME AS userName,
        email,
        CAST(IS_ACTIVE AS BIT) AS isActive
      FROM dbo.users
      WHERE USER_CODE = @userCode;
    `);

  return result.recordset[0] ?? null;
}

export async function findAccessProfile(userId: number): Promise<AccessProfileRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("userId", sql.Int, userId).query<AccessProfileRecord>(`
      SELECT
        access.role_code AS roleCode,
        access.is_active AS isActive,
        CAST(access.contracts_enabled AS BIT) AS contractsEnabled,
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
        ) AS meetingCoordinateEnabled,
        settings.language_code AS languageCode,
        settings.theme,
        settings.sidebar_collapsed AS sidebarCollapsed,
        settings.calendar_show_adjacent_dates AS calendarShowAdjacentDates,
        settings.timezone_name AS timezone,
        CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_lists AS list
            WHERE list.owner_user_id = access.portal_user_id
              AND list.is_default = 1
              AND list.archived_at_utc IS NULL
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS hasDefaultList
      FROM dbo.TM_user_access AS access
      LEFT JOIN dbo.TM_user_settings AS settings
        ON settings.portal_user_id = access.portal_user_id
      WHERE access.portal_user_id = @userId;
    `);

  return result.recordset[0] ?? null;
}

export async function ensureUserFoundationInTransaction(
  transaction: DatabaseTransaction,
  userId: number,
): Promise<void> {
  await transaction.request().input("userId", sql.Int, userId).query(`
      IF NOT EXISTS (
        SELECT 1
        FROM dbo.TM_user_settings WITH (UPDLOCK, HOLDLOCK)
        WHERE portal_user_id = @userId
      )
      BEGIN
        INSERT INTO dbo.TM_user_settings (portal_user_id)
        VALUES (@userId);
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM dbo.TM_lists WITH (UPDLOCK, HOLDLOCK)
        WHERE owner_user_id = @userId
          AND is_default = 1
      )
      BEGIN
        INSERT INTO dbo.TM_lists (
          owner_user_id,
          name,
          icon_key,
          color,
          is_default,
          display_order
        )
        VALUES (
          @userId,
          N'My Tasks',
          'list-todo',
          '#2563EB',
          1,
          0
        );
      END;
    `);
}

export async function ensureUserFoundation(userId: number): Promise<void> {
  await withTransaction(async (transaction) => {
    await ensureUserFoundationInTransaction(transaction, userId);
  });
}

export const authRepository: AuthRepository = {
  findPortalUserByCode,
  findAccessProfile,
  ensureUserFoundation,
};
