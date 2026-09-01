import { AppError } from "../../shared/errors/app-error.js";
import { normalizeSqlRowVersion } from "../../shared/utils/sql-row-version.js";
import type { MeetingRoom } from "./meetings.types.js";

export interface MeetingRoomRecord {
  id: number | string;
  code: string | null;
  nameAr: string;
  nameEn: string;
  locationText: string | null;
  capacity: number;
  equipmentNotes: string | null;
  isActive: boolean;
  rowVersion: unknown;
}

export function mapMeetingRoom(record: MeetingRoomRecord): MeetingRoom {
  const rowVersion = normalizeSqlRowVersion(record.rowVersion);

  if (!rowVersion) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_MEETING_ROOM_ROW_VERSION",
      message: "Meeting Room concurrency data is invalid.",
    });
  }

  return {
    id: Number(record.id),
    code: record.code,
    nameAr: record.nameAr,
    nameEn: record.nameEn,
    locationText: record.locationText,
    capacity: Number(record.capacity),
    equipmentNotes: record.equipmentNotes,
    isActive: Boolean(record.isActive),
    rowVersion,
  };
}
