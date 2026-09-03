import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import type { NotificationType } from "../notifications/notifications.types.js";

export interface MeetingNotificationSnapshot {
  meetingId: number;
  title: string;
  meetingStatus: "PENDING_APPROVAL" | "SCHEDULED" | "REJECTED" | "CANCELLED";
  organizerUserId: number;
  organizerUserName: string;
  decisionActorName: string | null;
  revisionId: number;
  revisionType: "INITIAL" | "RESCHEDULE";
  revisionStatus: "PENDING" | "APPROVED" | "REJECTED";
  currentRevisionId: number | null;
  roomId: number;
  roomNameAr: string;
  roomNameEn: string;
  startAtUtc: Date;
  endAtUtc: Date;
  previousRoomNameAr: string | null;
  previousRoomNameEn: string | null;
  previousStartAtUtc: Date | null;
  previousEndAtUtc: Date | null;
}

export interface MeetingEmailState extends MeetingNotificationSnapshot {
  timeFormat: "12H" | "24H";
  ownerIsOrganizer: boolean;
  ownerIsAttendee: boolean;
  ownerIsCoordinator: boolean;
}

export interface InsertMeetingNotificationInput {
  ownerUserId: number;
  notificationType: NotificationType;
  dedupeKey: string;
  subjectTitle: string;
  contextTitle?: string | null;
  meetingId: number;
  meetingRevisionId?: number | null;
  eventDate?: Date | null;
  suppressEmail?: boolean;
}

interface NumberRecord { value: number | string }

interface MeetingNotificationRecord {
  meetingId: number | string;
  title: string;
  meetingStatus: MeetingNotificationSnapshot["meetingStatus"];
  organizerUserId: number | string;
  organizerUserName: string;
  decisionActorName: string | null;
  revisionId: number | string;
  revisionType: MeetingNotificationSnapshot["revisionType"];
  revisionStatus: MeetingNotificationSnapshot["revisionStatus"];
  currentRevisionId: number | string | null;
  roomId: number | string;
  roomNameAr: string;
  roomNameEn: string;
  startAtUtc: Date;
  endAtUtc: Date;
  previousRoomNameAr: string | null;
  previousRoomNameEn: string | null;
  previousStartAtUtc: Date | null;
  previousEndAtUtc: Date | null;
  timeFormat?: "12H" | "24H" | null;
  ownerIsOrganizer?: boolean | number;
  ownerIsAttendee?: boolean | number;
  ownerIsCoordinator?: boolean | number;
}

function mapSnapshot(record: MeetingNotificationRecord): MeetingNotificationSnapshot {
  return {
    meetingId: Number(record.meetingId),
    title: record.title,
    meetingStatus: record.meetingStatus,
    organizerUserId: Number(record.organizerUserId),
    organizerUserName: record.organizerUserName,
    decisionActorName: record.decisionActorName,
    revisionId: Number(record.revisionId),
    revisionType: record.revisionType,
    revisionStatus: record.revisionStatus,
    currentRevisionId: record.currentRevisionId == null ? null : Number(record.currentRevisionId),
    roomId: Number(record.roomId),
    roomNameAr: record.roomNameAr,
    roomNameEn: record.roomNameEn,
    startAtUtc: record.startAtUtc,
    endAtUtc: record.endAtUtc,
    previousRoomNameAr: record.previousRoomNameAr,
    previousRoomNameEn: record.previousRoomNameEn,
    previousStartAtUtc: record.previousStartAtUtc,
    previousEndAtUtc: record.previousEndAtUtc,
  };
}

export const meetingNotificationsRepository = {
  async findSnapshot(meetingId: number, revisionId: number): Promise<MeetingNotificationSnapshot | null> {
    const pool = await getDatabasePool();
    const result = await pool.request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("revisionId", sql.BigInt, revisionId)
      .query<MeetingNotificationRecord>(`
        SELECT TOP (1)
          meeting.id AS meetingId,
          meeting.title,
          meeting.status AS meetingStatus,
          meeting.organizer_user_id AS organizerUserId,
          organizer.USER_NAME AS organizerUserName,
          decisionActor.USER_NAME AS decisionActorName,
          revision.id AS revisionId,
          revision.revision_type AS revisionType,
          revision.revision_status AS revisionStatus,
          meeting.current_revision_id AS currentRevisionId,
          revision.room_id AS roomId,
          room.name_ar AS roomNameAr,
          room.name_en AS roomNameEn,
          revision.start_at_utc AS startAtUtc,
          revision.end_at_utc AS endAtUtc,
          previousSchedule.previousRoomNameAr,
          previousSchedule.previousRoomNameEn,
          previousSchedule.previousStartAtUtc,
          previousSchedule.previousEndAtUtc
        FROM dbo.TM_meetings AS meeting
        INNER JOIN dbo.users AS organizer ON organizer.USER_ID = meeting.organizer_user_id
        INNER JOIN dbo.TM_meeting_revisions AS revision
          ON revision.meeting_id = meeting.id AND revision.id = @revisionId
        LEFT JOIN dbo.users AS decisionActor ON decisionActor.USER_ID = revision.approved_by_user_id
        INNER JOIN dbo.TM_meeting_rooms AS room ON room.id = revision.room_id
        OUTER APPLY (
          SELECT TOP (1)
            previousRoom.name_ar AS previousRoomNameAr,
            previousRoom.name_en AS previousRoomNameEn,
            prior.start_at_utc AS previousStartAtUtc,
            prior.end_at_utc AS previousEndAtUtc
          FROM dbo.TM_meeting_revisions AS prior
          INNER JOIN dbo.TM_meeting_rooms AS previousRoom ON previousRoom.id = prior.room_id
          WHERE prior.meeting_id = meeting.id
            AND prior.revision_status = 'APPROVED'
            AND prior.revision_number < revision.revision_number
          ORDER BY prior.revision_number DESC, prior.id DESC
        ) AS previousSchedule
        WHERE meeting.id = @meetingId;
      `);
    const row = result.recordset[0];
    return row ? mapSnapshot(row) : null;
  },

  async findCurrentSnapshot(meetingId: number): Promise<MeetingNotificationSnapshot | null> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).query<MeetingNotificationRecord>(`
      SELECT TOP (1)
        meeting.id AS meetingId,
        meeting.title,
        meeting.status AS meetingStatus,
        meeting.organizer_user_id AS organizerUserId,
        organizer.USER_NAME AS organizerUserName,
        decisionActor.USER_NAME AS decisionActorName,
        revision.id AS revisionId,
        revision.revision_type AS revisionType,
        revision.revision_status AS revisionStatus,
        meeting.current_revision_id AS currentRevisionId,
        revision.room_id AS roomId,
        room.name_ar AS roomNameAr,
        room.name_en AS roomNameEn,
        revision.start_at_utc AS startAtUtc,
        revision.end_at_utc AS endAtUtc,
        previousSchedule.previousRoomNameAr,
        previousSchedule.previousRoomNameEn,
        previousSchedule.previousStartAtUtc,
        previousSchedule.previousEndAtUtc
      FROM dbo.TM_meetings AS meeting
      INNER JOIN dbo.users AS organizer ON organizer.USER_ID = meeting.organizer_user_id
      INNER JOIN dbo.TM_meeting_revisions AS revision
        ON revision.id = meeting.current_revision_id AND revision.meeting_id = meeting.id
      LEFT JOIN dbo.users AS decisionActor ON decisionActor.USER_ID = revision.approved_by_user_id
      INNER JOIN dbo.TM_meeting_rooms AS room ON room.id = revision.room_id
      OUTER APPLY (
        SELECT TOP (1)
          previousRoom.name_ar AS previousRoomNameAr,
          previousRoom.name_en AS previousRoomNameEn,
          prior.start_at_utc AS previousStartAtUtc,
          prior.end_at_utc AS previousEndAtUtc
        FROM dbo.TM_meeting_revisions AS prior
        INNER JOIN dbo.TM_meeting_rooms AS previousRoom ON previousRoom.id = prior.room_id
        WHERE prior.meeting_id = meeting.id
          AND prior.revision_status = 'APPROVED'
          AND prior.revision_number < revision.revision_number
        ORDER BY prior.revision_number DESC, prior.id DESC
      ) AS previousSchedule
      WHERE meeting.id = @meetingId;
    `);
    const row = result.recordset[0];
    return row ? mapSnapshot(row) : null;
  },

  async listParticipantUserIds(meetingId: number): Promise<number[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).query<NumberRecord>(`
      SELECT DISTINCT source.userId AS value
      FROM (
        SELECT meeting.organizer_user_id AS userId
        FROM dbo.TM_meetings AS meeting
        WHERE meeting.id = @meetingId
        UNION ALL
        SELECT attendee.attendee_user_id
        FROM dbo.TM_meeting_attendees AS attendee
        WHERE attendee.meeting_id = @meetingId
      ) AS source
      INNER JOIN dbo.TM_user_access AS access ON access.portal_user_id = source.userId AND access.is_active = 1
      INNER JOIN dbo.users AS portal ON portal.USER_ID = source.userId AND portal.IS_ACTIVE = 1;
    `);
    return result.recordset.map((row) => Number(row.value));
  },

  async listAttendeeUserIds(meetingId: number): Promise<number[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).query<NumberRecord>(`
      SELECT DISTINCT attendee.attendee_user_id AS value
      FROM dbo.TM_meeting_attendees AS attendee
      INNER JOIN dbo.TM_user_access AS access
        ON access.portal_user_id = attendee.attendee_user_id AND access.is_active = 1
      INNER JOIN dbo.users AS portal
        ON portal.USER_ID = attendee.attendee_user_id AND portal.IS_ACTIVE = 1
      WHERE attendee.meeting_id = @meetingId;
    `);
    return result.recordset.map((row) => Number(row.value));
  },

  async listCoordinatorUserIds(): Promise<number[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().query<NumberRecord>(`
      SELECT permission.portal_user_id AS value
      FROM dbo.TM_meeting_user_permissions AS permission
      INNER JOIN dbo.TM_user_access AS access
        ON access.portal_user_id = permission.portal_user_id AND access.is_active = 1
      INNER JOIN dbo.users AS portal
        ON portal.USER_ID = permission.portal_user_id AND portal.IS_ACTIVE = 1
      WHERE permission.permission_code = 'MEETING_COORDINATE'
        AND permission.is_active = 1;
    `);
    return result.recordset.map((row) => Number(row.value));
  },

  async insert(transaction: DatabaseTransaction, input: InsertMeetingNotificationInput): Promise<void> {
    await transaction.request()
      .input("owner", sql.Int, input.ownerUserId)
      .input("type", sql.VarChar(40), input.notificationType)
      .input("dedupe", sql.VarChar(220), input.dedupeKey)
      .input("subject", sql.NVarChar(250), input.subjectTitle)
      .input("context", sql.NVarChar(500), input.contextTitle ?? null)
      .input("meetingId", sql.BigInt, input.meetingId)
      .input("revisionId", sql.BigInt, input.meetingRevisionId ?? null)
      .input("eventDate", sql.Date, input.eventDate ?? null)
      .input("emailProcessed", sql.DateTime2, input.suppressEmail ? new Date() : null)
      .query(`
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.TM_notifications WITH (UPDLOCK, HOLDLOCK)
          WHERE owner_user_id = @owner AND dedupe_key = @dedupe
        )
        BEGIN
          INSERT dbo.TM_notifications (
            owner_user_id, notification_type, dedupe_key, subject_title, context_title,
            meeting_id, meeting_revision_id, event_date, email_processed_at_utc
          )
          VALUES (
            @owner, @type, @dedupe, @subject, @context,
            @meetingId, @revisionId, @eventDate, @emailProcessed
          );
        END;
      `);
  },

  async removeStaleStartReminders(meetingId: number, keepRevisionId: number | null): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("keepRevisionId", sql.BigInt, keepRevisionId)
      .query(`
        DELETE dbo.TM_notifications
        WHERE meeting_id = @meetingId
          AND notification_type = 'MEETING_START_REMINDER'
          AND (@keepRevisionId IS NULL OR meeting_revision_id <> @keepRevisionId);
      `);
  },

  async syncStartReminder(ownerUserId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request().input("owner", sql.Int, ownerUserId).query(`
      DELETE reminder
      FROM dbo.TM_notifications AS reminder
      LEFT JOIN dbo.TM_meetings AS meeting ON meeting.id = reminder.meeting_id
      LEFT JOIN dbo.TM_user_settings AS settings ON settings.portal_user_id = reminder.owner_user_id
      WHERE reminder.owner_user_id = @owner
        AND reminder.notification_type = 'MEETING_START_REMINDER'
        AND reminder.read_at_utc IS NULL
        AND (
          COALESCE(settings.meeting_start_reminder_enabled, 1) = 0
          OR meeting.status <> 'SCHEDULED'
          OR meeting.current_revision_id <> reminder.meeting_revision_id
        );

      MERGE dbo.TM_notifications WITH (HOLDLOCK) AS target
      USING (
        SELECT
          @owner AS ownerUserId,
          CONVERT(VARCHAR(220), CONCAT('MEETING_START_REMINDER:', meeting.id, ':', revision.id)) AS dedupeKey,
          meeting.title AS subjectTitle,
          CASE WHEN settings.language_code = 'AR' THEN room.name_ar ELSE room.name_en END AS contextTitle,
          meeting.id AS meetingId,
          revision.id AS revisionId,
          CAST(revision.start_at_utc AS DATE) AS eventDate
        FROM dbo.TM_meetings AS meeting
        INNER JOIN dbo.TM_meeting_revisions AS revision
          ON revision.id = meeting.current_revision_id AND revision.meeting_id = meeting.id
        INNER JOIN dbo.TM_meeting_rooms AS room ON room.id = revision.room_id
        INNER JOIN dbo.TM_user_settings AS settings ON settings.portal_user_id = @owner
        WHERE meeting.status = 'SCHEDULED'
          AND settings.meeting_start_reminder_enabled = 1
          AND revision.start_at_utc > SYSUTCDATETIME()
          AND revision.start_at_utc <= DATEADD(MINUTE, 15, SYSUTCDATETIME())
          AND (
            meeting.organizer_user_id = @owner
            OR EXISTS (
              SELECT 1 FROM dbo.TM_meeting_attendees AS attendee
              WHERE attendee.meeting_id = meeting.id AND attendee.attendee_user_id = @owner
            )
          )
      ) AS source
        ON target.owner_user_id = source.ownerUserId AND target.dedupe_key = source.dedupeKey
      WHEN NOT MATCHED THEN
        INSERT (
          owner_user_id, notification_type, dedupe_key, subject_title, context_title,
          meeting_id, meeting_revision_id, event_date, email_processed_at_utc
        )
        VALUES (
          source.ownerUserId, 'MEETING_START_REMINDER', source.dedupeKey, source.subjectTitle,
          source.contextTitle, source.meetingId, source.revisionId, source.eventDate, SYSUTCDATETIME()
        );
    `);
  },

  async getEmailState(
    ownerUserId: number,
    meetingId: number,
    revisionId: number,
  ): Promise<MeetingEmailState | null> {
    const pool = await getDatabasePool();
    const result = await pool.request()
      .input("owner", sql.Int, ownerUserId)
      .input("meetingId", sql.BigInt, meetingId)
      .input("revisionId", sql.BigInt, revisionId)
      .query<MeetingNotificationRecord>(`
        SELECT TOP (1)
          meeting.id AS meetingId,
          meeting.title,
          meeting.status AS meetingStatus,
          meeting.organizer_user_id AS organizerUserId,
          organizer.USER_NAME AS organizerUserName,
          decisionActor.USER_NAME AS decisionActorName,
          revision.id AS revisionId,
          revision.revision_type AS revisionType,
          revision.revision_status AS revisionStatus,
          meeting.current_revision_id AS currentRevisionId,
          revision.room_id AS roomId,
          room.name_ar AS roomNameAr,
          room.name_en AS roomNameEn,
          revision.start_at_utc AS startAtUtc,
          revision.end_at_utc AS endAtUtc,
          previousSchedule.previousRoomNameAr,
          previousSchedule.previousRoomNameEn,
          previousSchedule.previousStartAtUtc,
          previousSchedule.previousEndAtUtc,
          COALESCE(ownerSettings.time_format, '12H') AS timeFormat,
          CAST(CASE WHEN meeting.organizer_user_id = @owner THEN 1 ELSE 0 END AS BIT) AS ownerIsOrganizer,
          CAST(CASE WHEN EXISTS (
            SELECT 1 FROM dbo.TM_meeting_attendees AS attendee
            WHERE attendee.meeting_id = meeting.id AND attendee.attendee_user_id = @owner
          ) THEN 1 ELSE 0 END AS BIT) AS ownerIsAttendee,
          CAST(CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_user_permissions AS permission
            INNER JOIN dbo.TM_user_access AS access
              ON access.portal_user_id = permission.portal_user_id AND access.is_active = 1
            WHERE permission.portal_user_id = @owner
              AND permission.permission_code = 'MEETING_COORDINATE'
              AND permission.is_active = 1
          ) THEN 1 ELSE 0 END AS BIT) AS ownerIsCoordinator
        FROM dbo.TM_meetings AS meeting
        INNER JOIN dbo.users AS organizer ON organizer.USER_ID = meeting.organizer_user_id
        INNER JOIN dbo.TM_user_access AS ownerAccess
          ON ownerAccess.portal_user_id = @owner AND ownerAccess.is_active = 1
        INNER JOIN dbo.users AS ownerPortal
          ON ownerPortal.USER_ID = @owner AND ownerPortal.IS_ACTIVE = 1
        LEFT JOIN dbo.TM_user_settings AS ownerSettings
          ON ownerSettings.portal_user_id = @owner
        INNER JOIN dbo.TM_meeting_revisions AS revision
          ON revision.meeting_id = meeting.id AND revision.id = @revisionId
        LEFT JOIN dbo.users AS decisionActor ON decisionActor.USER_ID = revision.approved_by_user_id
        INNER JOIN dbo.TM_meeting_rooms AS room ON room.id = revision.room_id
        OUTER APPLY (
          SELECT TOP (1)
            previousRoom.name_ar AS previousRoomNameAr,
            previousRoom.name_en AS previousRoomNameEn,
            prior.start_at_utc AS previousStartAtUtc,
            prior.end_at_utc AS previousEndAtUtc
          FROM dbo.TM_meeting_revisions AS prior
          INNER JOIN dbo.TM_meeting_rooms AS previousRoom ON previousRoom.id = prior.room_id
          WHERE prior.meeting_id = meeting.id
            AND prior.revision_status = 'APPROVED'
            AND prior.revision_number < revision.revision_number
          ORDER BY prior.revision_number DESC, prior.id DESC
        ) AS previousSchedule
        WHERE meeting.id = @meetingId;
      `);
    const row = result.recordset[0];
    if (!row) return null;
    return {
      ...mapSnapshot(row),
      timeFormat: row.timeFormat === "24H" ? "24H" : "12H",
      ownerIsOrganizer: Boolean(row.ownerIsOrganizer),
      ownerIsAttendee: Boolean(row.ownerIsAttendee),
      ownerIsCoordinator: Boolean(row.ownerIsCoordinator),
    };
  },
};

