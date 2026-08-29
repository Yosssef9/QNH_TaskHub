import { AppError } from "../errors/app-error.js";

export function parsePositiveIntegerId(value: string | number, fieldName = "id"): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_ID",
      message: `${fieldName} must be a positive integer.`,
    });
  }

  return parsed;
}
