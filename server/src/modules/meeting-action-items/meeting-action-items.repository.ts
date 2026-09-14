import { getDatabasePool, sql } from "../../database/sql.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import {
  normalizeSqlRowVersion,
  rowVersionToBuffer,
} from "../../shared/utils/sql-row-version.js";
import type {
  AssignedMeetingActionItemQuery,
  AssignedMeetingActionItemSummary,
  AssignedMeetingOption,
  MeetingActionItemAssigneeOption,
  MeetingActionItemContext,
  MeetingActionItemListItem,
  MeetingActionItemMeetingSummary,
} from "./meeting-action-items.types.js";

interface RelationshipRecord {
  taskId: number | string;
  ownerUserId: number;
  meetingId: number | string;
  meetingTitle: string;
  organizerUserId: number;
  organizerName: string;
  assigneeUserId: number;
  assigneeName: string;
  assignedByUserId: number;
  assignedByName: string;
  agendaItemId: number | string | null;
  agendaTitle: string | null;
  assignedAtUtc: Date;
  rowVersion: unknown;
}

interface ListRecord extends RelationshipRecord {
  title: string;
  description: string | null;
  status: MeetingActionItemListItem["status"];
  priority: MeetingActionItemListItem["priority"];
  startDate: Date | null;
  dueDate: Date | null;
  isOverdue: boolean;
  subtaskTotal: number | string;
  subtaskCompleted: number | string;
}

function normalizedRowVersion(value: unknown): string {
  const result = normalizeSqlRowVersion(value);
  if (!result) throw new Error("Invalid Meeting Action Item row version.");
  return result;
}

function mapContext(record: RelationshipRecord): MeetingActionItemContext {
  return {
    taskId: Number(record.taskId),
    ownerUserId: Number(record.ownerUserId),
    meetingId: Number(record.meetingId),
    meetingTitle: record.meetingTitle,
    organizerUserId: Number(record.organizerUserId),
    organizerName: record.organizerName,
    assigneeUserId: Number(record.assigneeUserId),
    assigneeName: record.assigneeName,
    assignedByUserId: Number(record.assignedByUserId),
    assignedByName: record.assignedByName,
    agendaItemId: record.agendaItemId === null ? null : Number(record.agendaItemId),
    agendaTitle: record.agendaTitle,
    assignedAtUtc: record.assignedAtUtc.toISOString(),
    rowVersion: normalizedRowVersion(record.rowVersion),
  };
}

function mapListItem(record: ListRecord): MeetingActionItemListItem {
  const context = mapContext(record);
  return {
    taskId: context.taskId,
    meetingId: context.meetingId,
    meetingTitle: context.meetingTitle,
    organizerUserId: context.organizerUserId,
    organizerName: context.organizerName,
    title: record.title,
    description: record.description,
    status: record.status,
    priority: record.priority,
    startDate: record.startDate?.toISOString().slice(0, 10) ?? null,
    dueDate: record.dueDate?.toISOString().slice(0, 10) ?? null,
    isOverdue: Boolean(record.isOverdue),
    subtaskTotal: Number(record.subtaskTotal ?? 0),
    subtaskCompleted: Number(record.subtaskCompleted ?? 0),
    assigneeUserId: context.assigneeUserId,
    assigneeName: context.assigneeName,
    assignedByUserId: context.assignedByUserId,
    assignedByName: context.assignedByName,
    agendaItemId: context.agendaItemId,
    agendaTitle: context.agendaTitle,
    assignedAtUtc: context.assignedAtUtc,
    rowVersion: context.rowVersion,
  };
}

const relationshipSelect = `
  relation.task_id AS taskId,
  task.owner_user_id AS ownerUserId,
  relation.meeting_id AS meetingId,
  meeting.title AS meetingTitle,
  meeting.organizer_user_id AS organizerUserId,
  COALESCE(organizer.USER_NAME, organizer.USER_CODE) AS organizerName,
  relation.assignee_user_id AS assigneeUserId,
  COALESCE(assignee.USER_NAME, assignee.USER_CODE) AS assigneeName,
  relation.assigned_by_user_id AS assignedByUserId,
  COALESCE(assignedBy.USER_NAME, assignedBy.USER_CODE) AS assignedByName,
  relation.agenda_item_id AS agendaItemId,
  agenda.topic AS agendaTitle,
  relation.assigned_at_utc AS assignedAtUtc,
  relation.row_version AS rowVersion`;

const relationshipJoins = `
  INNER JOIN dbo.TM_tasks AS task ON task.id = relation.task_id
  INNER JOIN dbo.TM_meetings AS meeting ON meeting.id = relation.meeting_id
  INNER JOIN dbo.users AS organizer ON organizer.USER_ID = meeting.organizer_user_id
  INNER JOIN dbo.users AS assignee ON assignee.USER_ID = relation.assignee_user_id
  INNER JOIN dbo.users AS assignedBy ON assignedBy.USER_ID = relation.assigned_by_user_id
  LEFT JOIN dbo.TM_meeting_agenda_items AS agenda ON agenda.id = relation.agenda_item_id`;

const taskColumns = `
  task.title,
  task.description,
  task.status,
  task.priority,
  task.start_date AS startDate,
  task.due_date AS dueDate,
  CAST(CASE WHEN task.due_date < @today
    AND task.status NOT IN ('DONE', 'CANCELLED') THEN 1 ELSE 0 END AS BIT) AS isOverdue,
  ISNULL(subtaskSummary.total, 0) AS subtaskTotal,
  ISNULL(subtaskSummary.completed, 0) AS subtaskCompleted`;

const subtaskSummary = `OUTER APPLY (
  SELECT COUNT_BIG(*) AS total,
    COALESCE(SUM(CASE WHEN subtask.is_completed = 1 THEN 1 ELSE 0 END), 0) AS completed
  FROM dbo.TM_subtasks AS subtask
  WHERE subtask.task_id = task.id
    AND subtask.owner_user_id = task.owner_user_id
    AND subtask.deleted_at_utc IS NULL
) AS subtaskSummary`;

export const meetingActionItemsRepository = {
  async findContext(
    taskId: number,
    transaction?: DatabaseTransaction,
    includeDeleted = false,
  ): Promise<MeetingActionItemContext | null> {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request.input("taskId", sql.BigInt, taskId).query<RelationshipRecord>(`
      SELECT TOP (1) ${relationshipSelect}
      FROM dbo.TM_meeting_action_items AS relation ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      ${relationshipJoins}
      WHERE relation.task_id = @taskId
        ${includeDeleted ? "" : "AND task.deleted_at_utc IS NULL"};
    `);
    const record = result.recordset[0];
    return record ? mapContext(record) : null;
  },

  async meetingTitle(
    meetingId: number,
    transaction?: DatabaseTransaction,
  ): Promise<string | null> {
    const request = transaction ? transaction.request() : (await getDatabasePool()).request();
    const result = await request
      .input("meetingId", sql.BigInt, meetingId)
      .query<{ title: string }>(`
        SELECT TOP (1) title FROM dbo.TM_meetings WHERE id = @meetingId;
      `);
    return result.recordset[0]?.title ?? null;
  },

  async listAssigneeOptions(
    meetingId: number,
    organizerUserId: number,
  ): Promise<MeetingActionItemAssigneeOption[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("organizerUserId", sql.Int, organizerUserId)
      .query<{ userId: number; userCode: string; userName: string; eligible: boolean }>(`
        SELECT
          portal.USER_ID AS userId,
          portal.USER_CODE AS userCode,
          portal.USER_NAME AS userName,
          CAST(CASE WHEN portal.IS_ACTIVE = 1
            AND access.portal_user_id IS NOT NULL
            AND access.is_active = 1 THEN 1 ELSE 0 END AS BIT) AS eligible
        FROM dbo.TM_meeting_attendees AS attendee
        INNER JOIN dbo.users AS portal ON portal.USER_ID = attendee.attendee_user_id
        LEFT JOIN dbo.TM_user_access AS access ON access.portal_user_id = portal.USER_ID
        WHERE attendee.meeting_id = @meetingId
          AND attendee.attendee_user_id <> @organizerUserId
        ORDER BY
          CASE WHEN portal.IS_ACTIVE = 1 AND access.portal_user_id IS NOT NULL AND access.is_active = 1
            THEN 0 ELSE 1 END,
          portal.USER_NAME,
          portal.USER_CODE;
      `);
    return result.recordset.map((row) => ({
      userId: Number(row.userId),
      userCode: row.userCode,
      userName: row.userName,
      eligible: Boolean(row.eligible),
    }));
  },

  async eligibleAssignee(
    transaction: DatabaseTransaction,
    meetingId: number,
    organizerUserId: number,
    assigneeUserId: number,
  ): Promise<boolean> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("organizerUserId", sql.Int, organizerUserId)
      .input("assigneeUserId", sql.Int, assigneeUserId)
      .query<{ userId: number }>(`
        SELECT TOP (1) portal.USER_ID AS userId
        FROM dbo.TM_meeting_attendees AS attendee
        INNER JOIN dbo.users AS portal
          ON portal.USER_ID = attendee.attendee_user_id
         AND portal.IS_ACTIVE = 1
        INNER JOIN dbo.TM_user_access AS access
          ON access.portal_user_id = portal.USER_ID
         AND access.is_active = 1
        WHERE attendee.meeting_id = @meetingId
          AND attendee.attendee_user_id = @assigneeUserId
          AND attendee.attendee_user_id <> @organizerUserId;
      `);
    return Boolean(result.recordset[0]);
  },

  async agendaBelongsToMeeting(
    transaction: DatabaseTransaction,
    meetingId: number,
    agendaItemId: number,
  ): Promise<boolean> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("agendaItemId", sql.BigInt, agendaItemId)
      .query<{ id: number }>(`
        SELECT TOP (1) id
        FROM dbo.TM_meeting_agenda_items
        WHERE id = @agendaItemId AND meeting_id = @meetingId;
      `);
    return Boolean(result.recordset[0]);
  },

  async defaultListId(
    transaction: DatabaseTransaction,
    ownerUserId: number,
  ): Promise<number | null> {
    const result = await transaction
      .request()
      .input("ownerUserId", sql.Int, ownerUserId)
      .query<{ id: number }>(`
        SELECT TOP (1) id
        FROM dbo.TM_lists WITH (UPDLOCK, HOLDLOCK)
        WHERE owner_user_id = @ownerUserId
          AND is_default = 1
          AND archived_at_utc IS NULL;
      `);
    return result.recordset[0]?.id ?? null;
  },

  async createRelationship(
    transaction: DatabaseTransaction,
    values: {
      taskId: number;
      meetingId: number;
      agendaItemId: number | null;
      assigneeUserId: number;
      assignedByUserId: number;
    },
  ): Promise<string> {
    const result = await transaction
      .request()
      .input("taskId", sql.BigInt, values.taskId)
      .input("meetingId", sql.BigInt, values.meetingId)
      .input("agendaItemId", sql.BigInt, values.agendaItemId)
      .input("assigneeUserId", sql.Int, values.assigneeUserId)
      .input("assignedByUserId", sql.Int, values.assignedByUserId)
      .query<{ rowVersion: unknown }>(`
        INSERT INTO dbo.TM_meeting_action_items (
          task_id,
          meeting_id,
          agenda_item_id,
          assignee_user_id,
          assigned_by_user_id
        )
        OUTPUT inserted.row_version AS rowVersion
        VALUES (
          @taskId,
          @meetingId,
          @agendaItemId,
          @assigneeUserId,
          @assignedByUserId
        );
      `);
    return normalizedRowVersion(result.recordset[0]?.rowVersion);
  },

  async updateAssignee(
    transaction: DatabaseTransaction,
    taskId: number,
    assigneeUserId: number,
    assignedByUserId: number,
    expectedRowVersion: string,
  ): Promise<string | null> {
    const rowVersion = rowVersionToBuffer(expectedRowVersion);
    if (!rowVersion) return null;
    const result = await transaction
      .request()
      .input("taskId", sql.BigInt, taskId)
      .input("assigneeUserId", sql.Int, assigneeUserId)
      .input("assignedByUserId", sql.Int, assignedByUserId)
      .input("rowVersion", sql.VarBinary(8), rowVersion)
      .query<{ rowVersion: unknown }>(`
        UPDATE dbo.TM_meeting_action_items
        SET assignee_user_id = @assigneeUserId,
            assigned_by_user_id = @assignedByUserId,
            assigned_at_utc = SYSUTCDATETIME()
        OUTPUT inserted.row_version AS rowVersion
        WHERE task_id = @taskId
          AND row_version = @rowVersion;
      `);
    const updated = result.recordset[0];
    return updated ? normalizedRowVersion(updated.rowVersion) : null;
  },

  async listForMeeting(
    meetingId: number,
    actorUserId: number,
  ): Promise<MeetingActionItemListItem[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("actorUserId", sql.Int, actorUserId)
      .input("today", sql.Date, getCurrentDateInAppTimeZone())
      .query<ListRecord>(`
        SELECT ${relationshipSelect}, ${taskColumns}
        FROM dbo.TM_meeting_action_items AS relation
        ${relationshipJoins}
        ${subtaskSummary}
        WHERE relation.meeting_id = @meetingId
          AND task.deleted_at_utc IS NULL
          AND (
            meeting.organizer_user_id = @actorUserId
            OR relation.assignee_user_id = @actorUserId
          )
        ORDER BY relation.assigned_at_utc DESC, relation.task_id DESC;
      `);
    return result.recordset.map(mapListItem);
  },

  async summarizeForMeeting(
    meetingId: number,
    actorUserId: number,
  ): Promise<MeetingActionItemMeetingSummary> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("actorUserId", sql.Int, actorUserId)
      .input("today", sql.Date, getCurrentDateInAppTimeZone())
      .query<{ total: number | string; completed: number | string; overdue: number | string }>(`
        SELECT
          COUNT_BIG(*) AS total,
          COALESCE(SUM(CASE WHEN task.status = 'DONE' THEN 1 ELSE 0 END), 0) AS completed,
          COALESCE(SUM(CASE
            WHEN task.due_date < @today AND task.status NOT IN ('DONE', 'CANCELLED') THEN 1
            ELSE 0
          END), 0) AS overdue
        FROM dbo.TM_meeting_action_items AS relation
        INNER JOIN dbo.TM_tasks AS task ON task.id = relation.task_id
        INNER JOIN dbo.TM_meetings AS meeting ON meeting.id = relation.meeting_id
        WHERE relation.meeting_id = @meetingId
          AND task.deleted_at_utc IS NULL
          AND (
            meeting.organizer_user_id = @actorUserId
            OR relation.assignee_user_id = @actorUserId
          );
      `);
    const row = result.recordset[0];
    return {
      total: Number(row?.total ?? 0),
      completed: Number(row?.completed ?? 0),
      overdue: Number(row?.overdue ?? 0),
    };
  },

  async listAssigned(
    actorUserId: number,
    query: AssignedMeetingActionItemQuery,
  ): Promise<{
    items: MeetingActionItemListItem[];
    total: number;
    summary: AssignedMeetingActionItemSummary;
    meetings: AssignedMeetingOption[];
  }> {
    const pool = await getDatabasePool();
    const direction = query.sortDirection === "asc" ? "ASC" : "DESC";
    const sortSql: Record<AssignedMeetingActionItemQuery["sortBy"], string> = {
      assignedAt: `relation.assigned_at_utc ${direction}`,
      dueDate: `CASE WHEN task.due_date IS NULL THEN 1 ELSE 0 END ASC, task.due_date ${direction}`,
      priority: `CASE task.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END ${direction}`,
      title: `task.title ${direction}`,
      status: `CASE task.status WHEN 'TODO' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'DONE' THEN 3 ELSE 4 END ${direction}`,
      meeting: `meeting.title ${direction}`,
    };
    const groupSql: Record<AssignedMeetingActionItemQuery["groupBy"], string> = {
      NONE: "",
      MEETING: "meeting.title ASC, relation.meeting_id ASC",
      DUE_DATE: "CASE WHEN task.due_date IS NULL THEN 1 ELSE 0 END ASC, task.due_date ASC",
      PRIORITY: "CASE task.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END ASC",
      STATUS: "CASE task.status WHEN 'TODO' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'DONE' THEN 3 ELSE 4 END ASC",
    };
    const orderBy = [groupSql[query.groupBy], sortSql[query.sortBy], "relation.task_id DESC"]
      .filter(Boolean)
      .join(", ");
    const searchPattern = query.search ? `%${query.search}%` : null;

    const bindFilters = (request: sql.Request) =>
      request
        .input("actorUserId", sql.Int, actorUserId)
        .input("today", sql.Date, getCurrentDateInAppTimeZone())
        .input("search", sql.NVarChar(102), searchPattern)
        .input("meetingId", sql.BigInt, query.meetingId ?? null)
        .input("status", sql.VarChar(20), query.status ?? null)
        .input("priority", sql.VarChar(10), query.priority ?? null)
        .input("due", sql.VarChar(20), query.due);

    const filteredWhere = `
      relation.assignee_user_id = @actorUserId
      AND task.deleted_at_utc IS NULL
      AND (@search IS NULL OR task.title LIKE @search OR task.description LIKE @search OR meeting.title LIKE @search)
      AND (@meetingId IS NULL OR relation.meeting_id = @meetingId)
      AND (@status IS NULL OR task.status = @status)
      AND (@priority IS NULL OR task.priority = @priority)
      AND (
        @due = 'ALL'
        OR (@due = 'OVERDUE' AND task.due_date < @today AND task.status NOT IN ('DONE', 'CANCELLED'))
        OR (@due = 'TODAY' AND task.due_date = @today)
        OR (@due = 'UPCOMING' AND task.due_date > @today)
        OR (@due = 'NO_DATE' AND task.due_date IS NULL)
      )`;

    const listRequest = bindFilters(pool.request())
      .input("offset", sql.Int, (query.page - 1) * query.pageSize)
      .input("pageSize", sql.Int, query.pageSize);
    const result = await listRequest.query<ListRecord>(`
      SELECT ${relationshipSelect}, ${taskColumns}
      FROM dbo.TM_meeting_action_items AS relation
      ${relationshipJoins}
      ${subtaskSummary}
      WHERE ${filteredWhere}
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `);

    const count = await bindFilters(pool.request()).query<{ total: number | string }>(`
      SELECT COUNT_BIG(*) AS total
      FROM dbo.TM_meeting_action_items AS relation
      INNER JOIN dbo.TM_tasks AS task ON task.id = relation.task_id
      INNER JOIN dbo.TM_meetings AS meeting ON meeting.id = relation.meeting_id
      WHERE ${filteredWhere};
    `);

    const summaryResult = await pool
      .request()
      .input("actorUserId", sql.Int, actorUserId)
      .input("today", sql.Date, getCurrentDateInAppTimeZone())
      .query<{
        total: number | string;
        todo: number | string;
        inProgress: number | string;
        done: number | string;
        cancelled: number | string;
        overdue: number | string;
        subtaskTotal: number | string;
        subtaskCompleted: number | string;
      }>(`
        SELECT
          COUNT_BIG(*) AS total,
          COALESCE(SUM(CASE WHEN task.status = 'TODO' THEN 1 ELSE 0 END), 0) AS todo,
          COALESCE(SUM(CASE WHEN task.status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) AS inProgress,
          COALESCE(SUM(CASE WHEN task.status = 'DONE' THEN 1 ELSE 0 END), 0) AS done,
          COALESCE(SUM(CASE WHEN task.status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled,
          COALESCE(SUM(CASE WHEN task.due_date < @today AND task.status NOT IN ('DONE', 'CANCELLED') THEN 1 ELSE 0 END), 0) AS overdue,
          COALESCE(SUM(ISNULL(subtasks.total, 0)), 0) AS subtaskTotal,
          COALESCE(SUM(ISNULL(subtasks.completed, 0)), 0) AS subtaskCompleted
        FROM dbo.TM_meeting_action_items AS relation
        INNER JOIN dbo.TM_tasks AS task ON task.id = relation.task_id
        OUTER APPLY (
          SELECT COUNT_BIG(*) AS total,
            COALESCE(SUM(CASE WHEN subtask.is_completed = 1 THEN 1 ELSE 0 END), 0) AS completed
          FROM dbo.TM_subtasks AS subtask
          WHERE subtask.task_id = task.id
            AND subtask.owner_user_id = task.owner_user_id
            AND subtask.deleted_at_utc IS NULL
        ) AS subtasks
        WHERE relation.assignee_user_id = @actorUserId
          AND task.deleted_at_utc IS NULL;
      `);
    const summaryRow = summaryResult.recordset[0];
    const summary: AssignedMeetingActionItemSummary = {
      total: Number(summaryRow?.total ?? 0),
      todo: Number(summaryRow?.todo ?? 0),
      inProgress: Number(summaryRow?.inProgress ?? 0),
      done: Number(summaryRow?.done ?? 0),
      cancelled: Number(summaryRow?.cancelled ?? 0),
      overdue: Number(summaryRow?.overdue ?? 0),
      subtaskTotal: Number(summaryRow?.subtaskTotal ?? 0),
      subtaskCompleted: Number(summaryRow?.subtaskCompleted ?? 0),
    };

    const meetingsResult = await pool
      .request()
      .input("actorUserId", sql.Int, actorUserId)
      .query<{ meetingId: number | string; meetingTitle: string }>(`
        SELECT DISTINCT relation.meeting_id AS meetingId, meeting.title AS meetingTitle
        FROM dbo.TM_meeting_action_items AS relation
        INNER JOIN dbo.TM_tasks AS task ON task.id = relation.task_id
        INNER JOIN dbo.TM_meetings AS meeting ON meeting.id = relation.meeting_id
        WHERE relation.assignee_user_id = @actorUserId
          AND task.deleted_at_utc IS NULL
        ORDER BY meetingTitle, meetingId;
      `);
    const meetings = meetingsResult.recordset.map((row) => ({
      meetingId: Number(row.meetingId),
      meetingTitle: row.meetingTitle,
    }));

    return {
      items: result.recordset.map(mapListItem),
      total: Number(count.recordset[0]?.total ?? 0),
      summary,
      meetings,
    };
  },
};

