import { getDatabasePool, sql } from "../../database/sql.js";
import { MEETING_REPORT_EMAIL_TEMPLATE, MEETING_REPORT_GRACE_MINUTES } from "./meeting-report-schedule.policy.js";
import type { ReportDeliveryContext, ReportEmailSettings } from "./meeting-report-email.policy.js";

export const meetingReportEmailRepository = {
  async settings(): Promise<ReportEmailSettings | null> {
    const pool = await getDatabasePool();
    // This query is also safe before migration 044. Do not cache absence across deployment.
    const installed = await pool.request().query<{ installed: boolean }>(`
      SELECT CAST(CASE WHEN OBJECT_ID(N'dbo.TM_meeting_report_delivery_config', N'U') IS NOT NULL
        THEN 1 ELSE 0 END AS BIT) AS installed;
    `);
    if (!installed.recordset[0]?.installed) return null;
    const result = await pool.request().query<{ enabled: boolean; activatedAtUtc: Date; lastScanAtUtc: Date | null }>(`
      SELECT is_enabled AS enabled, activated_at_utc AS activatedAtUtc, last_scan_at_utc AS lastScanAtUtc
      FROM dbo.TM_meeting_report_delivery_config WHERE id = 1;
    `);
    const row = result.recordset[0];
    return row ? { enabled: Boolean(row.enabled), activatedAtUtc: row.activatedAtUtc.toISOString(), lastScanAtUtc: row.lastScanAtUtc?.toISOString() ?? null } : null;
  },

  /** The existing outbox is the only queue. PDF generation and all network I/O happen AFTER commit. */
  async enqueueDue(batchSize = 100): Promise<number> {
    const pool = await getDatabasePool();
    const result = await pool.request()
      .input("batchSize", sql.Int, batchSize)
      .input("grace", sql.Int, MEETING_REPORT_GRACE_MINUTES)
      .input("template", sql.VarChar(80), MEETING_REPORT_EMAIL_TEMPLATE)
      .query<{ queued: number }>(`
        SET NOCOUNT ON;
        SET XACT_ABORT ON;
        DECLARE @queued INT = 0, @lock INT;
        DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
        DECLARE @cutoff DATETIME2(3);
        BEGIN TRY
          BEGIN TRANSACTION;
          EXEC @lock = sys.sp_getapplock @Resource = N'TaskHub:MeetingReport:Dispatch',
            @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 0;
          IF @lock < 0
          BEGIN
            ROLLBACK TRANSACTION;
            SELECT 0 AS queued;
            RETURN;
          END;
          SELECT @cutoff = activated_at_utc FROM dbo.TM_meeting_report_delivery_config
            WHERE id = 1 AND is_enabled = 1;
          IF @cutoff IS NOT NULL
          BEGIN
            ;WITH due_meetings AS (
              SELECT meeting.id, meeting.organizer_user_id, revision.id AS revision_id, revision.end_at_utc
              FROM dbo.TM_meetings AS meeting
              INNER JOIN dbo.TM_meeting_revisions AS revision
                ON revision.id = meeting.current_revision_id AND revision.meeting_id = meeting.id
              WHERE meeting.status = 'SCHEDULED' AND revision.revision_status = 'APPROVED'
                AND revision.start_at_utc < revision.end_at_utc
                AND revision.end_at_utc >= @cutoff
                AND revision.end_at_utc <= DATEADD(MINUTE, -@grace, @now)
            ), roster AS (
              SELECT id AS meeting_id, organizer_user_id AS user_id, revision_id, end_at_utc FROM due_meetings
              UNION
              SELECT meeting.id, attendee.attendee_user_id, meeting.revision_id, meeting.end_at_utc
              FROM due_meetings AS meeting
              INNER JOIN dbo.TM_meeting_attendees AS attendee ON attendee.meeting_id = meeting.id
            ), candidates AS (
              SELECT TOP (@batchSize) roster.*
              FROM roster
              WHERE NOT EXISTS (
                SELECT 1 FROM dbo.TM_email_outbox AS existing WITH (UPDLOCK, HOLDLOCK)
                WHERE existing.dedupe_key = 'MEETING_REPORT:' + CONVERT(VARCHAR(20), roster.meeting_id) + ':' + CONVERT(VARCHAR(20), roster.user_id)
              )
              ORDER BY roster.end_at_utc, roster.meeting_id, roster.user_id
            )
            INSERT dbo.TM_email_outbox (
              owner_user_id, recipient_email, recipient_name, language_code, template_key,
              template_payload_json, dedupe_key, status, next_attempt_at_utc
            )
            SELECT access.portal_user_id, NULL, NULL,
              CASE WHEN settings.language_code = 'EN' THEN 'en' ELSE 'ar' END,
              @template,
              (SELECT candidate.meeting_id AS meetingId, candidate.user_id AS recipientUserId,
                      candidate.revision_id AS revisionId,
                      CONVERT(VARCHAR(23), candidate.end_at_utc, 126) + 'Z' AS scheduledEndAtUtc
               FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
              'MEETING_REPORT:' + CONVERT(VARCHAR(20), candidate.meeting_id) + ':' + CONVERT(VARCHAR(20), candidate.user_id),
              'PENDING', @now
            FROM candidates AS candidate
            LEFT JOIN dbo.TM_user_access AS access ON access.portal_user_id = candidate.user_id
            LEFT JOIN dbo.TM_user_settings AS settings ON settings.portal_user_id = candidate.user_id;
            SET @queued = @@ROWCOUNT;
            UPDATE dbo.TM_meeting_report_delivery_config SET last_scan_at_utc = @now WHERE id = 1;
          END;
          COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
          IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
          THROW;
        END CATCH;
        SELECT @queued AS queued;
      `);
    return Number(result.recordset[0]?.queued ?? 0);
  },

  async deliveryContext(meetingId: number, recipientUserId: number): Promise<ReportDeliveryContext | null> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).input("recipient", sql.Int, recipientUserId)
      .query<{
        meetingId: number | string; status: string; revisionId: number | string | null;
        startAtUtc: Date | null; endAtUtc: Date | null; observedAtUtc: Date; activatedAtUtc: Date;
        isRecipient: boolean; portalActive: boolean; portalUserCode: string | null; ownerUserId: number | null;
      }>(`
        SELECT meeting.id AS meetingId, meeting.status,
          revision.id AS revisionId, revision.start_at_utc AS startAtUtc, revision.end_at_utc AS endAtUtc,
          SYSUTCDATETIME() AS observedAtUtc, config.activated_at_utc AS activatedAtUtc,
          CAST(CASE WHEN meeting.organizer_user_id = @recipient OR EXISTS (
            SELECT 1 FROM dbo.TM_meeting_attendees WHERE meeting_id = meeting.id AND attendee_user_id = @recipient
          ) THEN 1 ELSE 0 END AS BIT) AS isRecipient,
          CAST(CASE WHEN portal.IS_ACTIVE = 1 THEN 1 ELSE 0 END AS BIT) AS portalActive,
          portal.USER_CODE AS portalUserCode, access.portal_user_id AS ownerUserId
        FROM dbo.TM_meetings AS meeting
        CROSS JOIN dbo.TM_meeting_report_delivery_config AS config
        LEFT JOIN dbo.TM_meeting_revisions AS revision
          ON revision.id = meeting.current_revision_id AND revision.meeting_id = meeting.id
          AND revision.revision_status = 'APPROVED'
        LEFT JOIN dbo.users AS portal ON portal.USER_ID = @recipient
        LEFT JOIN dbo.TM_user_access AS access ON access.portal_user_id = @recipient AND access.is_active = 1
        WHERE meeting.id = @meetingId AND config.id = 1;
      `);
    const row = result.recordset[0];
    return row ? {
      ...row, meetingId: Number(row.meetingId), revisionId: row.revisionId === null ? null : Number(row.revisionId),
      startAtUtc: row.startAtUtc?.toISOString() ?? null, endAtUtc: row.endAtUtc?.toISOString() ?? null,
      observedAtUtc: row.observedAtUtc.toISOString(), activatedAtUtc: row.activatedAtUtc.toISOString(),
      isRecipient: Boolean(row.isRecipient), portalActive: Boolean(row.portalActive),
    } : null;
  },

  async defer(id: number, workerId: string, payload: Record<string, unknown>, nextAttemptAtUtc: string, reason: string): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("id", sql.BigInt, id).input("worker", sql.VarChar(120), workerId)
      .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(payload))
      .input("next", sql.DateTime2(3), new Date(nextAttemptAtUtc))
      .input("reason", sql.NVarChar(2000), reason)
      .query(`
        UPDATE dbo.TM_email_outbox
        SET status = 'PENDING', template_payload_json = @payload,
          next_attempt_at_utc = @next, locked_by = NULL, locked_at_utc = NULL,
          attempt_count = CASE WHEN attempt_count > 0 THEN attempt_count - 1 ELSE 0 END,
          last_error = @reason, updated_at_utc = SYSUTCDATETIME()
        WHERE id = @id AND status = 'PROCESSING' AND locked_by = @worker
          AND template_key = 'MEETING_REPORT_AVAILABLE';
      `);
  },

  async saveEnvelope(id: number, workerId: string, input: {
    ownerUserId: number; email: string; name: string; language: "ar" | "en"; payload: Record<string, unknown>;
  }): Promise<boolean> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("id", sql.BigInt, id).input("worker", sql.VarChar(120), workerId)
      .input("owner", sql.Int, input.ownerUserId).input("email", sql.NVarChar(320), input.email)
      .input("name", sql.NVarChar(200), input.name).input("language", sql.Char(2), input.language)
      .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(input.payload))
      .query<{ affected: number }>(`
        UPDATE dbo.TM_email_outbox
        SET owner_user_id = @owner, recipient_email = @email, recipient_name = @name,
          language_code = @language, template_payload_json = @payload,
          locked_at_utc = SYSUTCDATETIME(), updated_at_utc = SYSUTCDATETIME()
        WHERE id = @id AND status = 'PROCESSING' AND locked_by = @worker
          AND template_key = 'MEETING_REPORT_AVAILABLE';
        SELECT @@ROWCOUNT AS affected;
      `);
    return Number(result.recordset[0]?.affected ?? 0) === 1;
  },
};
