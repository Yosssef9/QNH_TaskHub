import type { MeetingReportRequest } from "./meeting-report.types.js";
import { MEETING_REPORT_GRACE_MINUTES } from "./meeting-report-schedule.policy.js";

export interface MeetingReportEmailPayload {
  meetingId: number;
  recipientUserId: number;
  revisionId: number;
  scheduledEndAtUtc: string;
}

export interface ReportDeliveryContext {
  meetingId: number;
  status: string;
  revisionId: number | null;
  startAtUtc: string | null;
  endAtUtc: string | null;
  observedAtUtc: string;
  activatedAtUtc: string;
  isRecipient: boolean;
  portalActive: boolean;
  portalUserCode: string | null;
  ownerUserId: number | null;
}

export interface ReportEmailSettings {
  enabled: boolean;
  activatedAtUtc: string;
  lastScanAtUtc: string | null;
}

export type ReportEmailDisposition =
  | { kind: "READY" }
  | { kind: "SKIP"; reason: string }
  | { kind: "DEFER"; payload: MeetingReportEmailPayload; nextAttemptAtUtc: string; reason: string };

const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const utcTime = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));

/** Parse only identity/schedule, never trust caller/persisted HTML, addresses or attachment paths. */
export function parseMeetingReportEmailPayload(value: string): MeetingReportEmailPayload {
  const input: unknown = JSON.parse(value);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid report email payload.");
  const data = input as Record<string, unknown>;
  if (!positiveId(data.meetingId) || !positiveId(data.recipientUserId) || !positiveId(data.revisionId) || !utcTime(data.scheduledEndAtUtc)) {
    throw new Error("Invalid report email identity or schedule.");
  }
  return { meetingId: data.meetingId, recipientUserId: data.recipientUserId, revisionId: data.revisionId, scheduledEndAtUtc: data.scheduledEndAtUtc };
}

/** Shared UTC policy. An unsent intent follows a new approved schedule under the SAME dedupe key. */
export function reportEmailDisposition(payload: MeetingReportEmailPayload, current: ReportDeliveryContext | null): ReportEmailDisposition {
  if (!current || current.meetingId !== payload.meetingId) return { kind: "SKIP", reason: "MEETING_UNAVAILABLE" };
  if (current.status !== "SCHEDULED") return { kind: "SKIP", reason: "MEETING_NOT_SCHEDULED" };
  if (!current.isRecipient || !current.portalActive || current.ownerUserId === null) return { kind: "SKIP", reason: "RECIPIENT_UNAVAILABLE" };
  const start = Date.parse(current.startAtUtc ?? "");
  const end = Date.parse(current.endAtUtc ?? "");
  const now = Date.parse(current.observedAtUtc);
  const cutoff = Date.parse(current.activatedAtUtc);
  if (!positiveId(current.revisionId) || ![start, end, now, cutoff].every(Number.isFinite) || end <= start) {
    return { kind: "SKIP", reason: "INVALID_APPROVED_SCHEDULE" };
  }
  if (end < cutoff) return { kind: "SKIP", reason: "BEFORE_ACTIVATION" };
  const due = end + MEETING_REPORT_GRACE_MINUTES * 60_000;
  if (!Number.isFinite(new Date(due).getTime())) return { kind: "SKIP", reason: "INVALID_APPROVED_SCHEDULE" };
  if (current.revisionId !== payload.revisionId || Date.parse(payload.scheduledEndAtUtc) !== end || now < due) {
    return {
      kind: "DEFER", reason: "APPROVED_SCHEDULE_CHANGED",
      nextAttemptAtUtc: new Date(Math.max(due, now + 5_000)).toISOString(),
      payload: { ...payload, revisionId: current.revisionId, scheduledEndAtUtc: new Date(end).toISOString() },
    };
  }
  return { kind: "READY" };
}

/** Permissions/language changes during rendering require a fresh report, not a stale privileged PDF. */
export function reportRecipientFingerprint(request: MeetingReportRequest): string {
  return JSON.stringify({
    userId: request.actor.userId, role: request.access.roleCode,
    permissions: [...request.access.permissions].sort(),
    organize: Boolean(request.access.meetingOrganizeEnabled), coordinate: Boolean(request.access.meetingCoordinateEnabled),
    language: request.language, timeFormat: request.timeFormat, timeZone: request.timeZone,
  });
}
