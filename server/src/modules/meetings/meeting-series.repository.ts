import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { normalizeSqlRowVersion } from "../../shared/utils/sql-row-version.js";
import type {
  MeetingSeriesCreationMode,
  MeetingSeriesExistingIdentity,
  MeetingSeriesIdentity,
  MeetingSeriesOccurrenceSource,
  MeetingSeriesDerivedState,
  MeetingSeriesListItem,
  MeetingSeriesListResult,
  MeetingSeriesMemberSummary,
  MeetingSeriesMembershipLink,
} from "./meeting-series.types.js";


interface SeriesListRecord {
  seriesId: number | string;
  creationMode: MeetingSeriesCreationMode;
  title: string;
  createdAtUtc: Date;
  originalStartAtUtc: Date;
  originalEndAtUtc: Date;
  meetingCount: number | string;
  upcomingCount: number | string;
  cancelledCount: number | string;
  customizedCount: number | string;
  state: MeetingSeriesDerivedState;
  nextMeetingId: number | string | null;
  nextTitle: string | null;
  nextStatus: "PENDING_APPROVAL" | "SCHEDULED" | "REJECTED" | "CANCELLED" | null;
  nextStartAtUtc: Date | null;
  nextEndAtUtc: Date | null;
  nextRoomId: number | string | null;
  nextRoomNameAr: string | null;
  nextRoomNameEn: string | null;
  totalCount: number | string;
}

export interface MeetingSeriesDetailRecord {
  seriesId: number;
  createdByUserId: number;
  creationMode: MeetingSeriesCreationMode;
  recurrenceDefinitionJson: string;
  defaultsJson: string;
  timeZone: string;
  createdAtUtc: Date;
  rowVersion: string;
}

interface RawSeriesDetailRecord {
  seriesId: number | string;
  createdByUserId: number;
  creationMode: MeetingSeriesCreationMode;
  recurrenceDefinitionJson: string;
  defaultsJson: string;
  timeZone: string;
  createdAtUtc: Date;
  rowVersion: unknown;
}

interface RawSeriesMemberRecord {
  meetingId: number | string;
  sequenceNumber: number;
  occurrenceKey: string;
  sourceType: MeetingSeriesOccurrenceSource;
  title: string;
  description: string | null;
  status: "PENDING_APPROVAL" | "SCHEDULED" | "REJECTED" | "CANCELLED";
  currentStartAtUtc: Date | null;
  currentEndAtUtc: Date | null;
  currentRoomId: number | string | null;
  currentRoomNameAr: string | null;
  currentRoomNameEn: string | null;
  originalStartAtUtc: Date | null;
  originalEndAtUtc: Date | null;
  initialStartAtUtc: Date;
  initialEndAtUtc: Date;
  initialRoomId: number | string;
  initialRoomNameAr: string;
  initialRoomNameEn: string;
  customizationJson: string | null;
}

interface PortalParticipantRecord {
  userId: number;
  userCode: string;
  userName: string;
}

interface SeriesMembershipLinkRecord {
  seriesId: number | string;
  seriesTitle: string;
  sequenceNumber: number;
  meetingCount: number | string;
}

interface AppLockRecord {
  lockResult: number;
}

interface ExistingSeriesRecord {
  seriesId: number | string;
  createdByUserId: number;
  creationRequestId: string;
  requestFingerprint: string;
  rowVersion: unknown;
}

interface SeriesIdentityRecord {
  seriesId: number | string;
  creationRequestId: string;
  rowVersion: unknown;
}

interface SeriesMeetingRecord {
  meetingId: number | string;
}

export interface MeetingSeriesAttachmentTarget {
  meetingId: number;
  occurrenceKey: string;
}

export interface MeetingSeriesAttachmentReplayTarget extends MeetingSeriesAttachmentTarget {
  attachmentScope: "COMMON" | "OCCURRENCE";
  attachmentOccurrenceKey: string | null;
}

function mapExistingSeries(record: ExistingSeriesRecord | undefined): MeetingSeriesExistingIdentity | null {
  if (!record) return null;
  const rowVersion = normalizeSqlRowVersion(record.rowVersion);
  if (!rowVersion) return null;

  return {
    seriesId: Number(record.seriesId),
    createdByUserId: Number(record.createdByUserId),
    creationRequestId: record.creationRequestId.toLowerCase(),
    requestFingerprint: record.requestFingerprint,
    rowVersion,
  };
}

export const meetingSeriesRepository = {
  async acquireCreationRequestLock(
    transaction: DatabaseTransaction,
    actorUserId: number,
    creationRequestId: string,
  ): Promise<number> {
    const resource = `TaskHub:MeetingSeriesRequest:${actorUserId}:${creationRequestId}`;
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

  async acquireAttachmentRequestLock(
    transaction: DatabaseTransaction,
    actorUserId: number,
    seriesId: number,
    attachmentRequestId: string,
  ): Promise<number> {
    const resource = `TaskHub:MeetingSeriesAttachment:${actorUserId}:${seriesId}:${attachmentRequestId}`;
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

  async findByCreationRequestId(
    transaction: DatabaseTransaction,
    actorUserId: number,
    creationRequestId: string,
  ): Promise<MeetingSeriesExistingIdentity | null> {
    const result = await transaction
      .request()
      .input("actorUserId", sql.Int, actorUserId)
      .input("creationRequestId", sql.UniqueIdentifier, creationRequestId)
      .query<ExistingSeriesRecord>(`
        SELECT TOP (1)
          id AS seriesId,
          created_by_user_id AS createdByUserId,
          creation_request_id AS creationRequestId,
          request_fingerprint AS requestFingerprint,
          row_version AS rowVersion
        FROM dbo.TM_meeting_series
        WHERE created_by_user_id = @actorUserId
          AND creation_request_id = @creationRequestId;
      `);

    return mapExistingSeries(result.recordset[0]);
  },

  async createSeries(
    transaction: DatabaseTransaction,
    input: {
      actorUserId: number;
      creationRequestId: string;
      requestFingerprint: string;
      creationMode: MeetingSeriesCreationMode;
      recurrenceDefinitionJson: string;
      defaultsJson: string;
      timeZone: string;
    },
  ): Promise<MeetingSeriesIdentity | null> {
    const result = await transaction
      .request()
      .input("actorUserId", sql.Int, input.actorUserId)
      .input("creationRequestId", sql.UniqueIdentifier, input.creationRequestId)
      .input("requestFingerprint", sql.Char(64), input.requestFingerprint)
      .input("creationMode", sql.VarChar(20), input.creationMode)
      .input("recurrenceDefinitionJson", sql.NVarChar(sql.MAX), input.recurrenceDefinitionJson)
      .input("defaultsJson", sql.NVarChar(sql.MAX), input.defaultsJson)
      .input("timeZone", sql.VarChar(64), input.timeZone)
      .query<SeriesIdentityRecord>(`
        INSERT INTO dbo.TM_meeting_series (
          created_by_user_id,
          creation_request_id,
          request_fingerprint,
          creation_mode,
          recurrence_definition_json,
          defaults_json,
          time_zone
        )
        OUTPUT
          inserted.id AS seriesId,
          inserted.creation_request_id AS creationRequestId,
          inserted.row_version AS rowVersion
        VALUES (
          @actorUserId,
          @creationRequestId,
          @requestFingerprint,
          @creationMode,
          @recurrenceDefinitionJson,
          @defaultsJson,
          @timeZone
        );
      `);

    const record = result.recordset[0];
    if (!record) return null;
    const rowVersion = normalizeSqlRowVersion(record.rowVersion);
    if (!rowVersion) return null;

    return {
      seriesId: Number(record.seriesId),
      creationRequestId: record.creationRequestId.toLowerCase(),
      rowVersion,
    };
  },

  async addMember(
    transaction: DatabaseTransaction,
    input: {
      seriesId: number;
      meetingId: number;
      sequenceNumber: number;
      occurrenceKey: string;
      sourceType: MeetingSeriesOccurrenceSource;
      originalStartAtUtc: Date | null;
      originalEndAtUtc: Date | null;
      initialStartAtUtc: Date;
      initialEndAtUtc: Date;
      initialRoomId: number;
      customizationJson: string | null;
    },
  ): Promise<void> {
    await transaction
      .request()
      .input("seriesId", sql.BigInt, input.seriesId)
      .input("meetingId", sql.BigInt, input.meetingId)
      .input("sequenceNumber", sql.Int, input.sequenceNumber)
      .input("occurrenceKey", sql.NVarChar(120), input.occurrenceKey)
      .input("sourceType", sql.VarChar(20), input.sourceType)
      .input("originalStartAtUtc", sql.DateTime2(3), input.originalStartAtUtc)
      .input("originalEndAtUtc", sql.DateTime2(3), input.originalEndAtUtc)
      .input("initialStartAtUtc", sql.DateTime2(3), input.initialStartAtUtc)
      .input("initialEndAtUtc", sql.DateTime2(3), input.initialEndAtUtc)
      .input("initialRoomId", sql.BigInt, input.initialRoomId)
      .input("customizationJson", sql.NVarChar(sql.MAX), input.customizationJson)
      .query(`
        INSERT INTO dbo.TM_meeting_series_members (
          series_id,
          meeting_id,
          sequence_number,
          occurrence_key,
          source_type,
          original_start_at_utc,
          original_end_at_utc,
          initial_start_at_utc,
          initial_end_at_utc,
          initial_room_id,
          customization_json
        )
        VALUES (
          @seriesId,
          @meetingId,
          @sequenceNumber,
          @occurrenceKey,
          @sourceType,
          @originalStartAtUtc,
          @originalEndAtUtc,
          @initialStartAtUtc,
          @initialEndAtUtc,
          @initialRoomId,
          @customizationJson
        );
      `);
  },

  async listMeetingIds(
    transaction: DatabaseTransaction,
    seriesId: number,
  ): Promise<number[]> {
    const result = await transaction
      .request()
      .input("seriesId", sql.BigInt, seriesId)
      .query<SeriesMeetingRecord>(`
        SELECT meeting_id AS meetingId
        FROM dbo.TM_meeting_series_members
        WHERE series_id = @seriesId
        ORDER BY sequence_number ASC;
      `);

    return result.recordset.map((record) => Number(record.meetingId));
  },

  async listOwnedAttachmentTargets(
    transaction: DatabaseTransaction,
    actorUserId: number,
    seriesId: number,
    occurrenceKey: string | null,
  ): Promise<MeetingSeriesAttachmentTarget[]> {
    const result = await transaction
      .request()
      .input("actorUserId", sql.Int, actorUserId)
      .input("seriesId", sql.BigInt, seriesId)
      .input("occurrenceKey", sql.NVarChar(120), occurrenceKey)
      .query<{ meetingId: number | string; occurrenceKey: string }>(`
        SELECT sm.meeting_id AS meetingId, sm.occurrence_key AS occurrenceKey
        FROM dbo.TM_meeting_series AS s WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.TM_meeting_series_members AS sm ON sm.series_id = s.id
        WHERE s.id = @seriesId
          AND s.created_by_user_id = @actorUserId
          AND (@occurrenceKey IS NULL OR sm.occurrence_key = @occurrenceKey)
        ORDER BY sm.sequence_number, sm.meeting_id;
      `);
    return result.recordset.map((row) => ({ meetingId: Number(row.meetingId), occurrenceKey: row.occurrenceKey }));
  },

  async listSeriesAttachmentTargetsByRequestId(
    transaction: DatabaseTransaction,
    actorUserId: number,
    seriesId: number,
    attachmentRequestId: string,
  ): Promise<MeetingSeriesAttachmentReplayTarget[]> {
    const result = await transaction
      .request()
      .input("actorUserId", sql.Int, actorUserId)
      .input("seriesId", sql.BigInt, seriesId)
      .input("attachmentRequestId", sql.UniqueIdentifier, attachmentRequestId)
      .query<{
        meetingId: number | string;
        occurrenceKey: string;
        attachmentScope: "COMMON" | "OCCURRENCE";
        attachmentOccurrenceKey: string | null;
      }>(`
        SELECT
          sm.meeting_id AS meetingId,
          sm.occurrence_key AS occurrenceKey,
          attachment.series_attachment_scope AS attachmentScope,
          attachment.series_occurrence_key AS attachmentOccurrenceKey
        FROM dbo.TM_meeting_series AS s
        INNER JOIN dbo.TM_meeting_series_members AS sm ON sm.series_id = s.id
        INNER JOIN dbo.TM_meeting_attachments AS attachment
          ON attachment.meeting_id = sm.meeting_id
         AND attachment.series_attachment_request_id = @attachmentRequestId
         AND attachment.is_active = 1
        WHERE s.id = @seriesId
          AND s.created_by_user_id = @actorUserId
        ORDER BY sm.sequence_number, sm.meeting_id;
      `);
    return result.recordset.map((row) => ({
      meetingId: Number(row.meetingId),
      occurrenceKey: row.occurrenceKey,
      attachmentScope: row.attachmentScope,
      attachmentOccurrenceKey: row.attachmentOccurrenceKey,
    }));
  },

  async markOccurrenceAttachmentCustomized(
    transaction: DatabaseTransaction,
    seriesId: number,
    occurrenceKey: string,
  ): Promise<void> {
    await transaction
      .request()
      .input("seriesId", sql.BigInt, seriesId)
      .input("occurrenceKey", sql.NVarChar(120), occurrenceKey)
      .query(`
        UPDATE dbo.TM_meeting_series_members
        SET customization_json = CASE
          WHEN customization_json IS NULL THEN N'{"overrideKinds":["ATTACHMENTS"],"attachmentCustomized":true}'
          WHEN EXISTS (
            SELECT 1
            FROM OPENJSON(customization_json, '$.overrideKinds') AS overrideKind
            WHERE overrideKind.[value] = N'ATTACHMENTS'
          ) THEN JSON_MODIFY(customization_json, '$.attachmentCustomized', CAST(1 AS bit))
          ELSE JSON_MODIFY(
            JSON_MODIFY(customization_json, 'append $.overrideKinds', N'ATTACHMENTS'),
            '$.attachmentCustomized',
            CAST(1 AS bit)
          )
        END
        WHERE series_id = @seriesId AND occurrence_key = @occurrenceKey;
      `);
  },



  async listCreatedByUser(input: {
    actorUserId: number;
    search: string | null;
    state: "ALL" | MeetingSeriesDerivedState;
    page: number;
    pageSize: number;
  }): Promise<MeetingSeriesListResult> {
    const pool = await getDatabasePool();
    const offset = (input.page - 1) * input.pageSize;
    const result = await pool
      .request()
      .input("actorUserId", sql.Int, input.actorUserId)
      .input("search", sql.NVarChar(250), input.search)
      .input("state", sql.VarChar(30), input.state)
      .input("offset", sql.Int, offset)
      .input("pageSize", sql.Int, input.pageSize)
      .query<SeriesListRecord>(`
        WITH series_aggregate AS (
          SELECT
            s.id AS seriesId,
            s.creation_mode AS creationMode,
            COALESCE(NULLIF(JSON_VALUE(s.defaults_json, '$.title'), ''), N'Meeting Series') AS title,
            s.created_at_utc AS createdAtUtc,
            MIN(sm.initial_start_at_utc) AS originalStartAtUtc,
            MAX(sm.initial_end_at_utc) AS originalEndAtUtc,
            COUNT_BIG(sm.meeting_id) AS meetingCount,
            SUM(CASE
                  WHEN m.status = 'SCHEDULED'
                   AND currentRevision.start_at_utc >= SYSUTCDATETIME()
                  THEN 1 ELSE 0
                END) AS upcomingCount,
            SUM(CASE WHEN m.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelledCount,
            SUM(CASE WHEN sm.customization_json IS NOT NULL THEN 1 ELSE 0 END) AS customizedCount
          FROM dbo.TM_meeting_series AS s
          INNER JOIN dbo.TM_meeting_series_members AS sm
            ON sm.series_id = s.id
          INNER JOIN dbo.TM_meetings AS m
            ON m.id = sm.meeting_id
          LEFT JOIN dbo.TM_meeting_revisions AS currentRevision
            ON currentRevision.id = m.current_revision_id
           AND currentRevision.meeting_id = m.id
          WHERE s.created_by_user_id = @actorUserId
          GROUP BY
            s.id,
            s.creation_mode,
            s.defaults_json,
            s.created_at_utc
        ),
        filtered AS (
          SELECT
            aggregate.*,
            CAST(CASE
              WHEN aggregate.meetingCount > 0
               AND aggregate.cancelledCount = aggregate.meetingCount THEN 'ALL_CANCELLED'
              WHEN aggregate.upcomingCount > 0 THEN 'UPCOMING'
              ELSE 'COMPLETED'
            END AS VARCHAR(30)) AS state
          FROM series_aggregate AS aggregate
        )
        SELECT
          filtered.*,
          nextMeeting.meetingId AS nextMeetingId,
          nextMeeting.title AS nextTitle,
          nextMeeting.status AS nextStatus,
          nextMeeting.startAtUtc AS nextStartAtUtc,
          nextMeeting.endAtUtc AS nextEndAtUtc,
          nextMeeting.roomId AS nextRoomId,
          nextMeeting.roomNameAr AS nextRoomNameAr,
          nextMeeting.roomNameEn AS nextRoomNameEn,
          COUNT_BIG(1) OVER() AS totalCount
        FROM filtered
        OUTER APPLY (
          SELECT TOP (1)
            m2.id AS meetingId,
            m2.title,
            m2.status,
            r2.start_at_utc AS startAtUtc,
            r2.end_at_utc AS endAtUtc,
            room.id AS roomId,
            room.name_ar AS roomNameAr,
            room.name_en AS roomNameEn
          FROM dbo.TM_meeting_series_members AS sm2
          INNER JOIN dbo.TM_meetings AS m2
            ON m2.id = sm2.meeting_id
          INNER JOIN dbo.TM_meeting_revisions AS r2
            ON r2.id = m2.current_revision_id
           AND r2.meeting_id = m2.id
          INNER JOIN dbo.TM_meeting_rooms AS room
            ON room.id = r2.room_id
          WHERE sm2.series_id = filtered.seriesId
            AND m2.status = 'SCHEDULED'
            AND r2.start_at_utc >= SYSUTCDATETIME()
          ORDER BY r2.start_at_utc, m2.id
        ) AS nextMeeting
        WHERE (@search IS NULL OR filtered.title LIKE N'%' + @search + N'%')
          AND (@state = 'ALL' OR filtered.state = @state)
        ORDER BY filtered.createdAtUtc DESC, filtered.seriesId DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
      `);

    const items: MeetingSeriesListItem[] = result.recordset.map((record) => ({
      seriesId: Number(record.seriesId),
      creationMode: record.creationMode,
      title: record.title,
      createdAtUtc: record.createdAtUtc.toISOString(),
      originalStartAtUtc: record.originalStartAtUtc.toISOString(),
      originalEndAtUtc: record.originalEndAtUtc.toISOString(),
      meetingCount: Number(record.meetingCount),
      upcomingCount: Number(record.upcomingCount),
      cancelledCount: Number(record.cancelledCount),
      customizedCount: Number(record.customizedCount),
      state: record.state,
      nextMeeting:
        record.nextMeetingId !== null && record.nextStartAtUtc && record.nextEndAtUtc && record.nextRoomId !== null
          ? {
              meetingId: Number(record.nextMeetingId),
              title: record.nextTitle ?? record.title,
              status: record.nextStatus ?? "SCHEDULED",
              startAtUtc: record.nextStartAtUtc.toISOString(),
              endAtUtc: record.nextEndAtUtc.toISOString(),
              roomId: Number(record.nextRoomId),
              roomNameAr: record.nextRoomNameAr ?? "",
              roomNameEn: record.nextRoomNameEn ?? "",
            }
          : null,
    }));

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total: Number(result.recordset[0]?.totalCount ?? 0),
    };
  },

  async findDetailRecord(actorUserId: number, seriesId: number): Promise<MeetingSeriesDetailRecord | null> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("actorUserId", sql.Int, actorUserId)
      .input("seriesId", sql.BigInt, seriesId)
      .query<RawSeriesDetailRecord>(`
        SELECT TOP (1)
          s.id AS seriesId,
          s.created_by_user_id AS createdByUserId,
          s.creation_mode AS creationMode,
          s.recurrence_definition_json AS recurrenceDefinitionJson,
          s.defaults_json AS defaultsJson,
          s.time_zone AS timeZone,
          s.created_at_utc AS createdAtUtc,
          s.row_version AS rowVersion
        FROM dbo.TM_meeting_series AS s
        WHERE s.id = @seriesId
          AND s.created_by_user_id = @actorUserId;
      `);

    const record = result.recordset[0];
    if (!record) return null;
    const rowVersion = normalizeSqlRowVersion(record.rowVersion);
    if (!rowVersion) return null;
    return {
      seriesId: Number(record.seriesId),
      createdByUserId: Number(record.createdByUserId),
      creationMode: record.creationMode,
      recurrenceDefinitionJson: record.recurrenceDefinitionJson,
      defaultsJson: record.defaultsJson,
      timeZone: record.timeZone,
      createdAtUtc: record.createdAtUtc,
      rowVersion,
    };
  },

  async listMembers(seriesId: number): Promise<MeetingSeriesMemberSummary[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("seriesId", sql.BigInt, seriesId)
      .query<RawSeriesMemberRecord>(`
        SELECT
          sm.meeting_id AS meetingId,
          sm.sequence_number AS sequenceNumber,
          sm.occurrence_key AS occurrenceKey,
          sm.source_type AS sourceType,
          m.title,
          m.description,
          m.status,
          currentRevision.start_at_utc AS currentStartAtUtc,
          currentRevision.end_at_utc AS currentEndAtUtc,
          currentRoom.id AS currentRoomId,
          currentRoom.name_ar AS currentRoomNameAr,
          currentRoom.name_en AS currentRoomNameEn,
          sm.original_start_at_utc AS originalStartAtUtc,
          sm.original_end_at_utc AS originalEndAtUtc,
          sm.initial_start_at_utc AS initialStartAtUtc,
          sm.initial_end_at_utc AS initialEndAtUtc,
          sm.initial_room_id AS initialRoomId,
          initialRoom.name_ar AS initialRoomNameAr,
          initialRoom.name_en AS initialRoomNameEn,
          sm.customization_json AS customizationJson
        FROM dbo.TM_meeting_series_members AS sm
        INNER JOIN dbo.TM_meetings AS m
          ON m.id = sm.meeting_id
        LEFT JOIN dbo.TM_meeting_revisions AS currentRevision
          ON currentRevision.id = m.current_revision_id
         AND currentRevision.meeting_id = m.id
        LEFT JOIN dbo.TM_meeting_rooms AS currentRoom
          ON currentRoom.id = currentRevision.room_id
        INNER JOIN dbo.TM_meeting_rooms AS initialRoom
          ON initialRoom.id = sm.initial_room_id
        WHERE sm.series_id = @seriesId
        ORDER BY sm.sequence_number, sm.meeting_id;
      `);

    return result.recordset.map((record) => ({
      meetingId: Number(record.meetingId),
      sequenceNumber: record.sequenceNumber,
      occurrenceKey: record.occurrenceKey,
      sourceType: record.sourceType,
      title: record.title,
      description: record.description,
      status: record.status,
      currentStartAtUtc: record.currentStartAtUtc?.toISOString() ?? null,
      currentEndAtUtc: record.currentEndAtUtc?.toISOString() ?? null,
      currentRoomId: record.currentRoomId === null ? null : Number(record.currentRoomId),
      currentRoomNameAr: record.currentRoomNameAr,
      currentRoomNameEn: record.currentRoomNameEn,
      originalStartAtUtc: record.originalStartAtUtc?.toISOString() ?? null,
      originalEndAtUtc: record.originalEndAtUtc?.toISOString() ?? null,
      initialStartAtUtc: record.initialStartAtUtc.toISOString(),
      initialEndAtUtc: record.initialEndAtUtc.toISOString(),
      initialRoomId: Number(record.initialRoomId),
      initialRoomNameAr: record.initialRoomNameAr,
      initialRoomNameEn: record.initialRoomNameEn,
      customizationJson: record.customizationJson,
      wasCustomizedAtCreation: record.customizationJson !== null,
    }));
  },

  async listPortalParticipants(userIds: readonly number[]): Promise<Array<{ userId: number; userCode: string; userName: string }>> {
    if (userIds.length === 0) return [];
    const pool = await getDatabasePool();
    const request = pool.request();
    const placeholders = userIds.map((userId, index) => {
      request.input(`userId${index}`, sql.Int, userId);
      return `@userId${index}`;
    });
    const result = await request.query<PortalParticipantRecord>(`
      SELECT
        USER_ID AS userId,
        USER_CODE AS userCode,
        USER_NAME AS userName
      FROM dbo.users
      WHERE USER_ID IN (${placeholders.join(", ")})
      ORDER BY USER_NAME, USER_ID;
    `);
    return result.recordset.map((record) => ({
      userId: Number(record.userId),
      userCode: record.userCode,
      userName: record.userName,
    }));
  },

  async findMembershipLink(actorUserId: number, meetingId: number): Promise<MeetingSeriesMembershipLink | null> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("actorUserId", sql.Int, actorUserId)
      .input("meetingId", sql.BigInt, meetingId)
      .query<SeriesMembershipLinkRecord>(`
        SELECT TOP (1)
          s.id AS seriesId,
          COALESCE(NULLIF(JSON_VALUE(s.defaults_json, '$.title'), ''), N'Meeting Series') AS seriesTitle,
          sm.sequence_number AS sequenceNumber,
          (SELECT COUNT_BIG(1) FROM dbo.TM_meeting_series_members AS allMembers WHERE allMembers.series_id = s.id) AS meetingCount
        FROM dbo.TM_meeting_series_members AS sm
        INNER JOIN dbo.TM_meeting_series AS s
          ON s.id = sm.series_id
        WHERE sm.meeting_id = @meetingId
          AND s.created_by_user_id = @actorUserId;
      `);
    const record = result.recordset[0];
    if (!record) return null;
    return {
      seriesId: Number(record.seriesId),
      seriesTitle: record.seriesTitle,
      sequenceNumber: record.sequenceNumber,
      meetingCount: Number(record.meetingCount),
    };
  },

};


