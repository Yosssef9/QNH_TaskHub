import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors/app-error.js";
import { createConfiguredMicrosoftGraphClient } from "./outlook-calendar.config.js";
import { buildOutlookEventPayload } from "./outlook-calendar.event.js";
import {
  compareOutlookEvent,
  observeOutlookEvent,
  parseObservedProjection,
  type MicrosoftGraphObservedEvent,
} from "./outlook-calendar.reconcile.js";
import { outlookCalendarRepository } from "./outlook-calendar.repository.js";
import type { OutlookSyncJobRecord, OutlookSyncStatusView } from "./outlook-calendar.types.js";

interface GraphEvent extends MicrosoftGraphObservedEvent {
  id: string;
}

function graphUser(value: string): string { return encodeURIComponent(value.trim()); }
function graphEvent(value: string): string { return encodeURIComponent(value); }
function taskHubMeetingUrl(meetingId: number): string {
  const base = env.TASKHUB_PUBLIC_URL.replace(/\/+$/, "");
  return `${base}/meetings/${meetingId}`;
}

function errorInfo(error: unknown): { code: string; message: string; retryAfterSeconds: number | null } {
  if (error instanceof AppError) {
    const details = typeof error.details === "object" && error.details !== null ? error.details as Record<string, unknown> : null;
    const retry = typeof details?.retryAfterSeconds === "number" ? details.retryAfterSeconds : null;
    return { code: error.code, message: error.message, retryAfterSeconds: retry };
  }
  return { code: "OUTLOOK_SYNC_UNKNOWN", message: error instanceof Error ? error.message : "Unknown Outlook synchronization error.", retryAfterSeconds: null };
}

async function processJob(job: OutlookSyncJobRecord): Promise<void> {
  const projection = await outlookCalendarRepository.projection(job.meetingId);
  const mapping = await outlookCalendarRepository.mappingForWorker(job.meetingId);
  if (!projection || !mapping) throw new AppError({ statusCode: 404, code: "OUTLOOK_SYNC_MEETING_NOT_FOUND", message: "Meeting synchronization state could not be resolved." });
  const currentOrganizerEmail = projection.organizerEmail?.trim() || null;
  const organizerEmail = mapping.graphEventId
    ? (mapping.organizerUserPrincipalName?.trim() || mapping.organizerEmailSnapshot?.trim() || currentOrganizerEmail)
    : currentOrganizerEmail;
  if (!organizerEmail) throw new AppError({ statusCode: 409, code: "OUTLOOK_ORGANIZER_EMAIL_MISSING", message: "The Meeting Organizer has no email address available for Outlook Calendar synchronization." });

  if (job.operation === "CANCEL") {
    if (!mapping.graphEventId) { await outlookCalendarRepository.markCancelled(job.meetingId); return; }
    const client = createConfiguredMicrosoftGraphClient();
    try {
      await client.request<void>({ method: "POST", path: `/users/${graphUser(organizerEmail)}/events/${graphEvent(mapping.graphEventId)}/cancel`, body: { comment: "This Meeting was cancelled in QNH TaskHub." } });
    } catch (error) {
      if (error instanceof AppError && error.code === "MS_GRAPH_RESOURCE_NOT_FOUND") {
        await outlookCalendarRepository.markCancelled(job.meetingId);
        return;
      }
      throw error;
    }
    await outlookCalendarRepository.markCancelled(job.meetingId);
    return;
  }

  if (projection.status !== "SCHEDULED") throw new AppError({ statusCode: 409, code: "OUTLOOK_MEETING_NOT_SCHEDULED", message: "Only scheduled TaskHub Meetings can be synchronized to Outlook." });
  const builtForState = buildOutlookEventPayload(projection, { meetingUrl: taskHubMeetingUrl(projection.meetingId) });
  const state = builtForState.state;
  await outlookCalendarRepository.markSyncing(job.meetingId, organizerEmail, projection.revisionId, state.missingCount);
  const client = createConfiguredMicrosoftGraphClient();

  let event: GraphEvent;
  if (!mapping.graphEventId) {
    const built = buildOutlookEventPayload(projection, { meetingUrl: taskHubMeetingUrl(projection.meetingId), transactionId: mapping.createTransactionId });
    try {
      event = await client.request<GraphEvent>({ method: "POST", path: `/users/${graphUser(organizerEmail)}/calendar/events`, body: built.payload });
    } catch (error) {
      if (error instanceof AppError && error.code === "MS_GRAPH_RESOURCE_NOT_FOUND") {
        throw new AppError({
          statusCode: 409,
          code: "OUTLOOK_ORGANIZER_MAILBOX_UNAVAILABLE",
          message: "No accessible Microsoft 365 mailbox was found for the Meeting Organizer.",
        });
      }
      throw error;
    }
  } else {
    const built = buildOutlookEventPayload(projection, { meetingUrl: taskHubMeetingUrl(projection.meetingId) });
    try {
      event = await client.request<GraphEvent>({ method: "PATCH", path: `/users/${graphUser(organizerEmail)}/events/${graphEvent(mapping.graphEventId)}`, body: built.payload });
    } catch (error) {
      if (error instanceof AppError && error.code === "MS_GRAPH_RESOURCE_NOT_FOUND") {
        await outlookCalendarRepository.markOutlookDeleted(job.meetingId);
        return;
      }
      throw error;
    }
    event.id ||= mapping.graphEventId;
  }
  if (!event.id) throw new AppError({ statusCode: 503, code: "OUTLOOK_EVENT_ID_MISSING", message: "Microsoft Graph did not return an Outlook event identifier." });
  const built = buildOutlookEventPayload(projection, { meetingUrl: taskHubMeetingUrl(projection.meetingId) });
  await outlookCalendarRepository.markSuccess({ meetingId: job.meetingId, revisionId: projection.revisionId, missingCount: built.state.missingCount,
    graphEventId: event.id, graphChangeKey: event.changeKey ?? null, graphIcalUid: event.iCalUId ?? null, graphWebLink: event.webLink ?? mapping.graphWebLink,
    projectionJson: built.state.json, projectionHash: built.state.hash });
}

async function reconcileMeeting(meetingId: number): Promise<void> {
  const projection = await outlookCalendarRepository.projection(meetingId);
  const mapping = await outlookCalendarRepository.mappingForWorker(meetingId);
  if (!projection || !mapping?.graphEventId || projection.status !== "SCHEDULED") return;

  const organizerEmail = mapping.organizerUserPrincipalName?.trim() || mapping.organizerEmailSnapshot?.trim() || projection.organizerEmail?.trim();
  if (!organizerEmail) return;

  const client = createConfiguredMicrosoftGraphClient();
  let event: GraphEvent;
  try {
    event = await client.request<GraphEvent>({
      method: "GET",
      path: `/users/${graphUser(organizerEmail)}/events/${graphEvent(mapping.graphEventId)}?$select=id,subject,body,start,end,location,attendees,changeKey,iCalUId,webLink,lastModifiedDateTime`,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "MS_GRAPH_RESOURCE_NOT_FOUND") {
      await outlookCalendarRepository.markOutlookDeleted(meetingId);
      return;
    }
    throw error;
  }

  const meetingUrl = taskHubMeetingUrl(meetingId);
  const observed = observeOutlookEvent(event, projection, meetingUrl);
  const differences = compareOutlookEvent(projection, observed.projection, meetingUrl);
  const built = buildOutlookEventPayload(projection, { meetingUrl });
  await outlookCalendarRepository.markObserved({
    meetingId,
    changed: differences.length > 0,
    graphChangeKey: event.changeKey ?? null,
    graphWebLink: event.webLink ?? mapping.graphWebLink,
    outlookLastModifiedAtUtc: event.lastModifiedDateTime ?? null,
    observedJson: observed.json,
    observedHash: observed.hash,
    missingCount: built.state.missingCount,
  });
}

export const outlookCalendarService = {
  async safeMeetingScheduled(meetingId: number): Promise<void> {
    if (!env.OUTLOOK_CALENDAR_SYNC_ENABLED) return;
    try { await outlookCalendarRepository.enqueueScheduled(meetingId); }
    catch (error) { logger.warn({ err: error, meetingId }, "Outlook lifecycle enqueue failed after successful Meeting operation"); }
  },
  async safeMeetingCancelled(meetingId: number): Promise<void> {
    if (!env.OUTLOOK_CALENDAR_SYNC_ENABLED) return;
    try { await outlookCalendarRepository.enqueueCancellation(meetingId); }
    catch (error) { logger.warn({ err: error, meetingId }, "Outlook cancellation enqueue failed after successful Meeting operation"); }
  },
  async getStatus(meetingId: number): Promise<OutlookSyncStatusView | null> {
    const foundation = await outlookCalendarRepository.foundationState();
    if (!foundation.installed) return null;
    const status = await outlookCalendarRepository.status(meetingId);
    if (!status || status.status !== "OUTLOOK_CHANGED") return status;

    const projection = await outlookCalendarRepository.projection(meetingId);
    const observedJson = await outlookCalendarRepository.observedProjectionJson(meetingId);
    const observed = parseObservedProjection(observedJson);
    if (!projection || !observed) return status;
    return {
      ...status,
      differences: compareOutlookEvent(projection, observed, taskHubMeetingUrl(meetingId)),
    };
  },
  async retry(meetingId: number, actorUserId: number): Promise<void> {
    if (!env.OUTLOOK_CALENDAR_SYNC_ENABLED) throw new AppError({ statusCode: 409, code: "OUTLOOK_CALENDAR_SYNC_DISABLED", message: "Outlook Calendar synchronization is disabled." });
    await outlookCalendarRepository.retry(meetingId, actorUserId);
  },
  async restore(meetingId: number, actorUserId: number): Promise<void> {
    if (!env.OUTLOOK_CALENDAR_SYNC_ENABLED) throw new AppError({ statusCode: 409, code: "OUTLOOK_CALENDAR_SYNC_DISABLED", message: "Outlook Calendar synchronization is disabled." });
    await outlookCalendarRepository.queueRestore(meetingId, actorUserId);
  },
  async recreate(meetingId: number, actorUserId: number): Promise<void> {
    if (!env.OUTLOOK_CALENDAR_SYNC_ENABLED) throw new AppError({ statusCode: 409, code: "OUTLOOK_CALENDAR_SYNC_DISABLED", message: "Outlook Calendar synchronization is disabled." });
    await outlookCalendarRepository.queueRecreate(meetingId, actorUserId);
  },
  async runWorkerOnce(): Promise<void> {
    if (!env.OUTLOOK_CALENDAR_SYNC_ENABLED) return;
    const state = await outlookCalendarRepository.foundationState();
    if (!state.installed) { logger.warn("Outlook worker skipped because migration 047 is not installed"); return; }
    if (!(await outlookCalendarRepository.activateAndTouchWorker())) return;
    await outlookCalendarRepository.recoverAbandoned(env.OUTLOOK_SYNC_PROCESSING_TIMEOUT_MINUTES);
    const workerId = outlookCalendarRepository.workerId();
    for (let i = 0; i < 5; i += 1) {
      const job = await outlookCalendarRepository.claimNext(workerId);
      if (!job) break;
      try { await processJob(job); await outlookCalendarRepository.completeJob(job.id); }
      catch (error) {
        const info = errorInfo(error);
        await outlookCalendarRepository.failJob(job, info.code, info.message, env.OUTLOOK_SYNC_MAX_ATTEMPTS, info.retryAfterSeconds);
        logger.warn({ err: error, meetingId: job.meetingId, jobId: job.id }, "Outlook Calendar sync job failed");
      }
    }

    if (await outlookCalendarRepository.beginPollRound(env.OUTLOOK_SYNC_POLL_INTERVAL_MINUTES)) {
      const meetingIds = await outlookCalendarRepository.pollCandidates();
      for (const meetingId of meetingIds) {
        try {
          await reconcileMeeting(meetingId);
        } catch (error) {
          logger.warn({ err: error, meetingId }, "Outlook Calendar reconciliation check failed");
        }
      }
    }
  },
};
