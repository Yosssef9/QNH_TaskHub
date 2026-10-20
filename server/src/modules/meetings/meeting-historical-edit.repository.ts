import type { DatabaseTransaction } from "../../database/types.js";
import { sql } from "../../database/sql.js";
import { normalizeSqlRowVersion, rowVersionToBuffer } from "../../shared/utils/sql-row-version.js";
import type { MeetingMode } from "./meetings.types.js";

/** All writes happen on the same SQL transaction and are serialized by the parent Meeting row. */
export const historicalMeetingEditRepository = {
  async updateIdentity(transaction: DatabaseTransaction, input: {
    meetingId: number;
    actorUserId: number;
    expectedRowVersion: string;
    expectedRevisionId: number;
    title: string;
    description: string | null;
  }): Promise<{ rowVersion: string; previousTitle: string; previousDescription: string | null } | null> {
    const version = rowVersionToBuffer(input.expectedRowVersion);
    if (!version) return null;
    const result = await transaction.request()
      .input("meetingId", sql.BigInt, input.meetingId)
      .input("actorUserId", sql.Int, input.actorUserId)
      .input("currentRevisionId", sql.BigInt, input.expectedRevisionId)
      .input("version", sql.VarBinary(8), version)
      .input("title", sql.NVarChar(250), input.title)
      .input("description", sql.NVarChar(sql.MAX), input.description)
      .query<{ rowVersion: unknown; previousTitle: string; previousDescription: string | null }>(`
        UPDATE dbo.TM_meetings
        SET title = @title, description = @description, updated_at_utc = SYSUTCDATETIME()
        OUTPUT inserted.row_version AS rowVersion,
               deleted.title AS previousTitle,
               deleted.description AS previousDescription
        WHERE id = @meetingId AND organizer_user_id = @actorUserId
          AND is_historical_entry = 1 AND status = 'SCHEDULED'
          AND current_revision_id = @currentRevisionId AND row_version = @version;
      `);
    const record = result.recordset[0];
    const rowVersion = normalizeSqlRowVersion(record?.rowVersion);
    return rowVersion && record ? { rowVersion, previousTitle: record.previousTitle,
      previousDescription: record.previousDescription } : null;
  },

  async listAttendeesForUpdate(transaction: DatabaseTransaction, meetingId: number) {
    const result = await transaction.request().input("meetingId", sql.BigInt, meetingId)
      .query<{ userId: number | string }>(`
        SELECT attendee_user_id AS userId FROM dbo.TM_meeting_attendees WITH (UPDLOCK, HOLDLOCK)
        WHERE meeting_id = @meetingId;
      `);
    return result.recordset.map((row) => Number(row.userId));
  },

  /** Locks the relevant child ranges, avoiding a check-then-delete race with task/decision creation. */
  async participantDependencies(transaction: DatabaseTransaction, meetingId: number, userId: number): Promise<string[]> {
    const result = await transaction.request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("userId", sql.Int, userId)
      .query<{ reason: string }>(`
        SELECT reason FROM (
          SELECT 'tasks' AS reason WHERE EXISTS (
            SELECT 1 FROM dbo.TM_meeting_action_items WITH (UPDLOCK, HOLDLOCK)
            WHERE meeting_id = @meetingId AND (assignee_user_id = @userId OR assigned_by_user_id = @userId)
          )
          UNION ALL SELECT 'collaborativeTasks' WHERE EXISTS (
            SELECT 1 FROM dbo.TM_collaboration_assignments AS assignment WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.TM_meeting_action_items AS item ON item.task_id = assignment.task_id
            WHERE item.meeting_id = @meetingId AND assignment.assignee_user_id = @userId
          )
          UNION ALL SELECT 'agenda' WHERE EXISTS (
            SELECT 1 FROM dbo.TM_meeting_agenda_items WITH (UPDLOCK, HOLDLOCK)
            WHERE meeting_id = @meetingId AND (presenter_user_id = @userId OR created_by_user_id = @userId)
          )
          UNION ALL SELECT 'decisions' WHERE EXISTS (
            SELECT 1 FROM dbo.TM_meeting_decisions WITH (UPDLOCK, HOLDLOCK)
            WHERE meeting_id = @meetingId AND created_by_user_id = @userId
          )
          UNION ALL SELECT 'attachments' WHERE EXISTS (
            SELECT 1 FROM dbo.TM_meeting_attachments WITH (UPDLOCK, HOLDLOCK)
            WHERE meeting_id = @meetingId AND uploaded_by_user_id = @userId
          )
          UNION ALL SELECT 'attendance' WHERE EXISTS (
            SELECT 1 FROM dbo.TM_meeting_attendees WITH (UPDLOCK, HOLDLOCK)
            WHERE meeting_id = @meetingId AND attendee_user_id = @userId
              AND (attendance_status <> 'NOT_MARKED' OR attendance_marked_at_utc IS NOT NULL)
          )
          UNION ALL SELECT 'attendanceAudit' WHERE EXISTS (
            SELECT 1 FROM dbo.TM_meeting_attendees WITH (UPDLOCK, HOLDLOCK)
            WHERE meeting_id = @meetingId AND attendance_marked_by_user_id = @userId
          )
          UNION ALL SELECT 'meetingNotes' WHERE EXISTS (
            SELECT 1 FROM dbo.TM_meeting_followup_notes WITH (UPDLOCK, HOLDLOCK)
            WHERE meeting_id = @meetingId AND updated_by_user_id = @userId
          )
        ) AS dependencies;
      `);
    return result.recordset.map((row) => row.reason);
  },

  async agendaSnapshot(transaction: DatabaseTransaction, meetingId: number) {
    const result = await transaction.request().input("meetingId", sql.BigInt, meetingId)
      .query<{ id: number | string; topic: string; presenterUserId: number | null; plannedDurationMinutes: number | null; sortOrder: number }>(`
        SELECT id, topic, presenter_user_id AS presenterUserId,
               planned_duration_minutes AS plannedDurationMinutes, sort_order AS sortOrder
        FROM dbo.TM_meeting_agenda_items WITH (UPDLOCK, HOLDLOCK)
        WHERE meeting_id = @meetingId ORDER BY sort_order, id;
      `);
    return result.recordset.map((row) => ({
      id: Number(row.id), topic: row.topic,
      presenterUserId: row.presenterUserId, plannedDurationMinutes: row.plannedDurationMinutes,
      sortOrder: row.sortOrder,
    }));
  },

  async linkedAgendaDetails(transaction: DatabaseTransaction, meetingId: number) {
    const result = await transaction.request().input("meetingId", sql.BigInt, meetingId)
      .query<{ id: number | string; taskCount: number | string; decisionCount: number | string }>(`
        SELECT agenda.id,
          (SELECT COUNT_BIG(*) FROM dbo.TM_meeting_action_items AS action WHERE action.agenda_item_id = agenda.id) AS taskCount,
          (SELECT COUNT_BIG(*) FROM dbo.TM_meeting_decisions AS decision WHERE decision.agenda_item_id = agenda.id) AS decisionCount
        FROM dbo.TM_meeting_agenda_items AS agenda
        WHERE agenda.meeting_id = @meetingId
          AND (EXISTS (SELECT 1 FROM dbo.TM_meeting_action_items AS action WHERE action.agenda_item_id = agenda.id)
            OR EXISTS (SELECT 1 FROM dbo.TM_meeting_decisions AS decision WHERE decision.agenda_item_id = agenda.id));
      `);
    return result.recordset.map((row) => ({
      id: Number(row.id), taskCount: Number(row.taskCount), decisionCount: Number(row.decisionCount),
    }));
  },

  async addAttendee(transaction: DatabaseTransaction, meetingId: number, actorUserId: number, userId: number) {
    await transaction.request().input("meetingId", sql.BigInt, meetingId)
      .input("actorUserId", sql.Int, actorUserId).input("userId", sql.Int, userId)
      .query(`INSERT INTO dbo.TM_meeting_attendees (meeting_id, attendee_user_id, added_by_user_id)
              VALUES (@meetingId, @userId, @actorUserId);`);
  },

  async removeAttendee(transaction: DatabaseTransaction, meetingId: number, userId: number) {
    await transaction.request().input("meetingId", sql.BigInt, meetingId)
      .input("userId", sql.Int, userId)
      .query(`DELETE FROM dbo.TM_meeting_attendees WHERE meeting_id = @meetingId AND attendee_user_id = @userId;`);
  },

  async createApprovedRevision(transaction: DatabaseTransaction, input: {
    meetingId: number;
    actorUserId: number;
    meetingMode: MeetingMode;
    roomId: number | null;
    onlineJoinUrl: string | null;
    startAtUtc: Date;
    endAtUtc: Date;
  }): Promise<number> {
    const result = await transaction.request()
      .input("meetingId", sql.BigInt, input.meetingId)
      .input("actorUserId", sql.Int, input.actorUserId)
      .input("meetingMode", sql.VarChar(10), input.meetingMode)
      .input("roomId", sql.BigInt, input.roomId)
      .input("onlineJoinUrl", sql.NVarChar(2048), input.onlineJoinUrl)
      .input("startAtUtc", sql.DateTime2(3), input.startAtUtc)
      .input("endAtUtc", sql.DateTime2(3), input.endAtUtc)
      .query<{ id: number | string }>(`
        DECLARE @number INT = (
          SELECT ISNULL(MAX(revision_number), 0) + 1 FROM dbo.TM_meeting_revisions WITH (UPDLOCK, HOLDLOCK)
          WHERE meeting_id = @meetingId
        );
        INSERT INTO dbo.TM_meeting_revisions (
          meeting_id, revision_number, revision_type, revision_status, meeting_mode, room_id,
          online_join_url, start_at_utc, end_at_utc, requested_by_user_id, approved_by_user_id, decided_at_utc
        ) OUTPUT inserted.id AS id
        VALUES (@meetingId, @number, 'RESCHEDULE', 'APPROVED', @meetingMode, @roomId,
          @onlineJoinUrl, @startAtUtc, @endAtUtc, @actorUserId, @actorUserId, SYSUTCDATETIME());
      `);
    return Number(result.recordset[0]?.id);
  },

  async activateHistoricalRevision(transaction: DatabaseTransaction, meetingId: number, revisionId: number) {
    await transaction.request().input("meetingId", sql.BigInt, meetingId)
      .input("revisionId", sql.BigInt, revisionId)
      .query(`UPDATE dbo.TM_meetings SET current_revision_id = @revisionId, updated_at_utc = SYSUTCDATETIME()
              WHERE id = @meetingId AND is_historical_entry = 1 AND status = 'SCHEDULED';`);
  },
};
