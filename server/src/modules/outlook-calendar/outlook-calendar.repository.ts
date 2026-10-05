import os from "node:os";

import { getDatabasePool, sql } from "../../database/sql.js";
import type {
  OutlookCalendarFoundationState,
  OutlookMeetingProjection,
  OutlookSyncJobRecord,
  OutlookSyncStatusView,
} from "./outlook-calendar.types.js";

interface InstalledRow { installed: boolean; }
interface ConfigRow {
  databaseEnabled: boolean;
  activatedAtUtc: Date | null;
  lastWorkerAtUtc: Date | null;
  lastPollAtUtc: Date | null;
}
interface MappingRow {
  meetingId: number | string;
  organizerUserId: number | string;
  organizerEmailSnapshot: string | null;
  organizerUserPrincipalName: string | null;
  eventGeneration: number | string;
  createTransactionId: string;
  graphEventId: string | null;
  graphChangeKey: string | null;
  graphIcalUid: string | null;
  graphWebLink: string | null;
  desiredRevisionId: number | string | null;
  syncedRevisionId: number | string | null;
  syncStatus: OutlookSyncStatusView["status"];
  missingEmailParticipantCount: number | string;
  lastSyncedAtUtc: Date | null;
  lastCheckedAtUtc: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastObservedProjectionJson: string | null;
}
interface JobRow {
  id: number | string;
  meetingId: number | string;
  operation: OutlookSyncJobRecord["operation"];
  targetRevisionId: number | string | null;
  attemptCount: number | string;
}
interface ProjectionRow {
  meetingId: number | string;
  title: string;
  description: string | null;
  status: "SCHEDULED" | "CANCELLED" | "PENDING_APPROVAL" | "REJECTED";
  organizerUserId: number | string;
  organizerName: string;
  organizerEmail: string | null;
  revisionId: number | string | null;
  meetingMode: "ROOM" | "ZOOM" | null;
  roomNameAr: string | null;
  roomNameEn: string | null;
  roomLocationText: string | null;
  onlineJoinUrl: string | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  attendeesJson: string | null;
}
interface AttendeeJson { userId: number; userName: string; email: string | null; }

function mapFoundation(row: ConfigRow | undefined): OutlookCalendarFoundationState {
  if (!row) return { installed: false, databaseEnabled: false, activatedAtUtc: null, lastWorkerAtUtc: null, lastPollAtUtc: null };
  return {
    installed: true,
    databaseEnabled: Boolean(row.databaseEnabled),
    activatedAtUtc: row.activatedAtUtc?.toISOString() ?? null,
    lastWorkerAtUtc: row.lastWorkerAtUtc?.toISOString() ?? null,
    lastPollAtUtc: row.lastPollAtUtc?.toISOString() ?? null,
  };
}

function mapStatus(row: MappingRow | undefined): OutlookSyncStatusView | null {
  if (!row) return null;
  return {
    meetingId: Number(row.meetingId),
    organizerUserId: Number(row.organizerUserId),
    organizerEmail: row.organizerEmailSnapshot,
    organizerUserPrincipalName: row.organizerUserPrincipalName,
    status: row.syncStatus,
    graphWebLink: row.graphWebLink,
    desiredRevisionId: row.desiredRevisionId === null ? null : Number(row.desiredRevisionId),
    syncedRevisionId: row.syncedRevisionId === null ? null : Number(row.syncedRevisionId),
    missingEmailParticipantCount: Number(row.missingEmailParticipantCount),
    lastSyncedAtUtc: row.lastSyncedAtUtc?.toISOString() ?? null,
    lastCheckedAtUtc: row.lastCheckedAtUtc?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    differences: [],
  };
}

function parseAttendees(value: string | null): OutlookMeetingProjection["attendees"] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item): OutlookMeetingProjection["attendees"] => {
    if (typeof item !== "object" || item === null) return [];
    const row = item as Partial<AttendeeJson>;
    if (typeof row.userId !== "number" || typeof row.userName !== "string") return [];
    return [{ userId: row.userId, userName: row.userName, email: typeof row.email === "string" && row.email.trim() ? row.email.trim() : null }];
  });
}

export const outlookCalendarRepository = {
  workerId(): string { return `${os.hostname()}:${process.pid}`.slice(0, 160); },

  async foundationState(): Promise<OutlookCalendarFoundationState> {
    const pool = await getDatabasePool();
    const installedResult = await pool.request().query<InstalledRow>(`
      SELECT CAST(CASE WHEN OBJECT_ID(N'dbo.TM_meeting_outlook_sync_config', N'U') IS NOT NULL
        AND OBJECT_ID(N'dbo.TM_meeting_outlook_sync', N'U') IS NOT NULL
        AND OBJECT_ID(N'dbo.TM_meeting_outlook_sync_jobs', N'U') IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS installed;
    `);
    if (!installedResult.recordset[0]?.installed) return mapFoundation(undefined);
    const configResult = await pool.request().query<ConfigRow>(`
      SELECT CAST(is_enabled AS BIT) AS databaseEnabled, activated_at_utc AS activatedAtUtc,
        last_worker_at_utc AS lastWorkerAtUtc, last_poll_at_utc AS lastPollAtUtc
      FROM dbo.TM_meeting_outlook_sync_config WHERE id = 1;
    `);
    return mapFoundation(configResult.recordset[0]);
  },

  async activateAndTouchWorker(): Promise<boolean> {
    const pool = await getDatabasePool();
    const result = await pool.request().query<{ enabled: boolean }>(`
      UPDATE dbo.TM_meeting_outlook_sync_config
      SET activated_at_utc = COALESCE(activated_at_utc, SYSUTCDATETIME()),
          last_worker_at_utc = SYSUTCDATETIME(), updated_at_utc = SYSUTCDATETIME()
      OUTPUT CAST(inserted.is_enabled AS BIT) AS enabled
      WHERE id = 1;
    `);
    return Boolean(result.recordset[0]?.enabled);
  },

  async enqueueScheduled(meetingId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("meetingId", sql.BigInt, meetingId).query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @revisionId BIGINT, @organizerUserId INT, @graphEventId NVARCHAR(1024), @operation VARCHAR(20), @syncStatus VARCHAR(30), @eventGeneration INT;
      SELECT @revisionId = m.current_revision_id, @organizerUserId = m.organizer_user_id
      FROM dbo.TM_meetings AS m WITH (UPDLOCK, HOLDLOCK)
      WHERE m.id = @meetingId AND m.status = 'SCHEDULED' AND m.current_revision_id IS NOT NULL;
      IF @revisionId IS NULL BEGIN COMMIT; RETURN; END;

      IF NOT EXISTS (SELECT 1 FROM dbo.TM_meeting_outlook_sync WHERE meeting_id = @meetingId)
        INSERT dbo.TM_meeting_outlook_sync (meeting_id, organizer_user_id, desired_revision_id)
        VALUES (@meetingId, @organizerUserId, @revisionId);
      ELSE
        UPDATE dbo.TM_meeting_outlook_sync
        SET organizer_user_id = @organizerUserId, desired_revision_id = @revisionId,
            last_error_code = NULL, last_error_message = NULL, updated_at_utc = SYSUTCDATETIME()
        WHERE meeting_id = @meetingId;

      SELECT @graphEventId = graph_event_id, @syncStatus = sync_status, @eventGeneration = event_generation
      FROM dbo.TM_meeting_outlook_sync WITH (UPDLOCK, HOLDLOCK)
      WHERE meeting_id = @meetingId;

      IF @syncStatus = 'OUTLOOK_DELETED'
      BEGIN
        UPDATE dbo.TM_meeting_outlook_sync
        SET graph_event_id = NULL,
            graph_change_key = NULL,
            graph_ical_uid = NULL,
            graph_web_link = NULL,
            event_generation = event_generation + 1,
            create_transaction_id = NEWID(),
            sync_status = 'NOT_SYNCED',
            outlook_deleted_at_utc = NULL,
            external_change_detected_at_utc = NULL,
            updated_at_utc = SYSUTCDATETIME()
        WHERE meeting_id = @meetingId;
        SET @graphEventId = NULL;
        SET @eventGeneration = @eventGeneration + 1;
        SET @operation = 'RECREATE';
      END
      ELSE
        SET @operation = CASE WHEN @graphEventId IS NULL THEN 'CREATE' ELSE 'UPDATE' END;
      DECLARE @dedupe VARCHAR(250) = CONCAT('OUTLOOK:', @operation, ':', @meetingId, ':', @revisionId, ':', CASE WHEN @operation = 'RECREATE' THEN CONVERT(VARCHAR(20), @eventGeneration) ELSE '0' END);
      IF NOT EXISTS (SELECT 1 FROM dbo.TM_meeting_outlook_sync_jobs WITH (UPDLOCK, HOLDLOCK) WHERE dedupe_key = @dedupe)
        INSERT dbo.TM_meeting_outlook_sync_jobs (meeting_id, operation, trigger_type, target_revision_id, requested_by_user_id, dedupe_key)
        VALUES (@meetingId, @operation, 'LIFECYCLE', @revisionId, NULL, @dedupe);
      COMMIT;
    `);
  },

  async enqueueCancellation(meetingId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("meetingId", sql.BigInt, meetingId).query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @graphEventId NVARCHAR(1024), @revisionId BIGINT, @syncStatus VARCHAR(30);
      SELECT @graphEventId = graph_event_id, @revisionId = desired_revision_id, @syncStatus = sync_status
      FROM dbo.TM_meeting_outlook_sync WITH (UPDLOCK, HOLDLOCK) WHERE meeting_id = @meetingId;
      UPDATE dbo.TM_meeting_outlook_sync_jobs
      SET status = 'CANCELED', locked_at_utc = NULL, locked_by = NULL, completed_at_utc = SYSUTCDATETIME(), updated_at_utc = SYSUTCDATETIME()
      WHERE meeting_id = @meetingId AND status = 'PENDING' AND operation IN ('CREATE', 'UPDATE', 'RESTORE', 'RECREATE');
      IF @graphEventId IS NULL OR @syncStatus = 'OUTLOOK_DELETED'
      BEGIN
        UPDATE dbo.TM_meeting_outlook_sync SET sync_status = 'IN_SYNC', last_synced_at_utc = SYSUTCDATETIME(),
          last_error_code = NULL, last_error_message = NULL, updated_at_utc = SYSUTCDATETIME() WHERE meeting_id = @meetingId;
        COMMIT; RETURN;
      END;
      DECLARE @dedupe VARCHAR(250) = CONCAT('OUTLOOK:CANCEL:', @meetingId, ':', COALESCE(CONVERT(VARCHAR(30), @revisionId), '0'));
      IF NOT EXISTS (SELECT 1 FROM dbo.TM_meeting_outlook_sync_jobs WITH (UPDLOCK, HOLDLOCK) WHERE dedupe_key = @dedupe)
        INSERT dbo.TM_meeting_outlook_sync_jobs (meeting_id, operation, trigger_type, target_revision_id, requested_by_user_id, dedupe_key)
        VALUES (@meetingId, 'CANCEL', 'LIFECYCLE', @revisionId, NULL, @dedupe);
      COMMIT;
    `);
  },

  async retry(meetingId: number, requestedByUserId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("meetingId", sql.BigInt, meetingId).input("requestedBy", sql.Int, requestedByUserId).query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @eventId NVARCHAR(1024), @revisionId BIGINT, @meetingStatus VARCHAR(30), @operation VARCHAR(20), @organizerUserId INT;
      SELECT @revisionId = m.current_revision_id, @meetingStatus = m.status, @organizerUserId = m.organizer_user_id
      FROM dbo.TM_meetings AS m WITH (UPDLOCK, HOLDLOCK) WHERE m.id = @meetingId;
      IF @revisionId IS NULL OR @meetingStatus NOT IN ('SCHEDULED', 'CANCELLED') BEGIN COMMIT; RETURN; END;
      IF NOT EXISTS (SELECT 1 FROM dbo.TM_meeting_outlook_sync WHERE meeting_id = @meetingId)
        INSERT dbo.TM_meeting_outlook_sync (meeting_id, organizer_user_id, desired_revision_id)
        VALUES (@meetingId, @organizerUserId, @revisionId);
      SELECT @eventId = graph_event_id FROM dbo.TM_meeting_outlook_sync WITH (UPDLOCK, HOLDLOCK) WHERE meeting_id = @meetingId;
      SET @operation = CASE WHEN @meetingStatus = 'CANCELLED' THEN 'CANCEL' WHEN @eventId IS NULL THEN 'CREATE' ELSE 'UPDATE' END;
      DECLARE @dedupe VARCHAR(250) = CONCAT('OUTLOOK:MANUAL:', @operation, ':', @meetingId, ':', @revisionId, ':', NEWID());
      INSERT dbo.TM_meeting_outlook_sync_jobs (meeting_id, operation, trigger_type, target_revision_id, requested_by_user_id, dedupe_key)
      VALUES (@meetingId, @operation, 'MANUAL', @revisionId, @requestedBy, @dedupe);
      UPDATE dbo.TM_meeting_outlook_sync SET sync_status = 'NOT_SYNCED', desired_revision_id = @revisionId,
        last_error_code = NULL, last_error_message = NULL, updated_at_utc = SYSUTCDATETIME() WHERE meeting_id = @meetingId;
      COMMIT;
    `);
  },

  async beginPollRound(intervalMinutes: number): Promise<boolean> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("intervalMinutes", sql.Int, intervalMinutes).query<{ allowed: boolean }>(`
      UPDATE dbo.TM_meeting_outlook_sync_config
      SET last_poll_at_utc = SYSUTCDATETIME(), updated_at_utc = SYSUTCDATETIME()
      OUTPUT CAST(1 AS BIT) AS allowed
      WHERE id = 1
        AND is_enabled = 1
        AND (
          last_poll_at_utc IS NULL
          OR last_poll_at_utc <= DATEADD(MINUTE, -@intervalMinutes, SYSUTCDATETIME())
        );
    `);
    return Boolean(result.recordset[0]?.allowed);
  },

  async pollCandidates(limit = 25): Promise<number[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("limit", sql.Int, limit).query<{ meetingId: number | string }>(`
      SELECT TOP (@limit) sync.meeting_id AS meetingId
      FROM dbo.TM_meeting_outlook_sync AS sync
      INNER JOIN dbo.TM_meetings AS meetingRow
        ON meetingRow.id = sync.meeting_id
      WHERE sync.graph_event_id IS NOT NULL
        AND meetingRow.status = 'SCHEDULED'
        AND sync.sync_status NOT IN ('SYNCING', 'OUTLOOK_DELETED')
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.TM_meeting_outlook_sync_jobs AS job
          WHERE job.meeting_id = sync.meeting_id
            AND job.status IN ('PENDING', 'PROCESSING')
        )
      ORDER BY COALESCE(sync.last_checked_at_utc, CONVERT(DATETIME2(3), '19000101', 112)), sync.meeting_id;
    `);
    return result.recordset.map((row) => Number(row.meetingId));
  },

  async observedProjectionJson(meetingId: number): Promise<string | null> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).query<{ value: string | null }>(`
      SELECT last_observed_projection_json AS value
      FROM dbo.TM_meeting_outlook_sync
      WHERE meeting_id = @meetingId;
    `);
    return result.recordset[0]?.value ?? null;
  },

  async markObserved(input: {
    meetingId: number;
    changed: boolean;
    graphChangeKey: string | null;
    graphWebLink: string | null;
    outlookLastModifiedAtUtc: string | null;
    observedJson: string;
    observedHash: string;
    missingCount: number;
  }): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request()
      .input("meetingId", sql.BigInt, input.meetingId)
      .input("changed", sql.Bit, input.changed)
      .input("changeKey", sql.NVarChar(512), input.graphChangeKey)
      .input("webLink", sql.NVarChar(2048), input.graphWebLink)
      .input("lastModified", sql.DateTime2, input.outlookLastModifiedAtUtc ? new Date(input.outlookLastModifiedAtUtc) : null)
      .input("observedJson", sql.NVarChar(sql.MAX), input.observedJson)
      .input("observedHash", sql.Char(64), input.observedHash)
      .input("missing", sql.Int, input.missingCount)
      .query(`
        UPDATE dbo.TM_meeting_outlook_sync
        SET graph_change_key = COALESCE(@changeKey, graph_change_key),
            graph_web_link = COALESCE(@webLink, graph_web_link),
            outlook_last_modified_at_utc = @lastModified,
            last_observed_projection_json = @observedJson,
            last_observed_projection_hash = @observedHash,
            last_checked_at_utc = SYSUTCDATETIME(),
            missing_email_participant_count = @missing,
            sync_status = CASE
              WHEN @changed = 1 THEN 'OUTLOOK_CHANGED'
              WHEN @missing > 0 THEN 'SYNCED_WITH_WARNINGS'
              ELSE 'IN_SYNC'
            END,
            external_change_detected_at_utc = CASE
              WHEN @changed = 1 THEN COALESCE(external_change_detected_at_utc, SYSUTCDATETIME())
              ELSE NULL
            END,
            outlook_deleted_at_utc = NULL,
            last_error_code = NULL,
            last_error_message = NULL,
            updated_at_utc = SYSUTCDATETIME()
        WHERE meeting_id = @meetingId;
      `);
  },

  async markOutlookDeleted(meetingId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("meetingId", sql.BigInt, meetingId).query(`
      UPDATE dbo.TM_meeting_outlook_sync
      SET sync_status = 'OUTLOOK_DELETED',
          last_checked_at_utc = SYSUTCDATETIME(),
          outlook_deleted_at_utc = COALESCE(outlook_deleted_at_utc, SYSUTCDATETIME()),
          external_change_detected_at_utc = NULL,
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at_utc = SYSUTCDATETIME()
      WHERE meeting_id = @meetingId;
    `);
  },

  async queueRestore(meetingId: number, requestedByUserId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("requestedBy", sql.Int, requestedByUserId)
      .query(`
        SET XACT_ABORT ON;
        BEGIN TRANSACTION;

        DECLARE @revisionId BIGINT, @status VARCHAR(30), @meetingStatus VARCHAR(30);
        SELECT
          @revisionId = sync.desired_revision_id,
          @status = sync.sync_status,
          @meetingStatus = meetingRow.status
        FROM dbo.TM_meeting_outlook_sync AS sync WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.TM_meetings AS meetingRow
          ON meetingRow.id = sync.meeting_id
        WHERE sync.meeting_id = @meetingId;

        IF @status <> 'OUTLOOK_CHANGED' OR @meetingStatus <> 'SCHEDULED' OR @revisionId IS NULL
        BEGIN
          ROLLBACK;
          THROW 54710, 'The Outlook Meeting is not in a restorable changed state.', 1;
        END;

        DECLARE @dedupe VARCHAR(250) =
          CONCAT('OUTLOOK:MANUAL:RESTORE:', @meetingId, ':', @revisionId, ':', NEWID());

        INSERT dbo.TM_meeting_outlook_sync_jobs (
          meeting_id, operation, trigger_type, target_revision_id,
          requested_by_user_id, dedupe_key
        )
        VALUES (
          @meetingId, 'RESTORE', 'MANUAL', @revisionId,
          @requestedBy, @dedupe
        );

        COMMIT;
      `);
  },

  async queueRecreate(meetingId: number, requestedByUserId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("requestedBy", sql.Int, requestedByUserId)
      .query(`
        SET XACT_ABORT ON;
        BEGIN TRANSACTION;

        DECLARE @revisionId BIGINT, @status VARCHAR(30), @meetingStatus VARCHAR(30);
        SELECT
          @revisionId = sync.desired_revision_id,
          @status = sync.sync_status,
          @meetingStatus = meetingRow.status
        FROM dbo.TM_meeting_outlook_sync AS sync WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.TM_meetings AS meetingRow
          ON meetingRow.id = sync.meeting_id
        WHERE sync.meeting_id = @meetingId;

        IF @status <> 'OUTLOOK_DELETED' OR @meetingStatus <> 'SCHEDULED' OR @revisionId IS NULL
        BEGIN
          ROLLBACK;
          THROW 54711, 'The Outlook Meeting is not in a recreatable deleted state.', 1;
        END;

        UPDATE dbo.TM_meeting_outlook_sync
        SET graph_event_id = NULL,
            graph_change_key = NULL,
            graph_ical_uid = NULL,
            graph_web_link = NULL,
            event_generation = event_generation + 1,
            create_transaction_id = NEWID(),
            sync_status = 'NOT_SYNCED',
            outlook_deleted_at_utc = NULL,
            external_change_detected_at_utc = NULL,
            last_error_code = NULL,
            last_error_message = NULL,
            updated_at_utc = SYSUTCDATETIME()
        WHERE meeting_id = @meetingId;

        DECLARE @dedupe VARCHAR(250) =
          CONCAT('OUTLOOK:MANUAL:RECREATE:', @meetingId, ':', @revisionId, ':', NEWID());

        INSERT dbo.TM_meeting_outlook_sync_jobs (
          meeting_id, operation, trigger_type, target_revision_id,
          requested_by_user_id, dedupe_key
        )
        VALUES (
          @meetingId, 'RECREATE', 'MANUAL', @revisionId,
          @requestedBy, @dedupe
        );

        COMMIT;
      `);
  },

  async recoverAbandoned(processingTimeoutMinutes: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("timeoutMinutes", sql.Int, processingTimeoutMinutes).query(`
      UPDATE dbo.TM_meeting_outlook_sync_jobs
      SET status = 'PENDING', locked_at_utc = NULL, locked_by = NULL,
          next_attempt_at_utc = SYSUTCDATETIME(), updated_at_utc = SYSUTCDATETIME(),
          last_error_code = 'OUTLOOK_WORKER_RECOVERED',
          last_error_message = N'A previous Outlook worker lease expired and the job was recovered.'
      WHERE status = 'PROCESSING'
        AND locked_at_utc < DATEADD(MINUTE, -@timeoutMinutes, SYSUTCDATETIME());
    `);
  },

  async claimNext(workerId: string): Promise<OutlookSyncJobRecord | null> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("workerId", sql.NVarChar(160), workerId).query<JobRow>(`
      ;WITH candidate AS (
        SELECT TOP (1) * FROM dbo.TM_meeting_outlook_sync_jobs WITH (UPDLOCK, READPAST, ROWLOCK)
        WHERE status = 'PENDING' AND next_attempt_at_utc <= SYSUTCDATETIME()
        ORDER BY next_attempt_at_utc, id
      )
      UPDATE candidate SET status = 'PROCESSING', attempt_count = attempt_count + 1,
        locked_at_utc = SYSUTCDATETIME(), locked_by = @workerId,
        started_at_utc = COALESCE(started_at_utc, SYSUTCDATETIME()), updated_at_utc = SYSUTCDATETIME()
      OUTPUT inserted.id, inserted.meeting_id AS meetingId, inserted.operation,
        inserted.target_revision_id AS targetRevisionId, inserted.attempt_count AS attemptCount;
    `);
    const row = result.recordset[0];
    return row ? { id: Number(row.id), meetingId: Number(row.meetingId), operation: row.operation,
      targetRevisionId: row.targetRevisionId === null ? null : Number(row.targetRevisionId), attemptCount: Number(row.attemptCount) } : null;
  },

  async projection(meetingId: number): Promise<OutlookMeetingProjection | null> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).query<ProjectionRow>(`
      SELECT m.id AS meetingId, m.title, m.description, m.status,
        m.organizer_user_id AS organizerUserId, organizer.USER_NAME AS organizerName,
        NULLIF(LTRIM(RTRIM(organizer.email)), N'') AS organizerEmail,
        r.id AS revisionId, r.meeting_mode AS meetingMode,
        room.name_ar AS roomNameAr, room.name_en AS roomNameEn, room.location_text AS roomLocationText,
        r.online_join_url AS onlineJoinUrl, r.start_at_utc AS startAtUtc, r.end_at_utc AS endAtUtc,
        COALESCE((SELECT attendeeUser.USER_ID AS userId, attendeeUser.USER_NAME AS userName,
          NULLIF(LTRIM(RTRIM(attendeeUser.email)), N'') AS email
          FROM dbo.TM_meeting_attendees AS attendee
          INNER JOIN dbo.users AS attendeeUser ON attendeeUser.USER_ID = attendee.attendee_user_id
          WHERE attendee.meeting_id = m.id AND attendee.attendee_user_id <> m.organizer_user_id
          ORDER BY attendeeUser.USER_NAME, attendeeUser.USER_ID FOR JSON PATH), N'[]') AS attendeesJson
      FROM dbo.TM_meetings AS m
      INNER JOIN dbo.users AS organizer ON organizer.USER_ID = m.organizer_user_id
      LEFT JOIN dbo.TM_meeting_revisions AS r ON r.id = m.current_revision_id AND r.meeting_id = m.id
      LEFT JOIN dbo.TM_meeting_rooms AS room ON room.id = r.room_id
      WHERE m.id = @meetingId;
    `);
    const row = result.recordset[0];
    if (!row || row.revisionId === null || row.meetingMode === null || row.startAtUtc === null || row.endAtUtc === null) return null;
    return { meetingId: Number(row.meetingId), title: row.title, description: row.description, status: row.status,
      organizerUserId: Number(row.organizerUserId), organizerName: row.organizerName, organizerEmail: row.organizerEmail,
      revisionId: Number(row.revisionId), meetingMode: row.meetingMode, roomNameAr: row.roomNameAr,
      roomNameEn: row.roomNameEn, roomLocationText: row.roomLocationText, onlineJoinUrl: row.onlineJoinUrl,
      startAtUtc: row.startAtUtc.toISOString(), endAtUtc: row.endAtUtc.toISOString(), attendees: parseAttendees(row.attendeesJson) };
  },

  async mappingForWorker(meetingId: number): Promise<(MappingRow & { statusView: OutlookSyncStatusView }) | null> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).query<MappingRow>(`
      SELECT meeting_id AS meetingId, organizer_user_id AS organizerUserId,
        organizer_email_snapshot AS organizerEmailSnapshot, organizer_user_principal_name AS organizerUserPrincipalName,
        event_generation AS eventGeneration, CONVERT(VARCHAR(36), create_transaction_id) AS createTransactionId,
        graph_event_id AS graphEventId, graph_change_key AS graphChangeKey, graph_ical_uid AS graphIcalUid,
        graph_web_link AS graphWebLink, desired_revision_id AS desiredRevisionId, synced_revision_id AS syncedRevisionId,
        sync_status AS syncStatus, missing_email_participant_count AS missingEmailParticipantCount,
        last_synced_at_utc AS lastSyncedAtUtc, last_checked_at_utc AS lastCheckedAtUtc,
        last_error_code AS lastErrorCode, last_error_message AS lastErrorMessage,
        last_observed_projection_json AS lastObservedProjectionJson
      FROM dbo.TM_meeting_outlook_sync WHERE meeting_id = @meetingId;
    `);
    const row = result.recordset[0];
    const statusView = mapStatus(row);
    return row && statusView ? { ...row, statusView } : null;
  },

  async status(meetingId: number): Promise<OutlookSyncStatusView | null> {
    const mapping = await this.mappingForWorker(meetingId);
    return mapping?.statusView ?? null;
  },

  async markSyncing(meetingId: number, organizerEmail: string | null, revisionId: number, missingCount: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("meetingId", sql.BigInt, meetingId).input("email", sql.NVarChar(320), organizerEmail)
      .input("revisionId", sql.BigInt, revisionId).input("missing", sql.Int, missingCount).query(`
        UPDATE dbo.TM_meeting_outlook_sync SET organizer_email_snapshot = @email,
          organizer_user_principal_name = @email, desired_revision_id = @revisionId,
          missing_email_participant_count = @missing, sync_status = 'SYNCING', last_attempt_at_utc = SYSUTCDATETIME(),
          last_error_code = NULL, last_error_message = NULL, updated_at_utc = SYSUTCDATETIME()
        WHERE meeting_id = @meetingId;
      `);
  },

  async markSuccess(input: { meetingId: number; revisionId: number; missingCount: number; graphEventId: string; graphChangeKey: string | null; graphIcalUid: string | null; graphWebLink: string | null; projectionJson: string; projectionHash: string }): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("meetingId", sql.BigInt, input.meetingId).input("revisionId", sql.BigInt, input.revisionId)
      .input("missing", sql.Int, input.missingCount).input("eventId", sql.NVarChar(1024), input.graphEventId)
      .input("changeKey", sql.NVarChar(512), input.graphChangeKey).input("icalUid", sql.NVarChar(512), input.graphIcalUid)
      .input("webLink", sql.NVarChar(2048), input.graphWebLink).input("projectionJson", sql.NVarChar(sql.MAX), input.projectionJson)
      .input("projectionHash", sql.Char(64), input.projectionHash).query(`
        UPDATE dbo.TM_meeting_outlook_sync SET graph_event_id=@eventId, graph_change_key=@changeKey, graph_ical_uid=@icalUid,
          graph_web_link=@webLink, synced_revision_id=@revisionId, desired_revision_id=@revisionId,
          missing_email_participant_count=@missing,
          sync_status=CASE WHEN @missing > 0 THEN 'SYNCED_WITH_WARNINGS' ELSE 'IN_SYNC' END,
          last_synced_projection_json=@projectionJson, last_synced_projection_hash=@projectionHash,
          last_synced_at_utc=SYSUTCDATETIME(), last_checked_at_utc=SYSUTCDATETIME(),
          external_change_detected_at_utc=NULL, outlook_deleted_at_utc=NULL,
          last_error_code=NULL, last_error_message=NULL, updated_at_utc=SYSUTCDATETIME()
        WHERE meeting_id=@meetingId;
      `);
  },

  async markCancelled(meetingId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("meetingId", sql.BigInt, meetingId).query(`
      UPDATE dbo.TM_meeting_outlook_sync SET sync_status='IN_SYNC', last_synced_at_utc=SYSUTCDATETIME(),
        last_checked_at_utc=SYSUTCDATETIME(), last_error_code=NULL, last_error_message=NULL, updated_at_utc=SYSUTCDATETIME()
      WHERE meeting_id=@meetingId;
    `);
  },

  async completeJob(jobId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("jobId", sql.BigInt, jobId).query(`
      UPDATE dbo.TM_meeting_outlook_sync_jobs SET status='SUCCEEDED', locked_at_utc=NULL, locked_by=NULL,
        completed_at_utc=SYSUTCDATETIME(), updated_at_utc=SYSUTCDATETIME() WHERE id=@jobId;
    `);
  },

  async failJob(job: OutlookSyncJobRecord, code: string, message: string, maxAttempts: number, retryAfterSeconds: number | null): Promise<void> {
    const terminal = job.attemptCount >= maxAttempts;
    const delay = retryAfterSeconds ?? Math.min(3600, 30 * (2 ** Math.max(0, job.attemptCount - 1)));
    const pool = await getDatabasePool();
    await pool.request().input("jobId", sql.BigInt, job.id).input("meetingId", sql.BigInt, job.meetingId)
      .input("code", sql.VarChar(120), code.slice(0,120)).input("message", sql.NVarChar(1000), message.slice(0,1000))
      .input("terminal", sql.Bit, terminal).input("delay", sql.Int, delay).query(`
        UPDATE dbo.TM_meeting_outlook_sync_jobs SET status=CASE WHEN @terminal=1 THEN 'FAILED' ELSE 'PENDING' END,
          next_attempt_at_utc=DATEADD(SECOND,@delay,SYSUTCDATETIME()), locked_at_utc=NULL, locked_by=NULL,
          last_error_code=@code, last_error_message=@message,
          completed_at_utc=CASE WHEN @terminal=1 THEN SYSUTCDATETIME() ELSE NULL END, updated_at_utc=SYSUTCDATETIME()
        WHERE id=@jobId;
        UPDATE dbo.TM_meeting_outlook_sync SET sync_status='SYNC_FAILED', last_error_code=@code,
          last_error_message=@message, updated_at_utc=SYSUTCDATETIME() WHERE meeting_id=@meetingId;
      `);
  },
};
