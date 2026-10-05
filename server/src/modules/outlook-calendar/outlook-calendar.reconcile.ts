import { createHash } from "node:crypto";

import type {
  OutlookMeetingProjection,
  OutlookObservedEventProjection,
  OutlookSyncDifference,
} from "./outlook-calendar.types.js";
import { outlookLocationName } from "./outlook-calendar.event.js";

export interface MicrosoftGraphObservedEvent {
  id: string;
  subject?: string | null;
  body?: { contentType?: string | null; content?: string | null } | null;
  start?: { dateTime?: string | null; timeZone?: string | null } | null;
  end?: { dateTime?: string | null; timeZone?: string | null } | null;
  location?: { displayName?: string | null } | null;
  attendees?: Array<{
    emailAddress?: { address?: string | null; name?: string | null } | null;
    status?: unknown;
    type?: string | null;
  }> | null;
  changeKey?: string;
  iCalUId?: string;
  webLink?: string;
  lastModifiedDateTime?: string;
}

function normalizeSpaces(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = normalizeSpaces(value).toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function htmlToText(value: string): string {
  return normalizeSpaces(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

function graphDateTimeToIso(value: { dateTime?: string | null; timeZone?: string | null } | null | undefined): string | null {
  const raw = value?.dateTime?.trim();
  if (!raw) return null;
  const zone = value?.timeZone?.trim().toUpperCase();
  const candidate = /(?:Z|[+-]\d\d:\d\d)$/i.test(raw)
    ? raw
    : zone === "UTC"
      ? `${raw}Z`
      : raw;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function hashJson(json: string): string {
  return createHash("sha256").update(json).digest("hex");
}

function desiredAttendeeEmails(projection: OutlookMeetingProjection): string[] {
  return projection.attendees
    .map((attendee) => normalizeEmail(attendee.email))
    .filter((email): email is string => email !== null)
    .sort((left, right) => left.localeCompare(right));
}

function observedAttendeeEmails(event: MicrosoftGraphObservedEvent): string[] {
  return [...new Set((event.attendees ?? [])
    .map((attendee) => normalizeEmail(attendee.emailAddress?.address))
    .filter((email): email is string => email !== null))]
    .sort((left, right) => left.localeCompare(right));
}

export function observeOutlookEvent(
  event: MicrosoftGraphObservedEvent,
  projection: OutlookMeetingProjection,
  meetingUrl: string,
): { projection: OutlookObservedEventProjection; json: string; hash: string } {
  const bodyHtml = event.body?.content ?? "";
  const bodyText = htmlToText(bodyHtml);
  const description = normalizeSpaces(projection.description);
  const zoomUrl = projection.meetingMode === "ZOOM" ? normalizeSpaces(projection.onlineJoinUrl) : "";
  const observed: OutlookObservedEventProjection = {
    subject: normalizeSpaces(event.subject),
    startAtUtc: graphDateTimeToIso(event.start),
    endAtUtc: graphDateTimeToIso(event.end),
    location: normalizeSpaces(event.location?.displayName),
    attendeeEmails: observedAttendeeEmails(event),
    taskHubLinkPresent: meetingUrl.length > 0 && (bodyHtml.includes(meetingUrl) || bodyText.includes(meetingUrl)),
    zoomLinkPresent: zoomUrl.length === 0 || bodyHtml.includes(zoomUrl) || bodyText.includes(zoomUrl),
    descriptionPresent: description.length === 0 || bodyText.includes(description),
  };
  const json = JSON.stringify(observed);
  return { projection: observed, json, hash: hashJson(json) };
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function compareOutlookEvent(
  projection: OutlookMeetingProjection,
  observed: OutlookObservedEventProjection,
  meetingUrl: string,
): OutlookSyncDifference[] {
  const differences: OutlookSyncDifference[] = [];
  const expectedSubject = normalizeSpaces(projection.title);
  const expectedLocation = normalizeSpaces(outlookLocationName(projection));
  const expectedAttendees = desiredAttendeeEmails(projection);

  if (observed.subject !== expectedSubject) {
    differences.push({ field: "SUBJECT", taskHubValue: expectedSubject, outlookValue: observed.subject || "—" });
  }
  if (observed.startAtUtc !== projection.startAtUtc) {
    differences.push({ field: "START", taskHubValue: projection.startAtUtc, outlookValue: observed.startAtUtc ?? "—" });
  }
  if (observed.endAtUtc !== projection.endAtUtc) {
    differences.push({ field: "END", taskHubValue: projection.endAtUtc, outlookValue: observed.endAtUtc ?? "—" });
  }
  if (observed.location !== expectedLocation) {
    differences.push({ field: "LOCATION", taskHubValue: expectedLocation || "—", outlookValue: observed.location || "—" });
  }
  if (!sameArray(expectedAttendees, observed.attendeeEmails)) {
    differences.push({
      field: "ATTENDEES",
      taskHubValue: String(expectedAttendees.length),
      outlookValue: String(observed.attendeeEmails.length),
    });
  }
  if (!observed.taskHubLinkPresent) {
    differences.push({ field: "TASKHUB_LINK", taskHubValue: meetingUrl, outlookValue: "Missing" });
  }
  if (projection.meetingMode === "ZOOM" && !observed.zoomLinkPresent) {
    differences.push({ field: "ZOOM_URL", taskHubValue: projection.onlineJoinUrl ?? "—", outlookValue: "Missing" });
  }
  if (!observed.descriptionPresent) {
    differences.push({ field: "DESCRIPTION", taskHubValue: "TaskHub description", outlookValue: "Changed or missing" });
  }

  return differences;
}

export function parseObservedProjection(value: string | null): OutlookObservedEventProjection | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const row = parsed as Partial<OutlookObservedEventProjection>;
    if (
      typeof row.subject !== "string" ||
      !Array.isArray(row.attendeeEmails) ||
      typeof row.taskHubLinkPresent !== "boolean" ||
      typeof row.zoomLinkPresent !== "boolean" ||
      typeof row.descriptionPresent !== "boolean"
    ) return null;
    return {
      subject: row.subject,
      startAtUtc: typeof row.startAtUtc === "string" ? row.startAtUtc : null,
      endAtUtc: typeof row.endAtUtc === "string" ? row.endAtUtc : null,
      location: typeof row.location === "string" ? row.location : "",
      attendeeEmails: row.attendeeEmails.filter((item): item is string => typeof item === "string"),
      taskHubLinkPresent: row.taskHubLinkPresent,
      zoomLinkPresent: row.zoomLinkPresent,
      descriptionPresent: row.descriptionPresent,
    };
  } catch {
    return null;
  }
}
