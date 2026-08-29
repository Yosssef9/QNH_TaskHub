import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";

const root = path.resolve(env.ATTACHMENT_STORAGE_PATH);

export async function storeAttachment(buffer: Buffer, extension: string): Promise<string> {
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
      code: "ATTACHMENT_PATH_INVALID",
      message: "Invalid attachment path.",
    });
  }
  return resolved;
}

export async function readAttachment(key: string): Promise<Buffer> {
  try {
    return await readFile(resolveKey(key));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      statusCode: 404,
      code: "ATTACHMENT_FILE_NOT_FOUND",
      message: "Attachment file not found.",
    });
  }
}

export async function removeStoredAttachment(key: string): Promise<void> {
  try {
    await unlink(resolveKey(key));
  } catch {
    /* Metadata remains the source of truth. */
  }
}
