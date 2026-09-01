import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";

const root = path.resolve(env.ATTACHMENT_STORAGE_PATH, "meetings");

export async function storeMeetingAttachment(buffer: Buffer, extension: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const key = `${randomUUID()}${extension}`;
  await writeFile(path.join(root, key), buffer, { flag: "wx" });
  return key;
}

function resolveKey(key: string): string {
  const resolved = path.resolve(root, key);
  if (path.dirname(resolved) !== root) {
    throw new AppError({
      statusCode: 400,
      code: "MEETING_ATTACHMENT_PATH_INVALID",
      message: "Invalid Meeting attachment path.",
    });
  }
  return resolved;
}

export async function readMeetingAttachment(key: string): Promise<Buffer> {
  try {
    return await readFile(resolveKey(key));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      statusCode: 404,
      code: "MEETING_ATTACHMENT_FILE_NOT_FOUND",
      message: "Meeting attachment file not found.",
    });
  }
}

export async function removeStoredMeetingAttachment(key: string): Promise<void> {
  try {
    await unlink(resolveKey(key));
  } catch {
    /* Metadata and Meeting activity remain the audit source of truth. */
  }
}
