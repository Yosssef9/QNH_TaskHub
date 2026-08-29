import type { EmailLanguage } from "../email.types.js";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeAbsoluteUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Email links must use HTTP or HTTPS URLs.");
  }
  return url.toString();
}

export function joinAbsoluteUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return normalizeAbsoluteUrl(new URL(path.replace(/^\//, ""), normalizedBase).toString());
}

export function getDirection(language: EmailLanguage): "rtl" | "ltr" {
  return language === "ar" ? "rtl" : "ltr";
}
