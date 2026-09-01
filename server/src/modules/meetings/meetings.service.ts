import { AppError } from "../../shared/errors/app-error.js";
import { mapMeetingRoom } from "./meetings.mapper.js";
import { meetingsRepository } from "./meetings.repository.js";
import type {
  MeetingRoom,
  SaveMeetingRoomInput,
  UpdateMeetingRoomInput,
} from "./meetings.types.js";

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "number" in error &&
    [2601, 2627].includes(Number((error as { number: unknown }).number))
  );
}

async function translateRoomWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError({
        statusCode: 409,
        code: "MEETING_ROOM_CODE_EXISTS",
        message: "Another Meeting Room already uses this code.",
      });
    }

    throw error;
  }
}

export const meetingsService = {
  async listActiveRooms(): Promise<MeetingRoom[]> {
    const records = await meetingsRepository.listRooms(true);
    return records.map(mapMeetingRoom);
  },

  async listAdminRooms(): Promise<MeetingRoom[]> {
    const records = await meetingsRepository.listRooms(false);
    return records.map(mapMeetingRoom);
  },

  async createRoom(actorUserId: number, input: SaveMeetingRoomInput): Promise<MeetingRoom> {
    const record = await translateRoomWrite(() =>
      meetingsRepository.createRoom(actorUserId, input),
    );

    if (!record) {
      throw new AppError({
        statusCode: 500,
        code: "MEETING_ROOM_CREATE_FAILED",
        message: "Meeting Room could not be created.",
      });
    }

    return mapMeetingRoom(record);
  },

  async updateRoom(
    actorUserId: number,
    roomId: number,
    input: UpdateMeetingRoomInput,
  ): Promise<MeetingRoom> {
    const record = await translateRoomWrite(() =>
      meetingsRepository.updateRoom(actorUserId, roomId, input),
    );

    if (record) return mapMeetingRoom(record);

    const current = await meetingsRepository.findRoomById(roomId);
    if (!current) {
      throw new AppError({
        statusCode: 404,
        code: "MEETING_ROOM_NOT_FOUND",
        message: "Meeting Room was not found.",
      });
    }

    throw new AppError({
      statusCode: 409,
      code: "MEETING_ROOM_STALE",
      message: "Meeting Room changed after it was loaded. Reload and try again.",
    });
  },
};
