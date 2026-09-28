import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { authRepository } from "../auth/auth.repository.js";
import { mapAuthMeData } from "../auth/auth.mapper.js";
import { emailRepository } from "../email/email.repository.js";
import { getEmailTransport } from "../email/email-transport.factory.js";
import { renderEmailTemplate } from "../email/templates/email-template.registry.js";
import { emailSettingsService } from "../email-settings/email-settings.service.js";
import { requireMeetingContentAccess } from "../meetings/meeting-content-access.js";
import { meetingReportEmailRepository } from "./meeting-report-email.repository.js";
import { reportEmailDisposition } from "./meeting-report-email.policy.js";
import type { MeetingReportEmailPayload } from "./meeting-report-email.policy.js";
import { createReportEmailProcessor } from "./meeting-report-email.processor.js";
import type { ReportRecipientResolution } from "./meeting-report-email.processor.js";
import { meetingReportService } from "./meeting-report.service.js";
import type { ReportAutomationRuntime } from "./meeting-report-schedule.types.js";

export async function meetingReportAutomationRuntime(): Promise<ReportAutomationRuntime> {
  const settings = await meetingReportEmailRepository.settings();
  const reason = !settings ? "MIGRATION_REQUIRED" : !env.EMAIL_ENABLED ? "EMAIL_DISABLED"
    : !env.MEETING_REPORT_EMAIL_ENABLED || !settings.enabled ? "DISABLED" : "ENABLED";
  return {
    automaticDeliveryEnabled: reason === "ENABLED", automaticDeliveryReason: reason,
    activatedAtUtc: settings?.activatedAtUtc ?? null, lastAutomaticScanAtUtc: settings?.lastScanAtUtc ?? null,
  };
}

async function resolveRecipient(payload: MeetingReportEmailPayload, ownerUserId: number | null): Promise<ReportRecipientResolution> {
  const runtime = await meetingReportAutomationRuntime();
  if (!runtime.automaticDeliveryEnabled) {
    return { kind: "DEFER", payload, nextAttemptAtUtc: new Date(Date.now() + 60_000).toISOString(), reason: "AUTOMATIC_DELIVERY_PAUSED" };
  }
  if (ownerUserId !== null && ownerUserId !== payload.recipientUserId) return { kind: "SKIP", reason: "RECIPIENT_MISMATCH" };
  const context = await meetingReportEmailRepository.deliveryContext(payload.meetingId, payload.recipientUserId);
  const disposition = reportEmailDisposition(payload, context);
  if (disposition.kind !== "READY") return disposition;
  if (!context?.portalUserCode) return { kind: "SKIP", reason: "RECIPIENT_UNAVAILABLE" };

  // Resolve current Portal + TaskHub identity just like authenticated requests; never use an Organizer's PDF for somebody else.
  const [user, initialProfile, permissions] = await Promise.all([
    authRepository.findPortalUserByCode(context.portalUserCode),
    authRepository.findAccessProfile(payload.recipientUserId),
    authRepository.listAccessPermissions(payload.recipientUserId),
  ]);
  let profile = initialProfile;
  if (!user?.isActive || user.userId !== payload.recipientUserId || !profile?.isActive) return { kind: "SKIP", reason: "RECIPIENT_UNAVAILABLE" };
  // Some invited users have not logged into TaskHub yet. Only initialize settings after verifying active access.
  if (profile.languageCode === null) {
    await authRepository.ensureUserFoundation(payload.recipientUserId);
    profile = await authRepository.findAccessProfile(payload.recipientUserId);
    if (!profile?.isActive) return { kind: "SKIP", reason: "RECIPIENT_UNAVAILABLE" };
  }
  const auth = mapAuthMeData(user, profile, permissions);
  await requireMeetingContentAccess(payload.recipientUserId, auth.access, payload.meetingId);
  const delivery = await emailSettingsService.resolveOperationalDelivery(payload.recipientUserId, "MEETING_REPORT_AVAILABLE");
  if (!delivery) return { kind: "SKIP", reason: "RECIPIENT_EMAIL_NOT_ELIGIBLE" };
  return {
    kind: "READY", delivery, observedAtUtc: context.observedAtUtc,
    request: {
      meetingId: payload.meetingId,
      actor: { userId: user.userId, userCode: user.userCode, userName: user.userName },
      access: auth.access, language: delivery.language, timeFormat: auth.preferences.timeFormat,
      timeZone: env.APP_TIME_ZONE, generationMode: "AUTOMATIC",
    },
  };
}

const process = createReportEmailProcessor({
  resolve: resolveRecipient,
  render: (request, expected, signal) => meetingReportService.exportForEmail(request, expected, signal),
  authorizeRelated: async (data, request) => {
    const ids = new Set(data.relatedMeetings.map((meeting) => meeting.id));
    for (const event of data.detail.activity) {
      for (const key of ["sourceMeetingId", "followUpMeetingId"] as const) {
        const value = event.changes?.[key];
        if (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value !== request.meetingId) ids.add(value);
      }
    }
    for (const id of ids) {
      try { await requireMeetingContentAccess(request.actor.userId, request.access, id); }
      catch (error) {
        if (error instanceof AppError && error.code === "MEETING_NOT_FOUND") {
          throw new AppError({ statusCode: 409, code: "MEETING_REPORT_RELATED_ACCESS_CHANGED", message: "Related Meeting access changed while the report was being generated." });
        }
        throw error;
      }
    }
  },
  template: (payload, language) => renderEmailTemplate("MEETING_REPORT_AVAILABLE", payload, language),
  send: (message) => getEmailTransport().send(message),
  renew: (id, workerId) => emailRepository.renewProcessingLease(id, workerId),
  saveEnvelope: (id, workerId, input) => meetingReportEmailRepository.saveEnvelope(id, workerId, input),
  defer: (id, workerId, payload, next, reason) => meetingReportEmailRepository.defer(id, workerId, payload, next, reason),
  cancel: (id, workerId, reason) => emailRepository.markCanceled(id, workerId, reason),
  sent: (id, workerId, messageId) => emailRepository.markSent(id, workerId, messageId),
  failed: (id, workerId, attempt, max, delay, reason) => emailRepository.markAttemptFailed(id, workerId, attempt, max, delay, reason),
}, { maxAttempts: env.EMAIL_MAX_ATTEMPTS, maxPdfBytes: env.MEETING_REPORT_EMAIL_MAX_PDF_BYTES });

export const meetingReportEmailService = {
  runtime: meetingReportAutomationRuntime,
  async synchronize(): Promise<number> {
    const runtime = await meetingReportAutomationRuntime();
    if (!runtime.automaticDeliveryEnabled || env.NODE_ENV === "test") return 0;
    return meetingReportEmailRepository.enqueueDue(100);
  },
  process,
};
