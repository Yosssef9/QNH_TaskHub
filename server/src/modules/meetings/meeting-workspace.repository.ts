import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { normalizeSqlRowVersion, rowVersionToBuffer } from "../../shared/utils/sql-row-version.js";
import { mapMeetingRoom, type MeetingRoomRecord } from "./meetings.mapper.js";
import type {
  CancelMeetingInput,
  MeetingActivityItem,
  MeetingAgendaItem,
  MeetingAgendaItemInput,
  MeetingAttachment,
  MeetingRevisionDetail,
  MeetingTemplate,
  SaveMeetingTemplateInput,
  UpdateMeetingRescheduleInput,
  UpdateMeetingTemplateInput,
} from "./meeting-workspace.types.js";
import type { MeetingParticipant } from "./meeting-workflow.types.js";

export interface MeetingAccessContext {
  meetingId: number;
  organizerUserId: number;
  status: "PENDING_APPROVAL" | "SCHEDULED" | "REJECTED" | "CANCELLED";
  currentRevisionId: number | null;
  meetingRowVersion: string;
  isAttendee: boolean;
  hasPendingReschedule: boolean;
}

interface AccessRecord {
  meetingId: number | string;
  organizerUserId: number | string;
  status: MeetingAccessContext["status"];
  currentRevisionId: number | string | null;
  meetingRowVersion: unknown;
  isAttendee: boolean | number;
  hasPendingReschedule: boolean | number;
}

interface RevisionRecord extends MeetingRoomRecord {
  revisionId: number | string;
  revisionNumber: number | string;
  revisionType: MeetingRevisionDetail["revisionType"];
  revisionStatus: MeetingRevisionDetail["revisionStatus"];
  startAtUtc: Date;
  endAtUtc: Date;
  schedulingNotes: string | null;
  requestedByUserId: number | string;
  requestedByUserCode: string;
  requestedByUserName: string;
  approvedByUserId: number | string | null;
  approvedByUserCode: string | null;
  approvedByUserName: string | null;
  rejectedByUserId: number | string | null;
  rejectedByUserCode: string | null;
  rejectedByUserName: string | null;
  createdAtUtc: Date;
  decidedAtUtc: Date | null;
  revisionRowVersion: unknown;
}

interface ActivityRecord {
  id: number | string;
  activityType: string;
  changesJson: string | null;
  createdAtUtc: Date;
  actorUserId: number | string;
  actorUserCode: string;
  actorUserName: string;
}

interface AgendaItemRecord {
  id: number | string;
  topic: string;
  plannedDurationMinutes: number | string | null;
  sortOrder: number | string;
  presenterUserId: number | string | null;
  presenterUserCode: string | null;
  presenterUserName: string | null;
  rowVersion: unknown;
}

export interface MeetingAttachmentRecord {
  id: string;
  meetingId: number | string;
  originalFileName: string;
  storageKey: string;
  mimeType: string;
  fileExtension: string;
  sizeBytes: number | string;
  uploadedByUserId: number | string;
  uploadedByUserCode: string;
  uploadedByUserName: string;
  createdAtUtc: Date;
}

interface TemplateRecord extends Partial<MeetingRoomRecord> {
  templateId: number | string;
  templateName: string;
  templateTitle: string;
  templateDescription: string | null;
  durationMinutes: number | string;
  defaultRoomId: number | string | null;
  attendeesJson: string | null;
  templateRowVersion: unknown;
}

interface IdRecord {
  id: number | string;
}

interface RowVersionRecord {
  id: number | string;
  rowVersion: unknown;
}

function participant(
  userId: number | string,
  userCode: string,
  userName: string,
): MeetingParticipant {
  return { userId: Number(userId), userCode, userName };
}

function optionalParticipant(
  userId: number | string | null,
  userCode: string | null,
  userName: string | null,
): MeetingParticipant | null {
  if (userId === null || !userCode || !userName) return null;
  return participant(userId, userCode, userName);
}

function parseParticipants(value: string | null): MeetingParticipant[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): MeetingParticipant[] => {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as { userId?: unknown }).userId !== "number" ||
        typeof (item as { userCode?: unknown }).userCode !== "string" ||
        typeof (item as { userName?: unknown }).userName !== "string"
      ) {
        return [];
      }
      const value = item as { userId: number; userCode: string; userName: string };
      return [value];
    });
  } catch {
    return [];
  }
}

function mapRevision(record: RevisionRecord): MeetingRevisionDetail | null {
  const rowVersion = normalizeSqlRowVersion(record.revisionRowVersion);
  if (!rowVersion) return null;
  const room = mapMeetingRoom({
    id: record.id,
    code: record.code ?? null,
    nameAr: record.nameAr ?? "",
    nameEn: record.nameEn ?? "",
    locationText: record.locationText ?? null,
    colorKey: record.colorKey,
    capacity: Number(record.capacity ?? 0),
    equipmentNotes: record.equipmentNotes ?? null,
    isActive: Boolean(record.isActive),
    rowVersion: record.rowVersion,
  });
  return {
    id: Number(record.revisionId),
    revisionNumber: Number(record.revisionNumber),
    revisionType: record.revisionType,
    revisionStatus: record.revisionStatus,
    room,
    startAtUtc: record.startAtUtc.toISOString(),
    endAtUtc: record.endAtUtc.toISOString(),
    schedulingNotes: record.schedulingNotes,
    requestedBy: participant(
      record.requestedByUserId,
      record.requestedByUserCode,
      record.requestedByUserName,
    ),
    approvedBy: optionalParticipant(
      record.approvedByUserId,
      record.approvedByUserCode,
      record.approvedByUserName,
    ),
    rejectedBy: optionalParticipant(
      record.rejectedByUserId,
      record.rejectedByUserCode,
      record.rejectedByUserName,
    ),
    createdAtUtc: record.createdAtUtc.toISOString(),
    decidedAtUtc: record.decidedAtUtc?.toISOString() ?? null,
    rowVersion,
  };
}

function mapAttachment(record: MeetingAttachmentRecord): MeetingAttachment {
  return {
    id: record.id,
    meetingId: Number(record.meetingId),
    originalFileName: record.originalFileName,
    mimeType: record.mimeType,
    fileExtension: record.fileExtension,
    sizeBytes: Number(record.sizeBytes),
    uploadedBy: participant(
      record.uploadedByUserId,
      record.uploadedByUserCode,
      record.uploadedByUserName,
    ),
    createdAtUtc: record.createdAtUtc.toISOString(),
  };
}

function mapTemplate(record: TemplateRecord): MeetingTemplate | null {
  const rowVersion = normalizeSqlRowVersion(record.templateRowVersion);
  if (!rowVersion) return null;
  let defaultRoom = null;
  if (record.defaultRoomId !== null) {
    defaultRoom = mapMeetingRoom({
      id: record.id!,
      code: record.code ?? null,
      nameAr: record.nameAr ?? "",
      nameEn: record.nameEn ?? "",
      locationText: record.locationText ?? null,
      capacity: Number(record.capacity ?? 0),
      equipmentNotes: record.equipmentNotes ?? null,
      isActive: Boolean(record.isActive),
      rowVersion: record.rowVersion,
    });
  }
  return {
    id: Number(record.templateId),
    name: record.templateName,
    title: record.templateTitle,
    description: record.templateDescription,
    durationMinutes: Number(record.durationMinutes),
    defaultRoom,
    attendees: parseParticipants(record.attendeesJson),
    rowVersion,
  };
}

function requestFor(transaction?: DatabaseTransaction) {
  return transaction ? transaction.request() : null;
}

async function baseRequest(transaction?: DatabaseTransaction) {
  return requestFor(transaction) ?? (await getDatabasePool()).request();
}

const templateFields = `
  template.id AS templateId,
  template.name AS templateName,
  template.title AS templateTitle,
  template.description AS templateDescription,
  template.duration_minutes AS durationMinutes,
  template.default_room_id AS defaultRoomId,
  template.row_version AS templateRowVersion,
  room.id,
  room.code,
  room.name_ar AS nameAr,
  room.name_en AS nameEn,
  room.location_text AS locationText,
  room.color_key AS colorKey,
  room.capacity,
  room.equipment_notes AS equipmentNotes,
  CAST(room.is_active AS BIT) AS isActive,
  room.row_version AS rowVersion,
  COALESCE((
    SELECT
      portal.USER_ID AS userId,
      portal.USER_CODE AS userCode,
      portal.USER_NAME AS userName
    FROM dbo.TM_meeting_template_attendees AS attendee
    INNER JOIN dbo.users AS portal
      ON portal.USER_ID = attendee.attendee_user_id
     AND portal.IS_ACTIVE = 1
    WHERE attendee.template_id = template.id
      AND attendee.owner_user_id = template.owner_user_id
    ORDER BY portal.USER_NAME, portal.USER_ID
    FOR JSON PATH
  ), N'[]') AS attendeesJson
`;

export const meetingWorkspaceRepository = {
  async findAccessContext(
    meetingId: number,
    userId: number,
    transaction?: DatabaseTransaction,
  ): Promise<MeetingAccessContext | null> {
    const request = await baseRequest(transaction);
    const result = await request
      .input("meetingId", sql.BigInt, meetingId)
      .input("userId", sql.Int, userId)
      .query<AccessRecord>(`
        SELECT TOP (1)
          m.id AS meetingId,
          m.organizer_user_id AS organizerUserId,
          m.status,
          m.current_revision_id AS currentRevisionId,
          m.row_version AS meetingRowVersion,
          CAST(CASE WHEN EXISTS (
            SELECT 1 FROM dbo.TM_meeting_attendees AS attendee
            WHERE attendee.meeting_id = m.id AND attendee.attendee_user_id = @userId
          ) THEN 1 ELSE 0 END AS BIT) AS isAttendee,
          CAST(CASE WHEN EXISTS (
            SELECT 1 FROM dbo.TM_meeting_revisions AS revision
            WHERE revision.meeting_id = m.id
              AND revision.revision_type = 'RESCHEDULE'
              AND revision.revision_status = 'PENDING'
          ) THEN 1 ELSE 0 END AS BIT) AS hasPendingReschedule
        FROM dbo.TM_meetings AS m
        WHERE m.id = @meetingId;
      `);
    const record = result.recordset[0];
    if (!record) return null;
    const meetingRowVersion = normalizeSqlRowVersion(record.meetingRowVersion);
    if (!meetingRowVersion) return null;
    return {
      meetingId: Number(record.meetingId),
      organizerUserId: Number(record.organizerUserId),
      status: record.status,
      currentRevisionId: record.currentRevisionId === null ? null : Number(record.currentRevisionId),
      meetingRowVersion,
      isAttendee: Boolean(record.isAttendee),
      hasPendingReschedule: Boolean(record.hasPendingReschedule),
    };
  },

  async listRevisions(meetingId: number): Promise<MeetingRevisionDetail[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).query<RevisionRecord>(`
      SELECT
        revision.id AS revisionId,
        revision.revision_number AS revisionNumber,
        revision.revision_type AS revisionType,
        revision.revision_status AS revisionStatus,
        room.id,
        room.code,
        room.name_ar AS nameAr,
        room.name_en AS nameEn,
        room.location_text AS locationText,
        room.color_key AS colorKey,
        room.capacity,
        room.equipment_notes AS equipmentNotes,
        CAST(room.is_active AS BIT) AS isActive,
        room.row_version AS rowVersion,
        revision.start_at_utc AS startAtUtc,
        revision.end_at_utc AS endAtUtc,
        revision.scheduling_notes AS schedulingNotes,
        requested.USER_ID AS requestedByUserId,
        requested.USER_CODE AS requestedByUserCode,
        requested.USER_NAME AS requestedByUserName,
        approved.USER_ID AS approvedByUserId,
        approved.USER_CODE AS approvedByUserCode,
        approved.USER_NAME AS approvedByUserName,
        rejected.USER_ID AS rejectedByUserId,
        rejected.USER_CODE AS rejectedByUserCode,
        rejected.USER_NAME AS rejectedByUserName,
        revision.created_at_utc AS createdAtUtc,
        revision.decided_at_utc AS decidedAtUtc,
        revision.row_version AS revisionRowVersion
      FROM dbo.TM_meeting_revisions AS revision
      INNER JOIN dbo.TM_meeting_rooms AS room ON room.id = revision.room_id
      INNER JOIN dbo.users AS requested ON requested.USER_ID = revision.requested_by_user_id
      LEFT JOIN dbo.users AS approved ON approved.USER_ID = revision.approved_by_user_id
      LEFT JOIN dbo.users AS rejected ON rejected.USER_ID = revision.rejected_by_user_id
      WHERE revision.meeting_id = @meetingId
      ORDER BY revision.revision_number DESC, revision.id DESC;
    `);
    return result.recordset.map(mapRevision).filter((item): item is MeetingRevisionDetail => item !== null);
  },

  async listMeetingAttendeeIds(
    transaction: DatabaseTransaction,
    meetingId: number,
  ): Promise<number[]> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .query<{ attendeeUserId: number | string }>(`
        SELECT attendee_user_id AS attendeeUserId
        FROM dbo.TM_meeting_attendees
        WHERE meeting_id = @meetingId;
      `);
    return result.recordset.map((record) => Number(record.attendeeUserId));
  },

  async replaceAgendaItems(
    transaction: DatabaseTransaction,
    input: {
      meetingId: number;
      actorUserId: number;
      expectedMeetingRowVersion: string;
      agendaItems: readonly MeetingAgendaItemInput[];
    },
  ): Promise<boolean> {
    const touched = await transaction
      .request()
      .input("meetingId", sql.BigInt, input.meetingId)
      .input("meetingRowVersion", sql.VarBinary(8), rowVersionToBuffer(input.expectedMeetingRowVersion))
      .query<{ affected: number }>(`
        UPDATE dbo.TM_meetings
        SET updated_at_utc = SYSUTCDATETIME()
        WHERE id = @meetingId
          AND row_version = @meetingRowVersion;

        SELECT @@ROWCOUNT AS affected;
      `);

    if (Number(touched.recordset[0]?.affected ?? 0) !== 1) return false;

    await transaction
      .request()
      .input("meetingId", sql.BigInt, input.meetingId)
      .query(`DELETE FROM dbo.TM_meeting_agenda_items WHERE meeting_id = @meetingId;`);

    for (const [index, item] of input.agendaItems.entries()) {
      await transaction
        .request()
        .input("meetingId", sql.BigInt, input.meetingId)
        .input("sortOrder", sql.Int, index + 1)
        .input("topic", sql.NVarChar(500), item.topic)
        .input("presenterUserId", sql.Int, item.presenterUserId)
        .input("plannedDurationMinutes", sql.Int, item.plannedDurationMinutes)
        .input("actorUserId", sql.Int, input.actorUserId)
        .query(`
          INSERT INTO dbo.TM_meeting_agenda_items (
            meeting_id,
            sort_order,
            topic,
            presenter_user_id,
            planned_duration_minutes,
            created_by_user_id,
            updated_at_utc
          ) VALUES (
            @meetingId,
            @sortOrder,
            @topic,
            @presenterUserId,
            @plannedDurationMinutes,
            @actorUserId,
            SYSUTCDATETIME()
          );
        `);
    }

    return true;
  },

  async listAgendaItems(meetingId: number): Promise<MeetingAgendaItem[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .query<AgendaItemRecord>(`
        SELECT
          agenda.id,
          agenda.topic,
          agenda.planned_duration_minutes AS plannedDurationMinutes,
          agenda.sort_order AS sortOrder,
          presenter.USER_ID AS presenterUserId,
          presenter.USER_CODE AS presenterUserCode,
          presenter.USER_NAME AS presenterUserName,
          agenda.row_version AS rowVersion
        FROM dbo.TM_meeting_agenda_items AS agenda
        LEFT JOIN dbo.users AS presenter ON presenter.USER_ID = agenda.presenter_user_id
        WHERE agenda.meeting_id = @meetingId
        ORDER BY agenda.sort_order, agenda.id;
      `);

    return result.recordset.flatMap((record): MeetingAgendaItem[] => {
      const rowVersion = normalizeSqlRowVersion(record.rowVersion);
      if (!rowVersion) return [];

      return [
        {
          id: Number(record.id),
          topic: record.topic,
          presenter: optionalParticipant(
            record.presenterUserId,
            record.presenterUserCode,
            record.presenterUserName,
          ),
          plannedDurationMinutes:
            record.plannedDurationMinutes === null
              ? null
              : Number(record.plannedDurationMinutes),
          sortOrder: Number(record.sortOrder),
          rowVersion,
        },
      ];
    });
  },

  async listActivity(meetingId: number): Promise<MeetingActivityItem[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).query<ActivityRecord>(`
      SELECT
        activity.id,
        activity.activity_type AS activityType,
        activity.changes_json AS changesJson,
        activity.created_at_utc AS createdAtUtc,
        actor.USER_ID AS actorUserId,
        actor.USER_CODE AS actorUserCode,
        actor.USER_NAME AS actorUserName
      FROM dbo.TM_meeting_activity AS activity
      INNER JOIN dbo.users AS actor ON actor.USER_ID = activity.actor_user_id
      WHERE activity.meeting_id = @meetingId
      ORDER BY activity.created_at_utc DESC, activity.id DESC;
    `);
    return result.recordset.map((record) => {
      let changes: Record<string, unknown> | null = null;
      if (record.changesJson) {
        try {
          const parsed: unknown = JSON.parse(record.changesJson);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            changes = parsed as Record<string, unknown>;
          }
        } catch {
          changes = null;
        }
      }
      return {
        id: Number(record.id),
        activityType: record.activityType,
        actor: participant(record.actorUserId, record.actorUserCode, record.actorUserName),
        changes,
        createdAtUtc: record.createdAtUtc.toISOString(),
      };
    });
  },

  async pendingRescheduleExistsForUpdate(
    transaction: DatabaseTransaction,
    meetingId: number,
  ): Promise<boolean> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .query<{ id: number | string }>(`
        SELECT TOP (1) id
        FROM dbo.TM_meeting_revisions WITH (UPDLOCK, HOLDLOCK)
        WHERE meeting_id = @meetingId
          AND revision_type = 'RESCHEDULE'
          AND revision_status = 'PENDING';
      `);
    return result.recordset.length > 0;
  },

  async createRescheduleRevision(
    transaction: DatabaseTransaction,
    meetingId: number,
    actorUserId: number,
    input: { roomId: number; startAtUtc: Date; endAtUtc: Date; schedulingNotes?: string | null },
  ): Promise<{ revisionId: number; rowVersion: string } | null> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("actorUserId", sql.Int, actorUserId)
      .input("roomId", sql.BigInt, input.roomId)
      .input("startAtUtc", sql.DateTime2(3), input.startAtUtc)
      .input("endAtUtc", sql.DateTime2(3), input.endAtUtc)
      .input("schedulingNotes", sql.NVarChar(1000), input.schedulingNotes ?? null)
      .query<RowVersionRecord>(`
        DECLARE @nextRevisionNumber INT;
        SELECT @nextRevisionNumber = ISNULL(MAX(revision_number), 0) + 1
        FROM dbo.TM_meeting_revisions WITH (UPDLOCK, HOLDLOCK)
        WHERE meeting_id = @meetingId;

        INSERT INTO dbo.TM_meeting_revisions (
          meeting_id,
          revision_number,
          revision_type,
          revision_status,
          room_id,
          start_at_utc,
          end_at_utc,
          scheduling_notes,
          requested_by_user_id
        )
        OUTPUT inserted.id, inserted.row_version AS rowVersion
        VALUES (
          @meetingId,
          @nextRevisionNumber,
          'RESCHEDULE',
          'PENDING',
          @roomId,
          @startAtUtc,
          @endAtUtc,
          @schedulingNotes,
          @actorUserId
        );
      `);
    const record = result.recordset[0];
    if (!record) return null;
    const rowVersion = normalizeSqlRowVersion(record.rowVersion);
    return rowVersion ? { revisionId: Number(record.id), rowVersion } : null;
  },

  async listPendingRescheduleMeetingIds(): Promise<number[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().query<IdRecord>(`
      SELECT DISTINCT m.id
      FROM dbo.TM_meetings AS m
      INNER JOIN dbo.TM_meeting_revisions AS revision ON revision.meeting_id = m.id
      WHERE m.status = 'SCHEDULED'
        AND revision.revision_type = 'RESCHEDULE'
        AND revision.revision_status = 'PENDING'
      ORDER BY m.id;
    `);
    return result.recordset.map((record) => Number(record.id));
  },

  async updatePendingRescheduleRequestedSchedule(
    transaction: DatabaseTransaction,
    meetingId: number,
    input: {
      revisionId: number;
      revisionRowVersion: string;
      roomId: number;
      startAtUtc: string;
      endAtUtc: string;
    },
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
      .query(`
        UPDATE dbo.TM_meeting_revisions
        SET room_id = @roomId,
            start_at_utc = @startAtUtc,
            end_at_utc = @endAtUtc
        WHERE id = @revisionId
          AND meeting_id = @meetingId
          AND revision_type = 'RESCHEDULE'
          AND revision_status = 'PENDING'
          AND row_version = @rowVersion;
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async updatePendingRescheduleSchedule(
    transaction: DatabaseTransaction,
    meetingId: number,
    input: UpdateMeetingRescheduleInput,
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
        SET room_id = @roomId,
            start_at_utc = @startAtUtc,
            end_at_utc = @endAtUtc,
            scheduling_notes = @schedulingNotes
        WHERE id = @revisionId
          AND meeting_id = @meetingId
          AND revision_type = 'RESCHEDULE'
          AND revision_status = 'PENDING'
          AND row_version = @rowVersion;
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async rejectPendingReschedule(
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
        SET revision_status = 'REJECTED',
            rejected_by_user_id = @actorUserId,
            approved_by_user_id = NULL,
            decided_at_utc = SYSUTCDATETIME()
        WHERE id = @revisionId
          AND meeting_id = @meetingId
          AND revision_type = 'RESCHEDULE'
          AND revision_status = 'PENDING'
          AND row_version = @rowVersion;
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async rejectPendingRevisionsOnCancellation(
    transaction: DatabaseTransaction,
    meetingId: number,
    actorUserId: number,
  ): Promise<void> {
    await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("actorUserId", sql.Int, actorUserId)
      .query(`
        UPDATE dbo.TM_meeting_revisions
        SET revision_status = 'REJECTED',
            approved_by_user_id = NULL,
            rejected_by_user_id = @actorUserId,
            decided_at_utc = SYSUTCDATETIME()
        WHERE meeting_id = @meetingId
          AND revision_status = 'PENDING';
      `);
  },

  async cancelMeeting(
    transaction: DatabaseTransaction,
    meetingId: number,
    input: CancelMeetingInput,
  ): Promise<boolean> {
    const rowVersion = rowVersionToBuffer(input.meetingRowVersion);
    if (!rowVersion) return false;
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("rowVersion", sql.VarBinary(8), rowVersion)
      .query(`
        UPDATE dbo.TM_meetings
        SET status = 'CANCELLED',
            cancelled_at_utc = SYSUTCDATETIME(),
            updated_at_utc = SYSUTCDATETIME()
        WHERE id = @meetingId
          AND status IN ('PENDING_APPROVAL', 'SCHEDULED')
          AND row_version = @rowVersion;
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async countActiveAttachments(
    transaction: DatabaseTransaction,
    meetingId: number,
  ): Promise<number> {
    const result = await transaction.request().input("meetingId", sql.BigInt, meetingId).query<{ total: number | string }>(`
      SELECT COUNT_BIG(1) AS total
      FROM dbo.TM_meeting_attachments WITH (UPDLOCK, HOLDLOCK)
      WHERE meeting_id = @meetingId AND is_active = 1;
    `);
    return Number(result.recordset[0]?.total ?? 0);
  },

  async listAttachments(meetingId: number): Promise<MeetingAttachment[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("meetingId", sql.BigInt, meetingId).query<MeetingAttachmentRecord>(`
      SELECT
        attachment.id,
        attachment.meeting_id AS meetingId,
        attachment.original_file_name AS originalFileName,
        attachment.storage_key AS storageKey,
        attachment.mime_type AS mimeType,
        attachment.file_extension AS fileExtension,
        attachment.size_bytes AS sizeBytes,
        uploader.USER_ID AS uploadedByUserId,
        uploader.USER_CODE AS uploadedByUserCode,
        uploader.USER_NAME AS uploadedByUserName,
        attachment.created_at_utc AS createdAtUtc
      FROM dbo.TM_meeting_attachments AS attachment
      INNER JOIN dbo.users AS uploader ON uploader.USER_ID = attachment.uploaded_by_user_id
      WHERE attachment.meeting_id = @meetingId
        AND attachment.is_active = 1
      ORDER BY attachment.created_at_utc DESC, attachment.id DESC;
    `);
    return result.recordset.map(mapAttachment);
  },

  async createAttachment(
    transaction: DatabaseTransaction,
    input: {
      meetingId: number;
      actorUserId: number;
      originalFileName: string;
      storageKey: string;
      mimeType: string;
      fileExtension: string;
      sizeBytes: number;
    },
  ): Promise<MeetingAttachmentRecord | null> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, input.meetingId)
      .input("actorUserId", sql.Int, input.actorUserId)
      .input("originalFileName", sql.NVarChar(260), input.originalFileName)
      .input("storageKey", sql.VarChar(500), input.storageKey)
      .input("mimeType", sql.VarChar(255), input.mimeType)
      .input("fileExtension", sql.VarChar(20), input.fileExtension)
      .input("sizeBytes", sql.BigInt, input.sizeBytes)
      .query<MeetingAttachmentRecord>(`
        INSERT INTO dbo.TM_meeting_attachments (
          meeting_id,
          original_file_name,
          storage_key,
          mime_type,
          file_extension,
          size_bytes,
          uploaded_by_user_id
        )
        OUTPUT
          inserted.id,
          inserted.meeting_id AS meetingId,
          inserted.original_file_name AS originalFileName,
          inserted.storage_key AS storageKey,
          inserted.mime_type AS mimeType,
          inserted.file_extension AS fileExtension,
          inserted.size_bytes AS sizeBytes,
          @actorUserId AS uploadedByUserId,
          N'' AS uploadedByUserCode,
          N'' AS uploadedByUserName,
          inserted.created_at_utc AS createdAtUtc
        VALUES (
          @meetingId,
          @originalFileName,
          @storageKey,
          @mimeType,
          @fileExtension,
          @sizeBytes,
          @actorUserId
        );
      `);
    return result.recordset[0] ?? null;
  },

  async findAttachment(
    attachmentId: string,
    transaction?: DatabaseTransaction,
  ): Promise<MeetingAttachmentRecord | null> {
    const request = await baseRequest(transaction);
    const result = await request.input("attachmentId", sql.UniqueIdentifier, attachmentId).query<MeetingAttachmentRecord>(`
      SELECT TOP (1)
        attachment.id,
        attachment.meeting_id AS meetingId,
        attachment.original_file_name AS originalFileName,
        attachment.storage_key AS storageKey,
        attachment.mime_type AS mimeType,
        attachment.file_extension AS fileExtension,
        attachment.size_bytes AS sizeBytes,
        uploader.USER_ID AS uploadedByUserId,
        uploader.USER_CODE AS uploadedByUserCode,
        uploader.USER_NAME AS uploadedByUserName,
        attachment.created_at_utc AS createdAtUtc
      FROM dbo.TM_meeting_attachments AS attachment
      INNER JOIN dbo.users AS uploader ON uploader.USER_ID = attachment.uploaded_by_user_id
      WHERE attachment.id = @attachmentId
        AND attachment.is_active = 1;
    `);
    return result.recordset[0] ?? null;
  },

  async deactivateAttachment(
    transaction: DatabaseTransaction,
    attachmentId: string,
  ): Promise<boolean> {
    const result = await transaction.request().input("attachmentId", sql.UniqueIdentifier, attachmentId).query(`
      UPDATE dbo.TM_meeting_attachments
      SET is_active = 0, updated_at_utc = SYSUTCDATETIME()
      WHERE id = @attachmentId AND is_active = 1;
    `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async listTemplates(ownerUserId: number): Promise<MeetingTemplate[]> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("ownerUserId", sql.Int, ownerUserId).query<TemplateRecord>(`
      SELECT ${templateFields}
      FROM dbo.TM_meeting_templates AS template
      LEFT JOIN dbo.TM_meeting_rooms AS room ON room.id = template.default_room_id
      WHERE template.owner_user_id = @ownerUserId
        AND template.is_active = 1
      ORDER BY COALESCE(template.updated_at_utc, template.created_at_utc) DESC, template.id DESC;
    `);
    return result.recordset.map(mapTemplate).filter((item): item is MeetingTemplate => item !== null);
  },

  async findTemplate(
    ownerUserId: number,
    templateId: number,
    transaction?: DatabaseTransaction,
  ): Promise<MeetingTemplate | null> {
    const request = await baseRequest(transaction);
    const result = await request
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("templateId", sql.BigInt, templateId)
      .query<TemplateRecord>(`
        SELECT ${templateFields}
        FROM dbo.TM_meeting_templates AS template
        LEFT JOIN dbo.TM_meeting_rooms AS room ON room.id = template.default_room_id
        WHERE template.owner_user_id = @ownerUserId
          AND template.id = @templateId
          AND template.is_active = 1;
      `);
    const record = result.recordset[0];
    return record ? mapTemplate(record) : null;
  },

  async activeTemplateNameExists(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    name: string,
    excludeTemplateId?: number,
  ): Promise<boolean> {
    const result = await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("name", sql.NVarChar(150), name)
      .input("excludeTemplateId", sql.BigInt, excludeTemplateId ?? null)
      .query<{ total: number | string }>(`
        SELECT COUNT_BIG(1) AS total
        FROM dbo.TM_meeting_templates WITH (UPDLOCK, HOLDLOCK)
        WHERE owner_user_id = @ownerUserId
          AND is_active = 1
          AND name = @name
          AND (@excludeTemplateId IS NULL OR id <> @excludeTemplateId);
      `);
    return Number(result.recordset[0]?.total ?? 0) > 0;
  },

  async createTemplate(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    input: SaveMeetingTemplateInput,
  ): Promise<number> {
    const result = await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("name", sql.NVarChar(150), input.name)
      .input("title", sql.NVarChar(250), input.title)
      .input("description", sql.NVarChar(sql.MAX), input.description ?? null)
      .input("durationMinutes", sql.Int, input.durationMinutes)
      .input("defaultRoomId", sql.BigInt, input.defaultRoomId ?? null)
      .query<IdRecord>(`
        INSERT INTO dbo.TM_meeting_templates (
          owner_user_id,
          name,
          title,
          description,
          duration_minutes,
          default_room_id
        )
        OUTPUT inserted.id
        VALUES (
          @ownerUserId,
          @name,
          @title,
          @description,
          @durationMinutes,
          @defaultRoomId
        );
      `);
    return Number(result.recordset[0]?.id ?? 0);
  },

  async replaceTemplateAttendees(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    templateId: number,
    attendeeUserIds: readonly number[],
  ): Promise<void> {
    await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("templateId", sql.BigInt, templateId)
      .query(`
        DELETE FROM dbo.TM_meeting_template_attendees
        WHERE template_id = @templateId AND owner_user_id = @ownerUserId;
      `);
    for (const attendeeUserId of attendeeUserIds) {
      await transaction
        .request()
        .input("ownerUserId", sql.Int, ownerUserId)
        .input("templateId", sql.BigInt, templateId)
        .input("attendeeUserId", sql.Int, attendeeUserId)
        .query(`
          INSERT INTO dbo.TM_meeting_template_attendees (
            template_id, owner_user_id, attendee_user_id
          ) VALUES (@templateId, @ownerUserId, @attendeeUserId);
        `);
    }
  },

  async updateTemplate(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    templateId: number,
    input: UpdateMeetingTemplateInput,
  ): Promise<boolean> {
    const rowVersion = rowVersionToBuffer(input.rowVersion);
    if (!rowVersion) return false;
    const result = await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("templateId", sql.BigInt, templateId)
      .input("rowVersion", sql.VarBinary(8), rowVersion)
      .input("name", sql.NVarChar(150), input.name)
      .input("title", sql.NVarChar(250), input.title)
      .input("description", sql.NVarChar(sql.MAX), input.description ?? null)
      .input("durationMinutes", sql.Int, input.durationMinutes)
      .input("defaultRoomId", sql.BigInt, input.defaultRoomId ?? null)
      .query(`
        UPDATE dbo.TM_meeting_templates
        SET name = @name,
            title = @title,
            description = @description,
            duration_minutes = @durationMinutes,
            default_room_id = @defaultRoomId,
            updated_at_utc = SYSUTCDATETIME()
        WHERE id = @templateId
          AND owner_user_id = @ownerUserId
          AND is_active = 1
          AND row_version = @rowVersion;
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async archiveTemplate(
    transaction: DatabaseTransaction,
    ownerUserId: number,
    templateId: number,
    rowVersionValue: string,
  ): Promise<boolean> {
    const rowVersion = rowVersionToBuffer(rowVersionValue);
    if (!rowVersion) return false;
    const result = await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("templateId", sql.BigInt, templateId)
      .input("rowVersion", sql.VarBinary(8), rowVersion)
      .query(`
        UPDATE dbo.TM_meeting_templates
        SET is_active = 0, updated_at_utc = SYSUTCDATETIME()
        WHERE id = @templateId
          AND owner_user_id = @ownerUserId
          AND is_active = 1
          AND row_version = @rowVersion;
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },
};

export function mapMeetingAttachmentRecord(record: MeetingAttachmentRecord): MeetingAttachment {
  return mapAttachment(record);
}

