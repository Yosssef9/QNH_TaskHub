import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { normalizeSqlRowVersion, rowVersionToBuffer } from "../../shared/utils/sql-row-version.js";

interface RoomScheduleRecord {
  id: number | string;
  capacity: number;
  isActive: boolean;
}

interface ConflictRecord {
  conflictCount: number | string;
}

interface ParticipantRecord {
  participantCount: number | string;
}

interface RoomCapacityRecord {
  maximumParticipantCount: number | string | null;
}

interface AppLockRecord {
  lockResult: number;
}

export interface RevisionScheduleRecord {
  meetingId: number;
  meetingStatus: "PENDING_APPROVAL" | "SCHEDULED" | "REJECTED" | "CANCELLED";
  currentRevisionId: number | null;
  meetingRowVersion: string;
  revisionId: number;
  revisionType: "INITIAL" | "RESCHEDULE";
  revisionStatus: "PENDING" | "APPROVED" | "REJECTED";
  roomId: number;
  startAtUtc: Date;
  endAtUtc: Date;
  revisionRowVersion: string;
}

interface RawRevisionScheduleRecord {
  meetingId: number | string;
  meetingStatus: RevisionScheduleRecord["meetingStatus"];
  currentRevisionId: number | string | null;
  meetingRowVersion: unknown;
  revisionId: number | string;
  revisionType: RevisionScheduleRecord["revisionType"];
  revisionStatus: RevisionScheduleRecord["revisionStatus"];
  roomId: number | string;
  startAtUtc: Date;
  endAtUtc: Date;
  revisionRowVersion: unknown;
}

function mapRevisionScheduleRecord(record: RawRevisionScheduleRecord): RevisionScheduleRecord | null {
  const meetingRowVersion = normalizeSqlRowVersion(record.meetingRowVersion);
  const revisionRowVersion = normalizeSqlRowVersion(record.revisionRowVersion);
  if (!meetingRowVersion || !revisionRowVersion) return null;

  return {
    meetingId: Number(record.meetingId),
    meetingStatus: record.meetingStatus,
    currentRevisionId: record.currentRevisionId === null ? null : Number(record.currentRevisionId),
    meetingRowVersion,
    revisionId: Number(record.revisionId),
    revisionType: record.revisionType,
    revisionStatus: record.revisionStatus,
    roomId: Number(record.roomId),
    startAtUtc: record.startAtUtc,
    endAtUtc: record.endAtUtc,
    revisionRowVersion,
  };
}

function bindScheduleWindow(
  request: import("mssql").Request,
  roomId: number,
  startAtUtc: Date,
  endAtUtc: Date,
  excludeMeetingId: number | null,
): void {
  request
    .input("roomId", sql.BigInt, roomId)
    .input("startAtUtc", sql.DateTime2(3), startAtUtc)
    .input("endAtUtc", sql.DateTime2(3), endAtUtc)
    .input("excludeMeetingId", sql.BigInt, excludeMeetingId);
}

export const meetingSchedulingRepository = {
  async acquireRoomLock(transaction: DatabaseTransaction, roomId: number): Promise<number> {
    const resource = `TaskHub:MeetingRoom:${roomId}`;
    const result = await transaction
      .request()
      .input("resource", sql.NVarChar(255), resource)
      .input("lockTimeout", sql.Int, 5000)
      .query<AppLockRecord>(`
        DECLARE @lockResult INT;
        EXEC @lockResult = sys.sp_getapplock
          @Resource = @resource,
          @LockMode = 'Exclusive',
          @LockOwner = 'Transaction',
          @LockTimeout = @lockTimeout,
          @DbPrincipal = 'public';
        SELECT @lockResult AS lockResult;
      `);

    return Number(result.recordset[0]?.lockResult ?? -999);
  },


  async hasActiveMeetingPermission(
    transaction: DatabaseTransaction,
    userId: number,
    permissionCode: "MEETING_ORGANIZE" | "MEETING_COORDINATE",
  ): Promise<boolean> {
    const result = await transaction
      .request()
      .input("userId", sql.Int, userId)
      .input("permissionCode", sql.VarChar(40), permissionCode)
      .query<{ allowed: boolean }>(`
        SELECT CAST(
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_user_permissions
            WHERE portal_user_id = @userId
              AND permission_code = @permissionCode
              AND is_active = 1
          ) THEN 1 ELSE 0 END
          AS BIT
        ) AS allowed;
      `);

    return Boolean(result.recordset[0]?.allowed);
  },

  async findRoomForScheduling(
    transaction: DatabaseTransaction,
    roomId: number,
  ): Promise<RoomScheduleRecord | null> {
    const result = await transaction
      .request()
      .input("roomId", sql.BigInt, roomId)
      .query<RoomScheduleRecord>(`
        SELECT TOP (1)
          id,
          capacity,
          CAST(is_active AS BIT) AS isActive
        FROM dbo.TM_meeting_rooms
        WHERE id = @roomId;
      `);

    return result.recordset[0] ?? null;
  },

  async findRoomForAvailability(roomId: number): Promise<RoomScheduleRecord | null> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("roomId", sql.BigInt, roomId)
      .query<RoomScheduleRecord>(`
        SELECT TOP (1)
          id,
          capacity,
          CAST(is_active AS BIT) AS isActive
        FROM dbo.TM_meeting_rooms
        WHERE id = @roomId;
      `);

    return result.recordset[0] ?? null;
  },

  async countConflicts(
    roomId: number,
    startAtUtc: Date,
    endAtUtc: Date,
    excludeMeetingId: number | null,
  ): Promise<number> {
    const pool = await getDatabasePool();
    const request = pool.request();
    bindScheduleWindow(request, roomId, startAtUtc, endAtUtc, excludeMeetingId);
    const result = await request.query<ConflictRecord>(`
      SELECT COUNT_BIG(1) AS conflictCount
      FROM dbo.TM_meetings AS m
      INNER JOIN dbo.TM_meeting_revisions AS r
        ON r.id = m.current_revision_id
       AND r.meeting_id = m.id
      WHERE m.status = 'SCHEDULED'
        AND r.revision_status = 'APPROVED'
        AND r.room_id = @roomId
        AND r.start_at_utc < @endAtUtc
        AND r.end_at_utc > @startAtUtc
        AND (@excludeMeetingId IS NULL OR m.id <> @excludeMeetingId);
    `);

    return Number(result.recordset[0]?.conflictCount ?? 0);
  },

  async countConflictsInTransaction(
    transaction: DatabaseTransaction,
    roomId: number,
    startAtUtc: Date,
    endAtUtc: Date,
    excludeMeetingId: number | null,
  ): Promise<number> {
    const request = transaction.request();
    bindScheduleWindow(request, roomId, startAtUtc, endAtUtc, excludeMeetingId);
    const result = await request.query<ConflictRecord>(`
      SELECT COUNT_BIG(1) AS conflictCount
      FROM dbo.TM_meetings AS m
      INNER JOIN dbo.TM_meeting_revisions AS r
        ON r.id = m.current_revision_id
       AND r.meeting_id = m.id
      WHERE m.status = 'SCHEDULED'
        AND r.revision_status = 'APPROVED'
        AND r.room_id = @roomId
        AND r.start_at_utc < @endAtUtc
        AND r.end_at_utc > @startAtUtc
        AND (@excludeMeetingId IS NULL OR m.id <> @excludeMeetingId);
    `);

    return Number(result.recordset[0]?.conflictCount ?? 0);
  },

  async findRevisionSchedule(
    transaction: DatabaseTransaction,
    meetingId: number,
    revisionId: number,
  ): Promise<RevisionScheduleRecord | null> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("revisionId", sql.BigInt, revisionId)
      .query<RawRevisionScheduleRecord>(`
        SELECT TOP (1)
          m.id AS meetingId,
          m.status AS meetingStatus,
          m.current_revision_id AS currentRevisionId,
          m.row_version AS meetingRowVersion,
          r.id AS revisionId,
          r.revision_type AS revisionType,
          r.revision_status AS revisionStatus,
          r.room_id AS roomId,
          r.start_at_utc AS startAtUtc,
          r.end_at_utc AS endAtUtc,
          r.row_version AS revisionRowVersion
        FROM dbo.TM_meetings AS m
        INNER JOIN dbo.TM_meeting_revisions AS r
          ON r.meeting_id = m.id
        WHERE m.id = @meetingId
          AND r.id = @revisionId;
      `);

    const record = result.recordset[0];
    return record ? mapRevisionScheduleRecord(record) : null;
  },

  async countMeetingParticipants(
    transaction: DatabaseTransaction,
    meetingId: number,
  ): Promise<number> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .query<ParticipantRecord>(`
        SELECT
          CAST(1 + COUNT_BIG(a.attendee_user_id) AS BIGINT) AS participantCount
        FROM dbo.TM_meetings AS m
        LEFT JOIN dbo.TM_meeting_attendees AS a
          ON a.meeting_id = m.id
         AND a.attendee_user_id <> m.organizer_user_id
        WHERE m.id = @meetingId
        GROUP BY m.id;
      `);

    return Number(result.recordset[0]?.participantCount ?? 0);
  },

  async maximumFutureScheduledParticipantCount(
    transaction: DatabaseTransaction,
    roomId: number,
  ): Promise<number> {
    const result = await transaction
      .request()
      .input("roomId", sql.BigInt, roomId)
      .query<RoomCapacityRecord>(`
        SELECT MAX(participantCount) AS maximumParticipantCount
        FROM (
          SELECT
            m.id,
            CAST(1 + COUNT_BIG(a.attendee_user_id) AS BIGINT) AS participantCount
          FROM dbo.TM_meetings AS m
          INNER JOIN dbo.TM_meeting_revisions AS r
            ON r.id = m.current_revision_id
           AND r.meeting_id = m.id
          LEFT JOIN dbo.TM_meeting_attendees AS a
            ON a.meeting_id = m.id
           AND a.attendee_user_id <> m.organizer_user_id
          WHERE m.status = 'SCHEDULED'
            AND r.revision_status = 'APPROVED'
            AND r.room_id = @roomId
            AND r.end_at_utc > SYSUTCDATETIME()
          GROUP BY m.id
        ) AS scheduled;
      `);

    return Number(result.recordset[0]?.maximumParticipantCount ?? 0);
  },

  async approveRevision(
    transaction: DatabaseTransaction,
    meetingId: number,
    revisionId: number,
    expectedRowVersion: string,
    actorUserId: number,
  ): Promise<boolean> {
    const rowVersion = rowVersionToBuffer(expectedRowVersion);
    if (!rowVersion) return false;

    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("revisionId", sql.BigInt, revisionId)
      .input("rowVersion", sql.VarBinary(8), rowVersion)
      .input("actorUserId", sql.Int, actorUserId)
      .query(`
        UPDATE dbo.TM_meeting_revisions
        SET
          revision_status = 'APPROVED',
          approved_by_user_id = @actorUserId,
          rejected_by_user_id = NULL,
          decided_at_utc = SYSUTCDATETIME()
        WHERE id = @revisionId
          AND meeting_id = @meetingId
          AND revision_status = 'PENDING'
          AND row_version = @rowVersion;
      `);

    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async activateRevision(
    transaction: DatabaseTransaction,
    meetingId: number,
    revisionId: number,
    expectedMeetingRowVersion: string,
  ): Promise<boolean> {
    const rowVersion = rowVersionToBuffer(expectedMeetingRowVersion);
    if (!rowVersion) return false;

    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("revisionId", sql.BigInt, revisionId)
      .input("rowVersion", sql.VarBinary(8), rowVersion)
      .query(`
        UPDATE dbo.TM_meetings
        SET
          status = 'SCHEDULED',
          current_revision_id = @revisionId,
          updated_at_utc = SYSUTCDATETIME()
        WHERE id = @meetingId
          AND status IN ('PENDING_APPROVAL', 'SCHEDULED')
          AND row_version = @rowVersion;
      `);

    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async addActivity(
    transaction: DatabaseTransaction,
    meetingId: number,
    actorUserId: number,
    activityType: string,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("actorUserId", sql.Int, actorUserId)
      .input("activityType", sql.VarChar(50), activityType)
      .input("changesJson", sql.NVarChar(sql.MAX), changes ? JSON.stringify(changes) : null)
      .query(`
        INSERT INTO dbo.TM_meeting_activity (
          meeting_id,
          actor_user_id,
          activity_type,
          changes_json
        )
        VALUES (
          @meetingId,
          @actorUserId,
          @activityType,
          @changesJson
        );
      `);
  },
};

