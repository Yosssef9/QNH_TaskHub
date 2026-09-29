import { AppError } from "../../shared/errors/app-error.js";

const ZOOM_URL_MAX_LENGTH = 2048;

export function isValidZoomJoinUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ZOOM_URL_MAX_LENGTH) return false;

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (hostname === "zoom.us" || hostname.endsWith(".zoom.us")) &&
      url.pathname !== "/"
    );
  } catch {
    return false;
  }
}

export function normalizeZoomJoinUrl(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!isValidZoomJoinUrl(trimmed)) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_ZOOM_JOIN_URL",
      message: "Enter a valid HTTPS Zoom Meeting link.",
    });
  }
  return trimmed;
}
