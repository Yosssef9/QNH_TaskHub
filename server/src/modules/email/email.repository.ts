import { getDatabasePool, sql } from "../../database/sql.js";
import type { EmailLanguage, EmailOutboxRecord, QueueEmailInput } from "./email.types.js";

interface QueueResultRecord {
  id: number | string;
  inserted: boolean;
}

export const emailRepository = {
  async enqueue(input: QueueEmailInput): Promise<{ id: number; inserted: boolean }> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("owner", sql.Int, input.ownerUserId ?? null)
      .input("recipientEmail", sql.NVarChar(320), input.recipientEmail)
      .input("recipientName", sql.NVarChar(200), input.recipientName ?? null)
      .input("language", sql.Char(2), input.language)
      .input("templateKey", sql.VarChar(80), input.templateKey)
      .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(input.payload))
      .input("dedupeKey", sql.VarChar(250), input.dedupeKey)
      .query<QueueResultRecord>(`
        SET NOCOUNT ON;
        SET XACT_ABORT ON;

        DECLARE @id BIGINT;
        DECLARE @inserted BIT = 0;

        BEGIN TRY
          BEGIN TRANSACTION;

          SELECT @id = id
          FROM dbo.TM_email_outbox WITH (UPDLOCK, HOLDLOCK)
          WHERE dedupe_key = @dedupeKey;

          IF @id IS NULL
          BEGIN
            INSERT dbo.TM_email_outbox (
              owner_user_id,
              recipient_email,
              recipient_name,
              language_code,
              template_key,
              template_payload_json,
              dedupe_key
            )
            VALUES (
              @owner,
              @recipientEmail,
              @recipientName,
              @language,
              @templateKey,
              @payload,
              @dedupeKey
            );

            SET @id = SCOPE_IDENTITY();
            SET @inserted = 1;
          END;

          COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
          IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
          THROW;
        END CATCH;

        SELECT @id AS id, @inserted AS inserted;
      `);

    const row = result.recordset[0];
    if (!row) {
      throw new Error("Email outbox insert did not return an identifier.");
    }

    return { id: Number(row.id), inserted: Boolean(row.inserted) };
  },

  async claimBatch(
    workerId: string,
    batchSize: number,
    staleMinutes: number,
    maxAttempts: number,
  ): Promise<EmailOutboxRecord[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("workerId", sql.VarChar(120), workerId)
      .input("batchSize", sql.Int, batchSize)
      .input("staleMinutes", sql.Int, staleMinutes)
      .input("maxAttempts", sql.Int, maxAttempts)
      .query<EmailOutboxRecord>(`
        SET NOCOUNT ON;

        UPDATE dbo.TM_email_outbox
        SET
          status = 'FAILED',
          last_error = COALESCE(last_error, N'Email processing lease expired after the maximum number of attempts.'),
          locked_at_utc = NULL,
          locked_by = NULL,
          updated_at_utc = SYSUTCDATETIME()
        WHERE status = 'PROCESSING'
          AND attempt_count >= @maxAttempts
          AND locked_at_utc < DATEADD(MINUTE, -@staleMinutes, SYSUTCDATETIME());

        ;WITH candidates AS (
          SELECT TOP (@batchSize) id
          FROM dbo.TM_email_outbox WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE
            (status = 'PENDING' AND attempt_count < @maxAttempts AND next_attempt_at_utc <= SYSUTCDATETIME())
            OR
            (status = 'PROCESSING' AND attempt_count < @maxAttempts AND locked_at_utc < DATEADD(MINUTE, -@staleMinutes, SYSUTCDATETIME()))
          ORDER BY next_attempt_at_utc, id
        )
        UPDATE outbox
        SET
          status = 'PROCESSING',
          attempt_count = attempt_count + 1,
          locked_at_utc = SYSUTCDATETIME(),
          locked_by = @workerId,
          updated_at_utc = SYSUTCDATETIME()
        OUTPUT
          inserted.id,
          inserted.owner_user_id AS ownerUserId,
          inserted.recipient_email AS recipientEmail,
          inserted.recipient_name AS recipientName,
          inserted.language_code AS languageCode,
          inserted.template_key AS templateKey,
          inserted.template_payload_json AS templatePayloadJson,
          inserted.attempt_count AS attemptCount
        FROM dbo.TM_email_outbox outbox
        INNER JOIN candidates ON candidates.id = outbox.id;
      `);

    return result.recordset.map((row) => ({
      ...row,
      id: Number(row.id),
      ownerUserId: row.ownerUserId === null ? null : Number(row.ownerUserId),
      attemptCount: Number(row.attemptCount),
      languageCode: row.languageCode as EmailLanguage,
    }));
  },

  async updateProcessingDelivery(
    id: number,
    workerId: string,
    recipientEmail: string,
    recipientName: string | null,
    language: EmailLanguage,
  ): Promise<void> {
    const pool = await getDatabasePool();
    await pool
      .request()
      .input("id", sql.BigInt, id)
      .input("workerId", sql.VarChar(120), workerId)
      .input("recipientEmail", sql.NVarChar(320), recipientEmail)
      .input("recipientName", sql.NVarChar(200), recipientName)
      .input("language", sql.Char(2), language)
      .query(`
        UPDATE dbo.TM_email_outbox
        SET recipient_email = @recipientEmail,
            recipient_name = @recipientName,
            language_code = @language,
            updated_at_utc = SYSUTCDATETIME()
        WHERE id = @id AND status = 'PROCESSING' AND locked_by = @workerId;
      `);
  },

  async markCanceled(id: number, workerId: string, reason: string): Promise<void> {
    const pool = await getDatabasePool();
    await pool
      .request()
      .input("id", sql.BigInt, id)
      .input("workerId", sql.VarChar(120), workerId)
      .input("reason", sql.NVarChar(2000), reason.slice(0, 2000))
      .query(`
        UPDATE dbo.TM_email_outbox
        SET status = 'CANCELED',
            last_error = @reason,
            locked_at_utc = NULL,
            locked_by = NULL,
            updated_at_utc = SYSUTCDATETIME()
        WHERE id = @id AND status = 'PROCESSING' AND locked_by = @workerId;
      `);
  },

  async markSent(id: number, workerId: string, providerMessageId: string | null): Promise<void> {
    const pool = await getDatabasePool();
    await pool
      .request()
      .input("id", sql.BigInt, id)
      .input("workerId", sql.VarChar(120), workerId)
      .input("providerMessageId", sql.NVarChar(255), providerMessageId)
      .query(`
        UPDATE dbo.TM_email_outbox
        SET
          status = 'SENT',
          sent_at_utc = SYSUTCDATETIME(),
          provider_message_id = @providerMessageId,
          last_error = NULL,
          locked_at_utc = NULL,
          locked_by = NULL,
          updated_at_utc = SYSUTCDATETIME()
        WHERE id = @id AND status = 'PROCESSING' AND locked_by = @workerId;
      `);
  },

  async markAttemptFailed(
    id: number,
    workerId: string,
    attemptCount: number,
    maxAttempts: number,
    retryDelaySeconds: number,
    errorMessage: string,
  ): Promise<void> {
    const pool = await getDatabasePool();
    const terminal = attemptCount >= maxAttempts;
    await pool
      .request()
      .input("id", sql.BigInt, id)
      .input("workerId", sql.VarChar(120), workerId)
      .input("status", sql.VarChar(20), terminal ? "FAILED" : "PENDING")
      .input("retryDelaySeconds", sql.Int, retryDelaySeconds)
      .input("lastError", sql.NVarChar(2000), errorMessage.slice(0, 2000))
      .query(`
        UPDATE dbo.TM_email_outbox
        SET
          status = @status,
          next_attempt_at_utc = CASE
            WHEN @status = 'FAILED' THEN next_attempt_at_utc
            ELSE DATEADD(SECOND, @retryDelaySeconds, SYSUTCDATETIME())
          END,
          last_error = @lastError,
          locked_at_utc = NULL,
          locked_by = NULL,
          updated_at_utc = SYSUTCDATETIME()
        WHERE id = @id AND status = 'PROCESSING' AND locked_by = @workerId;
      `);
  },
};
