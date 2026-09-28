import { getDatabasePool, sql } from "../../database/sql.js";
import { normalizeSqlRowVersion } from "../../shared/utils/sql-row-version.js";
import { MEETING_REPORT_EMAIL_TEMPLATE } from "./meeting-report-schedule.policy.js";
import type { ReportMeetingStatus, ReportScheduleSnapshot } from "./meeting-report-schedule.types.js";

interface ScheduleRecord {
  meetingId: number | string;
  meetingStatus: ReportMeetingStatus;
  meetingRowVersion: unknown;
  approvedRevisionId: number | string | null;
  approvedStartAtUtc: Date | null;
  approvedEndAtUtc: Date | null;
  hasPendingReschedule: boolean;
  observedAtUtc: Date;
  userId: number;
  outboxStatus: string | null;
  reportRevisionId: string | null;
  reportEndAtUtc: string | null;
  attemptCount: number | null;
  sentAtUtc: Date | null;
  nextAttemptAtUtc: Date | null;
}

/** Only invoke after normal Meeting content authorization. */
export const meetingReportScheduleRepository = {
  async snapshot(meetingId: number): Promise<ReportScheduleSnapshot | null> {
    const pool = await getDatabasePool();
    const result = await pool.request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("template", sql.VarChar(80), MEETING_REPORT_EMAIL_TEMPLATE)
      .input("prefix", sql.VarChar(100), `MEETING_REPORT:${meetingId}:`)
      .query<ScheduleRecord>(`
        ;WITH recipients AS (
          SELECT organizer_user_id AS user_id FROM dbo.TM_meetings WHERE id = @meetingId
          UNION
          SELECT attendee_user_id FROM dbo.TM_meeting_attendees WHERE meeting_id = @meetingId
        )
        SELECT
          meeting.id AS meetingId, meeting.status AS meetingStatus,
          meeting.row_version AS meetingRowVersion,
          revision.id AS approvedRevisionId,
          revision.start_at_utc AS approvedStartAtUtc, revision.end_at_utc AS approvedEndAtUtc,
          CAST(CASE WHEN EXISTS (
            SELECT 1 FROM dbo.TM_meeting_revisions AS proposed
            WHERE proposed.meeting_id = meeting.id
              AND proposed.revision_type = 'RESCHEDULE' AND proposed.revision_status = 'PENDING'
          ) THEN 1 ELSE 0 END AS BIT) AS hasPendingReschedule,
          SYSUTCDATETIME() AS observedAtUtc,
          recipients.user_id AS userId,
          outbox.status AS outboxStatus,
          JSON_VALUE(outbox.template_payload_json, '$.revisionId') AS reportRevisionId,
          JSON_VALUE(outbox.template_payload_json, '$.scheduledEndAtUtc') AS reportEndAtUtc,
          outbox.attempt_count AS attemptCount,
          outbox.sent_at_utc AS sentAtUtc, outbox.next_attempt_at_utc AS nextAttemptAtUtc
        FROM dbo.TM_meetings AS meeting
        LEFT JOIN dbo.TM_meeting_revisions AS revision
          ON revision.id = meeting.current_revision_id AND revision.meeting_id = meeting.id
          AND revision.revision_status = 'APPROVED'
        CROSS JOIN recipients
        LEFT JOIN dbo.TM_email_outbox AS outbox
          ON outbox.dedupe_key = @prefix + CONVERT(VARCHAR(20), recipients.user_id)
          AND outbox.template_key = @template
          AND (outbox.owner_user_id = recipients.user_id OR
            (outbox.owner_user_id IS NULL AND TRY_CONVERT(INT,
              JSON_VALUE(outbox.template_payload_json, '$.recipientUserId')) = recipients.user_id))
        WHERE meeting.id = @meetingId
        ORDER BY recipients.user_id;
      `);
    const first = result.recordset[0];
    if (!first) return null;
    const meetingRowVersion = normalizeSqlRowVersion(first.meetingRowVersion);
    if (!meetingRowVersion) throw new Error("Meeting report schedule has no valid row version.");
    return {
      meetingId: Number(first.meetingId), meetingStatus: first.meetingStatus, meetingRowVersion,
      approvedRevisionId: first.approvedRevisionId === null ? null : Number(first.approvedRevisionId),
      approvedStartAtUtc: first.approvedStartAtUtc?.toISOString() ?? null,
      approvedEndAtUtc: first.approvedEndAtUtc?.toISOString() ?? null,
      hasPendingReschedule: Boolean(first.hasPendingReschedule), observedAtUtc: first.observedAtUtc.toISOString(),
      recipients: result.recordset.map((row) => ({
        userId: Number(row.userId), outboxStatus: row.outboxStatus,
        revisionId: row.reportRevisionId !== null && /^\d+$/.test(row.reportRevisionId) && Number.isSafeInteger(Number(row.reportRevisionId)) ? Number(row.reportRevisionId) : null,
        scheduledEndAtUtc: row.reportEndAtUtc, attemptCount: Number(row.attemptCount ?? 0),
        sentAtUtc: row.sentAtUtc?.toISOString() ?? null,
        nextAttemptAtUtc: row.nextAttemptAtUtc?.toISOString() ?? null,
      })),
    };
  },
};

