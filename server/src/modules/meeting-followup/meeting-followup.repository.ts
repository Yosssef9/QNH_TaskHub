import { getDatabasePool, sql } from "../../database/sql.js";
import type { DatabaseTransaction } from "../../database/types.js";
import {
  normalizeSqlRowVersion,
  rowVersionToBuffer,
} from "../../shared/utils/sql-row-version.js";
import type {
  CreateMeetingDecisionInput,
  MeetingDecision,
  MeetingFollowUpNotes,
} from "./meeting-followup.types.js";

interface DecisionRecord {
  id: number | string;
  meetingId: number | string;
  agendaItemId: number | string | null;
  agendaTitle: string | null;
  decisionText: string;
  createdByUserId: number | string;
  createdByUserCode: string;
  createdByUserName: string;
  createdAtUtc: Date;
  updatedAtUtc: Date | null;
  rowVersion: unknown;
}

interface NotesRecord {
  meetingId: number | string;
  notesText: string;
  updatedByUserId: number | string;
  updatedByUserCode: string;
  updatedByUserName: string;
  updatedAtUtc: Date;
  rowVersion: unknown;
}

export interface LockedDecisionRecord {
  id: number;
  rowVersion: string;
}

export interface LockedNotesRecord {
  meetingId: number;
  rowVersion: string;
}

function requiredRowVersion(value: unknown): string {
  const normalized = normalizeSqlRowVersion(value);
  if (!normalized) throw new Error("Invalid Meeting Follow-up row version.");
  return normalized;
}

function mapDecision(record: DecisionRecord): MeetingDecision {
  return {
    id: Number(record.id),
    meetingId: Number(record.meetingId),
    agendaItemId: record.agendaItemId === null ? null : Number(record.agendaItemId),
    agendaTitle: record.agendaTitle,
    decisionText: record.decisionText,
    createdBy: {
      userId: Number(record.createdByUserId),
      userCode: record.createdByUserCode,
      userName: record.createdByUserName,
    },
    createdAtUtc: record.createdAtUtc.toISOString(),
    updatedAtUtc: record.updatedAtUtc?.toISOString() ?? null,
    rowVersion: requiredRowVersion(record.rowVersion),
  };
}

function mapNotes(record: NotesRecord): MeetingFollowUpNotes {
  return {
    meetingId: Number(record.meetingId),
    notesText: record.notesText,
    updatedBy: {
      userId: Number(record.updatedByUserId),
      userCode: record.updatedByUserCode,
      userName: record.updatedByUserName,
    },
    updatedAtUtc: record.updatedAtUtc.toISOString(),
    rowVersion: requiredRowVersion(record.rowVersion),
  };
}

export const meetingFollowUpRepository = {
  async listDecisions(meetingId: number): Promise<MeetingDecision[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .query<DecisionRecord>(`
        SELECT
          decision.id,
          decision.meeting_id AS meetingId,
          decision.agenda_item_id AS agendaItemId,
          agenda.topic AS agendaTitle,
          decision.decision_text AS decisionText,
          decision.created_by_user_id AS createdByUserId,
          creator.USER_CODE AS createdByUserCode,
          creator.USER_NAME AS createdByUserName,
          decision.created_at_utc AS createdAtUtc,
          decision.updated_at_utc AS updatedAtUtc,
          decision.row_version AS rowVersion
        FROM dbo.TM_meeting_decisions AS decision
        INNER JOIN dbo.users AS creator
          ON creator.USER_ID = decision.created_by_user_id
        LEFT JOIN dbo.TM_meeting_agenda_items AS agenda
          ON agenda.id = decision.agenda_item_id
        WHERE decision.meeting_id = @meetingId
        ORDER BY decision.id DESC;
      `);
    return result.recordset.map(mapDecision);
  },

  async getNotes(meetingId: number): Promise<MeetingFollowUpNotes | null> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .query<NotesRecord>(`
        SELECT TOP (1)
          notes.meeting_id AS meetingId,
          notes.notes_text AS notesText,
          notes.updated_by_user_id AS updatedByUserId,
          editor.USER_CODE AS updatedByUserCode,
          editor.USER_NAME AS updatedByUserName,
          notes.updated_at_utc AS updatedAtUtc,
          notes.row_version AS rowVersion
        FROM dbo.TM_meeting_followup_notes AS notes
        INNER JOIN dbo.users AS editor
          ON editor.USER_ID = notes.updated_by_user_id
        WHERE notes.meeting_id = @meetingId;
      `);
    const record = result.recordset[0];
    return record ? mapNotes(record) : null;
  },

  async createDecision(
    transaction: DatabaseTransaction,
    meetingId: number,
    actorUserId: number,
    input: CreateMeetingDecisionInput,
  ): Promise<number> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("agendaItemId", sql.BigInt, input.agendaItemId ?? null)
      .input("decisionText", sql.NVarChar(sql.MAX), input.decisionText)
      .input("actorUserId", sql.Int, actorUserId)
      .query<{ id: number | string }>(`
        INSERT INTO dbo.TM_meeting_decisions (
          meeting_id,
          agenda_item_id,
          decision_text,
          created_by_user_id
        )
        OUTPUT inserted.id
        VALUES (
          @meetingId,
          @agendaItemId,
          @decisionText,
          @actorUserId
        );
      `);
    return Number(result.recordset[0]?.id);
  },

  async findDecisionForUpdate(
    transaction: DatabaseTransaction,
    meetingId: number,
    decisionId: number,
  ): Promise<LockedDecisionRecord | null> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("decisionId", sql.BigInt, decisionId)
      .query<{ id: number | string; rowVersion: unknown }>(`
        SELECT TOP (1) id, row_version AS rowVersion
        FROM dbo.TM_meeting_decisions WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @decisionId
          AND meeting_id = @meetingId;
      `);
    const record = result.recordset[0];
    return record
      ? { id: Number(record.id), rowVersion: requiredRowVersion(record.rowVersion) }
      : null;
  },

  async updateDecision(
    transaction: DatabaseTransaction,
    meetingId: number,
    decisionId: number,
    actorUserId: number,
    input: { decisionText: string; agendaItemId: number | null; rowVersion: string },
  ): Promise<boolean> {
    const expected = rowVersionToBuffer(input.rowVersion);
    if (!expected) return false;
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("decisionId", sql.BigInt, decisionId)
      .input("agendaItemId", sql.BigInt, input.agendaItemId)
      .input("decisionText", sql.NVarChar(sql.MAX), input.decisionText)
      .input("actorUserId", sql.Int, actorUserId)
      .input("rowVersion", sql.VarBinary(8), expected)
      .query<{ affected: number }>(`
        UPDATE dbo.TM_meeting_decisions
        SET agenda_item_id = @agendaItemId,
            decision_text = @decisionText,
            updated_at_utc = SYSUTCDATETIME()
        WHERE id = @decisionId
          AND meeting_id = @meetingId
          AND row_version = @rowVersion;

        SELECT @@ROWCOUNT AS affected;
      `);
    return Number(result.recordset[0]?.affected ?? 0) === 1;
  },

  async findNotesForUpdate(
    transaction: DatabaseTransaction,
    meetingId: number,
  ): Promise<LockedNotesRecord | null> {
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .query<{ meetingId: number | string; rowVersion: unknown }>(`
        SELECT TOP (1)
          meeting_id AS meetingId,
          row_version AS rowVersion
        FROM dbo.TM_meeting_followup_notes WITH (UPDLOCK, HOLDLOCK)
        WHERE meeting_id = @meetingId;
      `);
    const record = result.recordset[0];
    return record
      ? { meetingId: Number(record.meetingId), rowVersion: requiredRowVersion(record.rowVersion) }
      : null;
  },

  async createNotes(
    transaction: DatabaseTransaction,
    meetingId: number,
    actorUserId: number,
    notesText: string,
  ): Promise<void> {
    await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("notesText", sql.NVarChar(sql.MAX), notesText)
      .input("actorUserId", sql.Int, actorUserId)
      .query(`
        INSERT INTO dbo.TM_meeting_followup_notes (
          meeting_id,
          notes_text,
          updated_by_user_id
        ) VALUES (
          @meetingId,
          @notesText,
          @actorUserId
        );
      `);
  },

  async updateNotes(
    transaction: DatabaseTransaction,
    meetingId: number,
    actorUserId: number,
    notesText: string,
    expectedRowVersion: string,
  ): Promise<boolean> {
    const expected = rowVersionToBuffer(expectedRowVersion);
    if (!expected) return false;
    const result = await transaction
      .request()
      .input("meetingId", sql.BigInt, meetingId)
      .input("notesText", sql.NVarChar(sql.MAX), notesText)
      .input("actorUserId", sql.Int, actorUserId)
      .input("rowVersion", sql.VarBinary(8), expected)
      .query<{ affected: number }>(`
        UPDATE dbo.TM_meeting_followup_notes
        SET notes_text = @notesText,
            updated_by_user_id = @actorUserId,
            updated_at_utc = SYSUTCDATETIME()
        WHERE meeting_id = @meetingId
          AND row_version = @rowVersion;

        SELECT @@ROWCOUNT AS affected;
      `);
    return Number(result.recordset[0]?.affected ?? 0) === 1;
  },
};
