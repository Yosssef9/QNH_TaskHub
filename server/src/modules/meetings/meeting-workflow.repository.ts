import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { normalizeSqlRowVersion, rowVersionToBuffer } from "../../shared/utils/sql-row-version.js";
import type {
  CreateMeetingInput,
  MeetingParticipant,
  MeetingStatus,
  MeetingSummary,
  UpdatePendingMeetingScheduleInput,
} from "./meeting-workflow.types.js";

interface CountRecord {
  total: number | string;
}

interface MeetingIdentityRecord {
  meetingId: number | string;
  rowVersion: unknown;
}

interface MeetingRevisionIdentityRecord {
  revisionId: number | string;
  rowVersion: unknown;
}

interface MeetingParticipantRecord {
  userId: number | string;
  userCode: string;
  userName: string;
}

interface MeetingSummaryRecord {
  id: number | string;
  title: string;
  description: string | null;
  status: MeetingStatus;
  organizerUserId: number | string;
  organizerUserCode: string;
  organizerUserName: string;
  roomId: number | string;
  roomCode: string | null;
  roomNameAr: string;
  roomNameEn: string;
  roomLocationText: string | null;
  roomCapacity: number | string;
  roomEquipmentNotes: string | null;
  roomIsActive: boolean | number;
  roomRowVersion: unknown;
  startAtUtc: Date;
  endAtUtc: Date;
  schedulingNotes: string | null;
  participantCount: number | string;
  attendeesJson: string | null;
  revisionId: number | string;
  meetingRowVersion: unknown;
  revisionRowVersion: unknown;
}

interface ScheduleRecord {
  meetingId: number | string;
  title: string;
  organizerUserId: number | string;
  organizerUserCode: string;
  organizerUserName: string;
  roomId: number | string;
  roomCode: string | null;
  roomNameAr: string;
  roomNameEn: string;
  roomLocationText: string | null;
  startAtUtc: Date;
  endAtUtc: Date;
  isOrganizer: boolean | number;
  isAttendee: boolean | number;
}

export interface MeetingScheduleRecord {
  meetingId: number;
  title: string;
  organizer: MeetingParticipant;
  room: {
    id: number;
    code: string | null;
    nameAr: string;
    nameEn: string;
    locationText: string | null;
  };
  startAtUtc: Date;
  endAtUtc: Date;
  isOrganizer: boolean;
  isAttendee: boolean;
}

function participantListInputs(
  transaction: DatabaseTransaction,
  userIds: readonly number[],
): { placeholders: string; request: ReturnType<DatabaseTransaction["request"]> } {
  const request = transaction.request();
  const placeholders = userIds
    .map((userId, index) => {
      const name = `participantUserId${index}`;
      request.input(name, sql.Int, userId);
      return `@${name}`;
    })
    .join(", ");

  return { placeholders, request };
}

function mapParticipant(record: MeetingParticipantRecord): MeetingParticipant {
  return {
    userId: Number(record.userId),
    userCode: record.userCode,
    userName: record.userName,
  };
}

function parseAttendees(value: string | null): MeetingParticipant[] {
  if (!value) return [];

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item): item is { userId: number; userCode: string; userName: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { userId?: unknown }).userId === "number" &&
        typeof (item as { userCode?: unknown }).userCode === "string" &&
        typeof (item as { userName?: unknown }).userName === "string",
    )
    .map((item) => ({
      userId: item.userId,
      userCode: item.userCode,
      userName: item.userName,
    }));
}

function mapMeetingSummary(record: MeetingSummaryRecord): MeetingSummary | null {
  const meetingRowVersion = normalizeSqlRowVersion(record.meetingRowVersion);
  const revisionRowVersion = normalizeSqlRowVersion(record.revisionRowVersion);
  const roomRowVersion = normalizeSqlRowVersion(record.roomRowVersion);
  if (!meetingRowVersion || !revisionRowVersion || !roomRowVersion) return null;

  return {
    id: Number(record.id),
    title: record.title,
    description: record.description,
    status: record.status,
    organizer: {
      userId: Number(record.organizerUserId),
      userCode: record.organizerUserCode,
      userName: record.organizerUserName,
    },
    room: {
      id: Number(record.roomId),
      code: record.roomCode,
      nameAr: record.roomNameAr,
      nameEn: record.roomNameEn,
      locationText: record.roomLocationText,
      capacity: Number(record.roomCapacity),
      equipmentNotes: record.roomEquipmentNotes,
      isActive: Boolean(record.roomIsActive),
      rowVersion: roomRowVersion,
    },
    startAtUtc: record.startAtUtc.toISOString(),
    endAtUtc: record.endAtUtc.toISOString(),
    schedulingNotes: record.schedulingNotes,
    participantCount: Number(record.participantCount),
    attendees: parseAttendees(record.attendeesJson),
    revisionId: Number(record.revisionId),
    meetingRowVersion,
    revisionRowVersion,
  };
}

const meetingSummaryFields = `
  m.id,
  m.title,
  m.description,
  m.status,
  organizer.USER_ID AS organizerUserId,
  organizer.USER_CODE AS organizerUserCode,
  organizer.USER_NAME AS organizerUserName,
  room.id AS roomId,
  room.code AS roomCode,
  room.name_ar AS roomNameAr,
  room.name_en AS roomNameEn,
  room.location_text AS roomLocationText,
  room.capacity AS roomCapacity,
  room.equipment_notes AS roomEquipmentNotes,
  CAST(room.is_active AS BIT) AS roomIsActive,
  room.row_version AS roomRowVersion,
  selectedRevision.start_at_utc AS startAtUtc,
  selectedRevision.end_at_utc AS endAtUtc,
  selectedRevision.scheduling_notes AS schedulingNotes,
  CAST(
    1 + (
      SELECT COUNT_BIG(1)
      FROM dbo.TM_meeting_attendees AS participantCountAttendee
      WHERE participantCountAttendee.meeting_id = m.id
        AND participantCountAttendee.attendee_user_id <> m.organizer_user_id
    )
    AS BIGINT
  ) AS participantCount,
  COALESCE((
    SELECT
      attendeeUser.USER_ID AS userId,
      attendeeUser.USER_CODE AS userCode,
      attendeeUser.USER_NAME AS userName
    FROM dbo.TM_meeting_attendees AS attendee
    INNER JOIN dbo.users AS attendeeUser
      ON attendeeUser.USER_ID = attendee.attendee_user_id
    WHERE attendee.meeting_id = m.id
      AND attendee.attendee_user_id <> m.organizer_user_id
    ORDER BY attendeeUser.USER_NAME, attendeeUser.USER_ID
    FOR JSON PATH
  ), N'[]') AS attendeesJson,
  selectedRevision.id AS revisionId,
  m.row_version AS meetingRowVersion,
  selectedRevision.row_version AS revisionRowVersion
`;

const meetingSummaryJoins = `
  INNER JOIN dbo.users AS organizer
    ON organizer.USER_ID = m.organizer_user_id
  CROSS APPLY (
    SELECT TOP (1)
      revision.id,
      revision.revision_number,
      revision.revision_type,
      revision.revision_status,
      revision.room_id,
      revision.start_at_utc,
      revision.end_at_utc,
      revision.scheduling_notes,
      revision.row_version
    FROM dbo.TM_meeting_revisions AS revision
    WHERE revision.meeting_id = m.id
    ORDER BY
      CASE WHEN revision.id = m.current_revision_id THEN 0 ELSE 1 END,
      revision.revision_number DESC,
      revision.id DESC
  ) AS selectedRevision
  INNER JOIN dbo.TM_meeting_rooms AS room
    ON room.id = selectedRevision.room_id
`;

async function querySummaries(
  whereSql: string,
  bind: (request: ReturnType<DatabaseTransaction["request"]>) => void,
): Promise<MeetingSummary[]> {
  const pool = await getDatabasePool();
  const request = pool.request();
  bind(request);
  const result = await request.query<MeetingSummaryRecord>(`
    SELECT ${meetingSummaryFields}
    FROM dbo.TM_meetings AS m
    ${meetingSummaryJoins}
    WHERE ${whereSql}
    ORDER BY selectedRevision.start_at_utc, m.id;
  `);

  return result.recordset
    .map(mapMeetingSummary)
    .filter((meeting): meeting is MeetingSummary => meeting !== null);
}

export const meetingWorkflowRepository = {
  async searchParticipants(input: {
    search?: string | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ items: MeetingParticipant[]; total: number }> {
    const pool = await getDatabasePool();
    const search = input.search?.trim() || null;
    const offset = (input.page - 1) * input.pageSize;
    const baseRequest = () =>
      pool
        .request()
        .input("search", sql.NVarChar(100), search)
        .input("offset", sql.Int, offset)
        .input("pageSize", sql.Int, input.pageSize);

    const [itemsResult, countResult] = await Promise.all([
      baseRequest().query<MeetingParticipantRecord>(`
        SELECT
          portal.USER_ID AS userId,
          portal.USER_CODE AS userCode,
          portal.USER_NAME AS userName
        FROM dbo.TM_user_access AS access
        INNER JOIN dbo.users AS portal
          ON portal.USER_ID = access.portal_user_id
        WHERE access.is_active = 1
          AND portal.IS_ACTIVE = 1
          AND (
            @search IS NULL
            OR portal.USER_CODE LIKE N'%' + @search + N'%'
            OR portal.USER_NAME LIKE N'%' + @search + N'%'
          )
        ORDER BY portal.USER_NAME, portal.USER_ID
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
      `),
      baseRequest().query<CountRecord>(`
        SELECT COUNT_BIG(1) AS total
        FROM dbo.TM_user_access AS access
        INNER JOIN dbo.users AS portal
          ON portal.USER_ID = access.portal_user_id
        WHERE access.is_active = 1
          AND portal.IS_ACTIVE = 1
          AND (
            @search IS NULL
            OR portal.USER_CODE LIKE N'%' + @search + N'%'
            OR portal.USER_NAME LIKE N'%' + @search + N'%'
          );
      `),
    ]);

    return {
      items: itemsResult.recordset.map(mapParticipant),
      total: Number(countResult.recordset[0]?.total ?? 0),
    };
  },

  async activeParticipantIds(
    transaction: DatabaseTransaction,
    userIds: readonly number[],
  ): Promise<number[]> {
    if (userIds.length === 0) return [];

    const { placeholders, request } = participantListInputs(transaction, userIds);
    const result = await request.query<{ userId: number | string }>(`
      SELECT access.portal_user_id AS userId
      FROM dbo.TM_user_access AS access
      INNER JOIN dbo.users AS portal
        ON portal.USER_ID = access.portal_user_id
      WHERE access.portal_user_id IN (${placeholders})
        AND access.is_active = 1
        AND portal.IS_ACTIVE = 1;
    `);

    return result.recordset.map((record) => Number(record.userId));
  },

  async createMeeting(
    transaction: DatabaseTransaction,
    organizerUserId: number,
    input: Pick<CreateMeetingInput, "title" | "description">,
  ): Promise<{ meetingId: number; rowVersion: string } | null> {
    const result = await transaction
      .request()
      .input("organizerUserId", sql.Int, organizerUserId)
      .input("title", sql.NVarChar(250), input.title)
      .input("description", sql.NVarChar(sql.MAX), input.description ?? null)
      .query<MeetingIdentityRecord>(`
        INSERT INTO dbo.TM_meetings (
          organizer_user_id,
          title,
          description,
          status
        )
        OUTPUT inserted.id AS meetingId, inserted.row_version AS rowVersion
        VALUES (
          @organizerUserId,
          @title,
          @description,
          'PENDING_APPROVAL'
        );
      `);

    const record = result.recordset[0];
    if (!record) return null;
    const rowVersion = normalizeSqlRowVersion(record.rowVersion);
    if (!rowVersion) return null;

    return { meetingId: Number(record.meetingId), rowVersion };
  },

  async createInitialRevision(
    transaction: DatabaseTransaction,
    actorUserId: number,
    meetingId: number,
    input: Pick<CreateMeetingInput, "roomId" | "startAtUtc" | "endAtUtc">,
  ): Promise<{ revisionId: number; rowVersion: string } | null> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("roomId", sql.BigInt, input.roomId)
      .input("startAtUtc", sql.DateTime2(3), new Date(input.startAtUtc))
      .input("endAtUtc", sql.DateTime2(3), new Date(input.endAtUtc))
      .input("actorUserId", sql.Int, actorUserId)
      .query<MeetingRevisionIdentityRecord>(`
        INSERT INTO dbo.TM_meeting_revisions (
          meeting_id,
          revision_number,
          revision_type,
          revision_status,
          room_id,
          start_at_utc,
          end_at_utc,
          requested_by_user_id
        )
        OUTPUT inserted.id AS revisionId, inserted.row_version AS rowVersion
        VALUES (
          @meetingId,
          1,
          'INITIAL',
          'PENDING',
          @roomId,
          @startAtUtc,
          @endAtUtc,
          @actorUserId
        );
      `);

    const record = result.recordset[0];
    if (!record) return null;
    const rowVersion = normalizeSqlRowVersion(record.rowVersion);
    if (!rowVersion) return null;

    return { revisionId: Number(record.revisionId), rowVersion };
  },

  async addAttendees(
    transaction: DatabaseTransaction,
    meetingId: number,
    actorUserId: number,
    attendeeUserIds: readonly number[],
  ): Promise<void> {
    for (const attendeeUserId of attendeeUserIds) {
      await transaction
        .request()
        .input("meetingId", sql.BigInt, meetingId)
        .input("attendeeUserId", sql.Int, attendeeUserId)
        .input("actorUserId", sql.Int, actorUserId)
        .query(`
          INSERT INTO dbo.TM_meeting_attendees (
            meeting_id,
            attendee_user_id,
            added_by_user_id
          )
          VALUES (
            @meetingId,
            @attendeeUserId,
            @actorUserId
          );
        `);
    }
  },

  async listMyMeetings(userId: number): Promise<MeetingSummary[]> {
    return querySummaries(
      `
        m.status = 'SCHEDULED'
        AND (
          m.organizer_user_id = @userId
          OR EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_attendees AS membership
            WHERE membership.meeting_id = m.id
              AND membership.attendee_user_id = @userId
          )
        )
      `,
      (request) => {
        request.input("userId", sql.Int, userId);
      },
    );
  },

  async listOrganizerRequests(userId: number): Promise<MeetingSummary[]> {
    return querySummaries(
      `
        m.organizer_user_id = @userId
        AND EXISTS (
          SELECT 1
          FROM dbo.TM_meeting_activity AS requestedActivity
          WHERE requestedActivity.meeting_id = m.id
            AND requestedActivity.activity_type = 'REQUESTED'
        )
      `,
      (request) => {
        request.input("userId", sql.Int, userId);
      },
    );
  },

  async listCoordinatorQueue(): Promise<MeetingSummary[]> {
    return querySummaries(
      `
        m.status = 'PENDING_APPROVAL'
        AND selectedRevision.revision_type = 'INITIAL'
        AND selectedRevision.revision_status = 'PENDING'
      `,
      () => undefined,
    );
  },

  async findSummary(meetingId: number): Promise<MeetingSummary | null> {
    const meetings = await querySummaries(`m.id = @meetingId`, (request) => {
      request.input("meetingId", sql.BigInt, meetingId);
    });
    return meetings[0] ?? null;
  },

  async updatePendingInitialSchedule(
    transaction: DatabaseTransaction,
    meetingId: number,
    input: UpdatePendingMeetingScheduleInput,
  ): Promise<boolean> {
    const rowVersion = rowVersionToBuffer(input.revisionRowVersion);
    if (!rowVersion) return false;

    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("revisionId", sql.BigInt, input.revisionId)
      .input("rowVersion", sql.VarBinary(8), rowVersion)
      .input("roomId", sql.BigInt, input.roomId)
      .input("startAtUtc", sql.DateTime2(3), new Date(input.startAtUtc))
      .input("endAtUtc", sql.DateTime2(3), new Date(input.endAtUtc))
      .input("schedulingNotes", sql.NVarChar(1000), input.schedulingNotes ?? null)
      .query(`
        UPDATE dbo.TM_meeting_revisions
        SET
          room_id = @roomId,
          start_at_utc = @startAtUtc,
          end_at_utc = @endAtUtc,
          scheduling_notes = @schedulingNotes
        WHERE id = @revisionId
          AND meeting_id = @meetingId
          AND revision_type = 'INITIAL'
          AND revision_status = 'PENDING'
          AND row_version = @rowVersion;
      `);

    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async rejectRevision(
    transaction: DatabaseTransaction,
    meetingId: number,
    revisionId: number,
    expectedRevisionRowVersion: string,
    actorUserId: number,
  ): Promise<boolean> {
    const rowVersion = rowVersionToBuffer(expectedRevisionRowVersion);
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
          revision_status = 'REJECTED',
          approved_by_user_id = NULL,
          rejected_by_user_id = @actorUserId,
          decided_at_utc = SYSUTCDATETIME()
        WHERE id = @revisionId
          AND meeting_id = @meetingId
          AND revision_type = 'INITIAL'
          AND revision_status = 'PENDING'
          AND row_version = @rowVersion;
      `);

    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async rejectMeeting(
    transaction: DatabaseTransaction,
    meetingId: number,
    expectedMeetingRowVersion: string,
  ): Promise<boolean> {
    const rowVersion = rowVersionToBuffer(expectedMeetingRowVersion);
    if (!rowVersion) return false;

    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("rowVersion", sql.VarBinary(8), rowVersion)
      .query(`
        UPDATE dbo.TM_meetings
        SET status = 'REJECTED', updated_at_utc = SYSUTCDATETIME()
        WHERE id = @meetingId
          AND status = 'PENDING_APPROVAL'
          AND row_version = @rowVersion;
      `);

    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async listSchedule(input: {
    userId: number;
    fromAtUtc: Date;
    toAtUtc: Date;
    roomId?: number | undefined;
  }): Promise<MeetingScheduleRecord[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("userId", sql.Int, input.userId)
      .input("fromAtUtc", sql.DateTime2(3), input.fromAtUtc)
      .input("toAtUtc", sql.DateTime2(3), input.toAtUtc)
      .input("roomId", sql.BigInt, input.roomId ?? null)
      .query<ScheduleRecord>(`
        SELECT
          m.id AS meetingId,
          m.title,
          organizer.USER_ID AS organizerUserId,
          organizer.USER_CODE AS organizerUserCode,
          organizer.USER_NAME AS organizerUserName,
          room.id AS roomId,
          room.code AS roomCode,
          room.name_ar AS roomNameAr,
          room.name_en AS roomNameEn,
          room.location_text AS roomLocationText,
          revision.start_at_utc AS startAtUtc,
          revision.end_at_utc AS endAtUtc,
          CAST(CASE WHEN m.organizer_user_id = @userId THEN 1 ELSE 0 END AS BIT) AS isOrganizer,
          CAST(CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.TM_meeting_attendees AS attendee
            WHERE attendee.meeting_id = m.id
              AND attendee.attendee_user_id = @userId
          ) THEN 1 ELSE 0 END AS BIT) AS isAttendee
        FROM dbo.TM_meetings AS m
        INNER JOIN dbo.TM_meeting_revisions AS revision
          ON revision.id = m.current_revision_id
         AND revision.meeting_id = m.id
        INNER JOIN dbo.TM_meeting_rooms AS room
          ON room.id = revision.room_id
        INNER JOIN dbo.users AS organizer
          ON organizer.USER_ID = m.organizer_user_id
        WHERE m.status = 'SCHEDULED'
          AND revision.revision_status = 'APPROVED'
          AND revision.start_at_utc < @toAtUtc
          AND revision.end_at_utc > @fromAtUtc
          AND (@roomId IS NULL OR revision.room_id = @roomId)
        ORDER BY revision.start_at_utc, revision.end_at_utc, room.name_en, m.id;
      `);

    return result.recordset.map((record) => ({
      meetingId: Number(record.meetingId),
      title: record.title,
      organizer: {
        userId: Number(record.organizerUserId),
        userCode: record.organizerUserCode,
        userName: record.organizerUserName,
      },
      room: {
        id: Number(record.roomId),
        code: record.roomCode,
        nameAr: record.roomNameAr,
        nameEn: record.roomNameEn,
        locationText: record.roomLocationText,
      },
      startAtUtc: record.startAtUtc,
      endAtUtc: record.endAtUtc,
      isOrganizer: Boolean(record.isOrganizer),
      isAttendee: Boolean(record.isAttendee),
    }));
  },
};
