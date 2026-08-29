import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { withTransaction } from "../../database/transaction.js";
import type { EmailPreferenceEvent } from "./email-settings.types.js";

export interface EmailSettingsRecord {
  userName: string;
  languageCode: "AR" | "EN";
  portalEmail: string | null;
  notificationsEnabled: boolean;
  alternateEmail: string | null;
  alternateEmailNormalized: string | null;
  alternateVerifiedAtUtc: Date | null;
  activeEmailSource: "PORTAL" | "ALTERNATE";
  pendingEmail: string | null;
  pendingEmailNormalized: string | null;
  verificationExpiresAtUtc: Date | null;
  resendAvailableAtUtc: Date | null;
  verificationAttemptCount: number;
}

export interface EmailPreferenceRecord {
  eventType: EmailPreferenceEvent;
  enabled: boolean;
}

interface PrepareVerificationRecord {
  status: "READY" | "COOLDOWN" | "RATE_LIMITED";
  expiresAtUtc: Date | null;
  resendAvailableAtUtc: Date | null;
  retryAtUtc: Date | null;
}

interface VerifyCodeRecord {
  status: "VERIFIED" | "INVALID" | "EXPIRED" | "NO_REQUEST" | "LOCKED" | "CONFLICT";
  attemptsRemaining: number;
}

async function ensureEmailSettingsRow(
  transaction: DatabaseTransaction,
  ownerUserId: number,
): Promise<void> {
  await transaction.request().input("owner", sql.Int, ownerUserId).query(`
    IF NOT EXISTS (
      SELECT 1
      FROM dbo.TM_user_email_settings WITH (UPDLOCK, HOLDLOCK)
      WHERE owner_user_id = @owner
    )
    BEGIN
      INSERT dbo.TM_user_email_settings (owner_user_id)
      VALUES (@owner);
    END;
  `);
}

export const emailSettingsRepository = {
  async getSettings(ownerUserId: number): Promise<EmailSettingsRecord | null> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("owner", sql.Int, ownerUserId).query<EmailSettingsRecord>(`
      SELECT TOP (1)
        portal.USER_NAME AS userName,
        settings.language_code AS languageCode,
        NULLIF(LTRIM(RTRIM(portal.email)), N'') AS portalEmail,
        CAST(settings.email_notifications_enabled AS BIT) AS notificationsEnabled,
        email_settings.alternate_email AS alternateEmail,
        email_settings.alternate_email_normalized AS alternateEmailNormalized,
        email_settings.alternate_email_verified_at_utc AS alternateVerifiedAtUtc,
        COALESCE(email_settings.active_email_source, 'PORTAL') AS activeEmailSource,
        verification.pending_email AS pendingEmail,
        verification.pending_email_normalized AS pendingEmailNormalized,
        verification.expires_at_utc AS verificationExpiresAtUtc,
        verification.resend_available_at_utc AS resendAvailableAtUtc,
        COALESCE(verification.attempt_count, 0) AS verificationAttemptCount
      FROM dbo.users AS portal
      INNER JOIN dbo.TM_user_settings AS settings
        ON settings.portal_user_id = portal.USER_ID
      LEFT JOIN dbo.TM_user_email_settings AS email_settings
        ON email_settings.owner_user_id = portal.USER_ID
      LEFT JOIN dbo.TM_email_verifications AS verification
        ON verification.owner_user_id = portal.USER_ID
      WHERE portal.USER_ID = @owner;
    `);

    return result.recordset[0] ?? null;
  },

  async listPreferences(ownerUserId: number): Promise<EmailPreferenceRecord[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("owner", sql.Int, ownerUserId).query<EmailPreferenceRecord>(`
      SELECT event_type AS eventType, CAST(is_enabled AS BIT) AS enabled
      FROM dbo.TM_email_preferences
      WHERE owner_user_id = @owner;
    `);
    return result.recordset;
  },

  async updateSettings(
    ownerUserId: number,
    input: {
      notificationsEnabled?: boolean;
      activeEmailSource?: "PORTAL" | "ALTERNATE";
      preferences?: { eventType: EmailPreferenceEvent; enabled: boolean }[];
    },
  ): Promise<void> {
    await withTransaction(async (transaction) => {
      await ensureEmailSettingsRow(transaction, ownerUserId);

      if (input.notificationsEnabled !== undefined) {
        await transaction
          .request()
          .input("owner", sql.Int, ownerUserId)
          .input("enabled", sql.Bit, input.notificationsEnabled).query(`
            UPDATE dbo.TM_user_settings
            SET email_notifications_enabled = @enabled,
                updated_at_utc = SYSUTCDATETIME()
            WHERE portal_user_id = @owner;
          `);
      }

      if (input.activeEmailSource !== undefined) {
        await transaction
          .request()
          .input("owner", sql.Int, ownerUserId)
          .input("source", sql.VarChar(12), input.activeEmailSource).query(`
            UPDATE dbo.TM_user_email_settings
            SET active_email_source = @source,
                updated_at_utc = SYSUTCDATETIME()
            WHERE owner_user_id = @owner;
          `);
      }

      for (const preference of input.preferences ?? []) {
        const request = transaction
          .request()
          .input("owner", sql.Int, ownerUserId)
          .input("eventType", sql.VarChar(50), preference.eventType)
          .input("enabled", sql.Bit, preference.enabled);

        await request.query(`
          UPDATE dbo.TM_email_preferences
          SET is_enabled = @enabled,
              updated_at_utc = SYSUTCDATETIME()
          WHERE owner_user_id = @owner
            AND event_type = @eventType;

          IF @@ROWCOUNT = 0
          BEGIN
            INSERT dbo.TM_email_preferences (owner_user_id, event_type, is_enabled)
            VALUES (@owner, @eventType, @enabled);
          END;
        `);
      }
    });
  },

  async isEmailUnavailableForOwner(
    ownerUserId: number,
    normalizedEmail: string,
  ): Promise<boolean> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, ownerUserId)
      .input("email", sql.NVarChar(320), normalizedEmail).query<{ unavailable: boolean }>(`
        SELECT CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.users AS portal
            WHERE portal.USER_ID <> @owner
              AND LOWER(LTRIM(RTRIM(portal.email))) = @email
          ) OR EXISTS (
            SELECT 1
            FROM dbo.TM_user_email_settings AS settings
            WHERE settings.owner_user_id <> @owner
              AND settings.alternate_email_normalized = @email
          ) OR EXISTS (
            SELECT 1
            FROM dbo.TM_email_verifications AS verification
            WHERE verification.owner_user_id <> @owner
              AND verification.pending_email_normalized = @email
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS unavailable;
      `);

    return Boolean(result.recordset[0]?.unavailable);
  },

  async prepareVerification(
    ownerUserId: number,
    input: {
      email: string;
      normalizedEmail: string;
      codeHash: string;
      expiresInMinutes: number;
      cooldownSeconds: number;
      maxSendsPerHour: number;
    },
  ): Promise<PrepareVerificationRecord> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, ownerUserId)
      .input("email", sql.NVarChar(320), input.email)
      .input("normalized", sql.NVarChar(320), input.normalizedEmail)
      .input("codeHash", sql.Char(64), input.codeHash)
      .input("expiresMinutes", sql.Int, input.expiresInMinutes)
      .input("cooldownSeconds", sql.Int, input.cooldownSeconds)
      .input("maxSends", sql.Int, input.maxSendsPerHour).query<PrepareVerificationRecord>(`
        SET NOCOUNT ON;
        SET XACT_ABORT ON;

        DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
        DECLARE @status VARCHAR(20) = 'READY';
        DECLARE @expires DATETIME2(3) = NULL;
        DECLARE @resend DATETIME2(3) = NULL;
        DECLARE @retry DATETIME2(3) = NULL;

        BEGIN TRY
          BEGIN TRANSACTION;

          IF NOT EXISTS (
            SELECT 1
            FROM dbo.TM_email_verifications WITH (UPDLOCK, HOLDLOCK)
            WHERE owner_user_id = @owner
          )
          BEGIN
            INSERT dbo.TM_email_verifications (owner_user_id)
            VALUES (@owner);
          END;

          UPDATE dbo.TM_email_verifications
          SET window_started_at_utc = @now,
              send_count = 0,
              updated_at_utc = @now
          WHERE owner_user_id = @owner
            AND DATEADD(HOUR, 1, window_started_at_utc) <= @now;

          IF EXISTS (
            SELECT 1
            FROM dbo.TM_email_verifications WITH (UPDLOCK, HOLDLOCK)
            WHERE owner_user_id = @owner
              AND send_count >= @maxSends
          )
          BEGIN
            SET @status = 'RATE_LIMITED';
            SELECT @retry = DATEADD(HOUR, 1, window_started_at_utc)
            FROM dbo.TM_email_verifications
            WHERE owner_user_id = @owner;
          END
          ELSE IF EXISTS (
            SELECT 1
            FROM dbo.TM_email_verifications WITH (UPDLOCK, HOLDLOCK)
            WHERE owner_user_id = @owner
              AND pending_email IS NOT NULL
              AND resend_available_at_utc > @now
          )
          BEGIN
            SET @status = 'COOLDOWN';
            SELECT @retry = resend_available_at_utc
            FROM dbo.TM_email_verifications
            WHERE owner_user_id = @owner;
          END
          ELSE
          BEGIN
            SET @expires = DATEADD(MINUTE, @expiresMinutes, @now);
            SET @resend = DATEADD(SECOND, @cooldownSeconds, @now);

            UPDATE dbo.TM_email_verifications
            SET pending_email = @email,
                pending_email_normalized = @normalized,
                code_hash = @codeHash,
                expires_at_utc = @expires,
                attempt_count = 0,
                resend_available_at_utc = @resend,
                send_count = send_count + 1,
                updated_at_utc = @now
            WHERE owner_user_id = @owner;
          END;

          COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
          IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
          THROW;
        END CATCH;

        SELECT @status AS status,
               @expires AS expiresAtUtc,
               @resend AS resendAvailableAtUtc,
               @retry AS retryAtUtc;
      `);

    const record = result.recordset[0];
    if (!record) throw new Error("Verification preparation did not return a status.");
    return record;
  },

  async allowImmediateResend(ownerUserId: number, codeHash: string): Promise<void> {
    const pool = await getDatabasePool();
    await pool
      .request()
      .input("owner", sql.Int, ownerUserId)
      .input("codeHash", sql.Char(64), codeHash).query(`
        UPDATE dbo.TM_email_verifications
        SET resend_available_at_utc = SYSUTCDATETIME(),
            updated_at_utc = SYSUTCDATETIME()
        WHERE owner_user_id = @owner
          AND code_hash = @codeHash;
      `);
  },

  async verifyCode(
    ownerUserId: number,
    codeHash: string,
    maxAttempts: number,
  ): Promise<VerifyCodeRecord> {
    return withTransaction(async (transaction) => {
      await ensureEmailSettingsRow(transaction, ownerUserId);
      const result = await transaction
        .request()
        .input("owner", sql.Int, ownerUserId)
        .input("codeHash", sql.Char(64), codeHash)
        .input("maxAttempts", sql.Int, maxAttempts).query<VerifyCodeRecord>(`
          SET NOCOUNT ON;
          DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
          DECLARE @status VARCHAR(20);
          DECLARE @remaining INT = @maxAttempts;
          DECLARE @pending NVARCHAR(320);
          DECLARE @normalized NVARCHAR(320);
          DECLARE @attempts INT;

          SELECT
            @pending = pending_email,
            @normalized = pending_email_normalized,
            @attempts = attempt_count
          FROM dbo.TM_email_verifications WITH (UPDLOCK, HOLDLOCK)
          WHERE owner_user_id = @owner;

          IF @pending IS NULL
          BEGIN
            SET @status = 'NO_REQUEST';
          END
          ELSE IF EXISTS (
            SELECT 1 FROM dbo.TM_email_verifications
            WHERE owner_user_id = @owner AND expires_at_utc <= @now
          )
          BEGIN
            SET @status = 'EXPIRED';
            UPDATE dbo.TM_email_verifications
            SET pending_email = NULL,
                pending_email_normalized = NULL,
                code_hash = NULL,
                expires_at_utc = NULL,
                attempt_count = 0,
                resend_available_at_utc = NULL,
                updated_at_utc = @now
            WHERE owner_user_id = @owner;
          END
          ELSE IF @attempts >= @maxAttempts
          BEGIN
            SET @status = 'LOCKED';
            SET @remaining = 0;
          END
          ELSE IF NOT EXISTS (
            SELECT 1 FROM dbo.TM_email_verifications
            WHERE owner_user_id = @owner AND code_hash = @codeHash
          )
          BEGIN
            SET @attempts = @attempts + 1;
            SET @remaining = CASE WHEN @maxAttempts - @attempts < 0 THEN 0 ELSE @maxAttempts - @attempts END;
            SET @status = 'INVALID';

            UPDATE dbo.TM_email_verifications
            SET attempt_count = @attempts,
                updated_at_utc = @now,
                pending_email = CASE WHEN @attempts >= @maxAttempts THEN NULL ELSE pending_email END,
                pending_email_normalized = CASE WHEN @attempts >= @maxAttempts THEN NULL ELSE pending_email_normalized END,
                code_hash = CASE WHEN @attempts >= @maxAttempts THEN NULL ELSE code_hash END,
                expires_at_utc = CASE WHEN @attempts >= @maxAttempts THEN NULL ELSE expires_at_utc END,
                resend_available_at_utc = CASE WHEN @attempts >= @maxAttempts THEN NULL ELSE resend_available_at_utc END
            WHERE owner_user_id = @owner;
          END
          ELSE IF EXISTS (
            SELECT 1
            FROM dbo.users AS portal
            WHERE portal.USER_ID <> @owner
              AND LOWER(LTRIM(RTRIM(portal.email))) = @normalized
            UNION ALL
            SELECT 1
            FROM dbo.TM_user_email_settings AS other_settings
            WHERE other_settings.owner_user_id <> @owner
              AND other_settings.alternate_email_normalized = @normalized
          )
          BEGIN
            SET @status = 'CONFLICT';
          END
          ELSE
          BEGIN
            SET @status = 'VERIFIED';
            SET @remaining = @maxAttempts;

            DECLARE @portalEmail NVARCHAR(320);
            SELECT @portalEmail = NULLIF(LTRIM(RTRIM(email)), N'')
            FROM dbo.users
            WHERE USER_ID = @owner;

            UPDATE dbo.TM_user_email_settings
            SET alternate_email = @pending,
                alternate_email_normalized = @normalized,
                alternate_email_verified_at_utc = @now,
                active_email_source = CASE
                  WHEN active_email_source = 'ALTERNATE' AND @portalEmail IS NOT NULL THEN 'PORTAL'
                  ELSE active_email_source
                END,
                updated_at_utc = @now
            WHERE owner_user_id = @owner;

            UPDATE dbo.TM_email_verifications
            SET pending_email = NULL,
                pending_email_normalized = NULL,
                code_hash = NULL,
                expires_at_utc = NULL,
                attempt_count = 0,
                resend_available_at_utc = NULL,
                updated_at_utc = @now
            WHERE owner_user_id = @owner;
          END;

          SELECT @status AS status, @remaining AS attemptsRemaining;
        `);

      const record = result.recordset[0];
      if (!record) throw new Error("Email verification did not return a status.");
      return record;
    });
  },

  async deleteAlternate(ownerUserId: number): Promise<void> {
    await withTransaction(async (transaction) => {
      await ensureEmailSettingsRow(transaction, ownerUserId);
      const portalResult = await transaction
        .request()
        .input("owner", sql.Int, ownerUserId)
        .query<{ portalEmail: string | null }>(`
          SELECT NULLIF(LTRIM(RTRIM(email)), N'') AS portalEmail
          FROM dbo.users
          WHERE USER_ID = @owner;
        `);
      const portalEmail = portalResult.recordset[0]?.portalEmail ?? null;

      await transaction.request().input("owner", sql.Int, ownerUserId).query(`
        UPDATE dbo.TM_user_email_settings
        SET alternate_email = NULL,
            alternate_email_normalized = NULL,
            alternate_email_verified_at_utc = NULL,
            active_email_source = 'PORTAL',
            updated_at_utc = SYSUTCDATETIME()
        WHERE owner_user_id = @owner;

        UPDATE dbo.TM_email_verifications
        SET pending_email = NULL,
            pending_email_normalized = NULL,
            code_hash = NULL,
            expires_at_utc = NULL,
            attempt_count = 0,
            resend_available_at_utc = NULL,
            updated_at_utc = SYSUTCDATETIME()
        WHERE owner_user_id = @owner;
      `);

      if (!portalEmail) {
        await transaction.request().input("owner", sql.Int, ownerUserId).query(`
          UPDATE dbo.TM_user_settings
          SET email_notifications_enabled = 0,
              updated_at_utc = SYSUTCDATETIME()
          WHERE portal_user_id = @owner;
        `);
      }
    });
  },
};
