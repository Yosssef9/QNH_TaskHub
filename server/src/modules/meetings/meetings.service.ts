import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { meetingSchedulingRepository } from "./meeting-scheduling.repository.js";
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
      withTransaction(async (transaction) => {
        const colorKey = await meetingsRepository.resolveRoomColorKey(
          transaction,
          input.colorKey,
        );
        return meetingsRepository.createRoom(transaction, actorUserId, input, colorKey);
      }),
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
      withTransaction(async (transaction) => {
        const lockResult = await meetingSchedulingRepository.acquireRoomLock(transaction, roomId);
        if (lockResult < 0) {
          throw new AppError({
            statusCode: 409,
            code: "MEETING_ROOM_SCHEDULE_BUSY",
            message: "This Meeting Room is being scheduled by another operation. Try again.",
          });
        }

        const current = await meetingSchedulingRepository.findRoomForScheduling(
          transaction,
          roomId,
        );
        if (!current) {
          throw new AppError({
            statusCode: 404,
            code: "MEETING_ROOM_NOT_FOUND",
            message: "Meeting Room was not found.",
          });
        }

        const maximumParticipantCount =
          await meetingSchedulingRepository.maximumFutureScheduledParticipantCount(
            transaction,
            roomId,
          );
        if (input.capacity < maximumParticipantCount) {
          throw new AppError({
            statusCode: 409,
            code: "MEETING_ROOM_CAPACITY_IN_USE",
            message: "Room capacity cannot be reduced below an existing scheduled Meeting.",
            details: { maximumParticipantCount },
          });
        }

        const colorKey = await meetingsRepository.resolveRoomColorKey(
          transaction,
          input.colorKey,
          roomId,
        );

        const updated = await meetingsRepository.updateRoom(
          transaction,
          actorUserId,
          roomId,
          input,
          colorKey,
        );
        if (updated) return updated;

        throw new AppError({
          statusCode: 409,
          code: "MEETING_ROOM_STALE",
          message: "Meeting Room changed after it was loaded. Reload and try again.",
        });
      }),
    );

    return mapMeetingRoom(record);
  },
};

