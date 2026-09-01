import { getDatabasePool, sql } from "../../database/sql.js";
import { rowVersionToBuffer } from "../../shared/utils/sql-row-version.js";
import type { MeetingRoomRecord } from "./meetings.mapper.js";
import type { SaveMeetingRoomInput, UpdateMeetingRoomInput } from "./meetings.types.js";

const roomFields = `
  id,
  code,
  name_ar AS nameAr,
  name_en AS nameEn,
  location_text AS locationText,
  capacity,
  equipment_notes AS equipmentNotes,
  CAST(is_active AS BIT) AS isActive,
  row_version AS rowVersion
`;

export const meetingsRepository = {
  async listRooms(activeOnly: boolean): Promise<MeetingRoomRecord[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("activeOnly", sql.Bit, activeOnly)
      .query<MeetingRoomRecord>(`
        SELECT ${roomFields}
        FROM dbo.TM_meeting_rooms
        WHERE @activeOnly = 0 OR is_active = 1
        ORDER BY is_active DESC, name_en, name_ar, id;
      `);

    return result.recordset;
  },

  async findRoomById(roomId: number): Promise<MeetingRoomRecord | null> {
    const pool = await getDatabasePool();
    const result = await pool.request().input("roomId", sql.BigInt, roomId).query<MeetingRoomRecord>(`
      SELECT TOP (1) ${roomFields}
      FROM dbo.TM_meeting_rooms
      WHERE id = @roomId;
    `);

    return result.recordset[0] ?? null;
  },

  async createRoom(actorUserId: number, input: SaveMeetingRoomInput): Promise<MeetingRoomRecord | null> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("code", sql.NVarChar(50), input.code ?? null)
      .input("nameAr", sql.NVarChar(150), input.nameAr)
      .input("nameEn", sql.NVarChar(150), input.nameEn)
      .input("locationText", sql.NVarChar(300), input.locationText ?? null)
      .input("capacity", sql.Int, input.capacity)
      .input("equipmentNotes", sql.NVarChar(1000), input.equipmentNotes ?? null)
      .input("isActive", sql.Bit, input.isActive)
      .input("actorUserId", sql.Int, actorUserId)
      .query<MeetingRoomRecord>(`
        INSERT INTO dbo.TM_meeting_rooms (
          code,
          name_ar,
          name_en,
          location_text,
          capacity,
          equipment_notes,
          is_active,
          created_by_user_id
        )
        OUTPUT
          inserted.id,
          inserted.code,
          inserted.name_ar AS nameAr,
          inserted.name_en AS nameEn,
          inserted.location_text AS locationText,
          inserted.capacity,
          inserted.equipment_notes AS equipmentNotes,
          inserted.is_active AS isActive,
          inserted.row_version AS rowVersion
        VALUES (
          @code,
          @nameAr,
          @nameEn,
          @locationText,
          @capacity,
          @equipmentNotes,
          @isActive,
          @actorUserId
        );
      `);

    return result.recordset[0] ?? null;
  },

  async updateRoom(
    actorUserId: number,
    roomId: number,
    input: UpdateMeetingRoomInput,
  ): Promise<MeetingRoomRecord | null> {
    const rowVersion = rowVersionToBuffer(input.rowVersion);
    if (!rowVersion) return null;

    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("roomId", sql.BigInt, roomId)
      .input("rowVersion", sql.VarBinary(8), rowVersion)
      .input("code", sql.NVarChar(50), input.code ?? null)
      .input("nameAr", sql.NVarChar(150), input.nameAr)
      .input("nameEn", sql.NVarChar(150), input.nameEn)
      .input("locationText", sql.NVarChar(300), input.locationText ?? null)
      .input("capacity", sql.Int, input.capacity)
      .input("equipmentNotes", sql.NVarChar(1000), input.equipmentNotes ?? null)
      .input("isActive", sql.Bit, input.isActive)
      .input("actorUserId", sql.Int, actorUserId)
      .query<MeetingRoomRecord>(`
        UPDATE dbo.TM_meeting_rooms
        SET
          code = @code,
          name_ar = @nameAr,
          name_en = @nameEn,
          location_text = @locationText,
          capacity = @capacity,
          equipment_notes = @equipmentNotes,
          is_active = @isActive,
          updated_by_user_id = @actorUserId,
          updated_at_utc = SYSUTCDATETIME()
        OUTPUT
          inserted.id,
          inserted.code,
          inserted.name_ar AS nameAr,
          inserted.name_en AS nameEn,
          inserted.location_text AS locationText,
          inserted.capacity,
          inserted.equipment_notes AS equipmentNotes,
          inserted.is_active AS isActive,
          inserted.row_version AS rowVersion
        WHERE id = @roomId
          AND row_version = @rowVersion;
      `);

    return result.recordset[0] ?? null;
  },
};
