import { createHash } from "node:crypto";

import type { OutlookMeetingProjection } from "./outlook-calendar.types.js";

export interface OutlookEventBuildContext {
  meetingUrl: string;
  transactionId?: string;
}

export function outlookLocationName(projection: OutlookMeetingProjection): string {
  if (projection.meetingMode === "ZOOM") return "Zoom";
  const names = [projection.roomNameEn, projection.roomNameAr]
    .filter((value): value is string => Boolean(value?.trim()));
  const uniqueNames = [...new Set(names)];
  return [uniqueNames.join(" / "), projection.roomLocationText]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" — ");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildOutlookEventProjection(
  projection: OutlookMeetingProjection,
  meetingUrl: string,
) {
  const validAttendees = projection.attendees.filter((attendee) => attendee.email !== null);
  const missingCount = projection.attendees.length - validAttendees.length;
  const comparable = {
    subject: projection.title,
    startAtUtc: projection.startAtUtc,
    endAtUtc: projection.endAtUtc,
    meetingMode: projection.meetingMode,
    location: outlookLocationName(projection),
    onlineJoinUrl: projection.meetingMode === "ZOOM" ? projection.onlineJoinUrl : null,
    attendees: validAttendees
      .map((attendee) => ({ email: attendee.email!, name: attendee.userName }))
      .sort((left, right) => left.email.localeCompare(right.email)),
    taskHubUrl: meetingUrl,
    missingEmailParticipantCount: missingCount,
  };
  const json = JSON.stringify(comparable);
  return {
    json,
    hash: createHash("sha256").update(json).digest("hex"),
    validAttendees,
    missingCount,
  };
}

export function buildOutlookEventPayload(
  projection: OutlookMeetingProjection,
  context: OutlookEventBuildContext,
) {
  const state = buildOutlookEventProjection(projection, context.meetingUrl);
  const bodyParts: string[] = [];
  if (projection.description?.trim()) {
    bodyParts.push(
      `<p>${escapeHtml(projection.description.trim()).replaceAll("\n", "<br>")}</p>`,
    );
  }
  if (projection.meetingMode === "ZOOM" && projection.onlineJoinUrl) {
    const zoomUrl = escapeHtml(projection.onlineJoinUrl);
    bodyParts.push(`<p><strong>Zoom:</strong> <a href="${zoomUrl}">${zoomUrl}</a></p>`);
  }
  bodyParts.push(
    `<hr><p><strong>QNH TaskHub</strong><br><a href="${escapeHtml(context.meetingUrl)}">Open Meeting in TaskHub</a></p>`,
  );
  if (state.missingCount > 0) {
    bodyParts.push(
      `<p>${state.missingCount} TaskHub participant(s) were not included in this Outlook invitation because no email address is available. Open TaskHub for the complete participant list.</p>`,
    );
  }

  return {
    payload: {
      subject: projection.title,
      body: { contentType: "HTML", content: bodyParts.join("") },
      start: { dateTime: projection.startAtUtc.replace(/Z$/, ""), timeZone: "UTC" },
      end: { dateTime: projection.endAtUtc.replace(/Z$/, ""), timeZone: "UTC" },
      location: { displayName: outlookLocationName(projection) },
      attendees: state.validAttendees.map((attendee) => ({
        emailAddress: { address: attendee.email!, name: attendee.userName },
        type: "required",
      })),
      ...(context.transactionId ? { transactionId: context.transactionId } : {}),
    },
    state,
  };
}
