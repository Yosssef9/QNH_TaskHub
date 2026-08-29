import { AppError } from "../../shared/errors/app-error.js";
import { holidaysRepository } from "./holidays.repository.js";
import type { SaveHolidayBody } from "./holidays.schemas.js";

function map(row: Awaited<ReturnType<typeof holidaysRepository.list>>[number]) {
  return { ...row, holidayDate: row.holidayDate.toISOString().slice(0, 10) };
}

function isDuplicateDate(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "number" in error &&
    [2601, 2627].includes(Number((error as { number: unknown }).number))
  );
}

async function translateDuplicate<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (isDuplicateDate(error))
      throw new AppError({
        statusCode: 409,
        code: "HOLIDAY_DATE_EXISTS",
        message: "A holiday already exists on this date.",
      });
    throw error;
  }
}

export const holidaysService = {
  async list() {
    return (await holidaysRepository.list()).map(map);
  },

  async create(actorUserId: number, input: SaveHolidayBody) {
    const row = await translateDuplicate(() => holidaysRepository.create(actorUserId, input));
    if (!row)
      throw new AppError({
        statusCode: 500,
        code: "HOLIDAY_CREATE_FAILED",
        message: "Holiday could not be created.",
      });
    return map(row);
  },

  async update(actorUserId: number, holidayId: number, input: SaveHolidayBody) {
    const row = await translateDuplicate(() =>
      holidaysRepository.update(actorUserId, holidayId, input),
    );
    if (!row)
      throw new AppError({
        statusCode: 404,
        code: "HOLIDAY_NOT_FOUND",
        message: "Holiday not found.",
      });
    return map(row);
  },
};
