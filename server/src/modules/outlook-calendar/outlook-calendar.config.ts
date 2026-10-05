
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { createClientSecretGraphTokenProvider } from "./microsoft-graph.auth.js";
import { createMicrosoftGraphClient, type MicrosoftGraphClient } from "./microsoft-graph.client.js";
import type { OutlookCalendarRuntimeState } from "./outlook-calendar.types.js";

export function getOutlookCalendarRuntimeState(): OutlookCalendarRuntimeState {
  return {
    enabled: env.OUTLOOK_CALENDAR_SYNC_ENABLED,
    authMode: env.OUTLOOK_CALENDAR_SYNC_ENABLED ? "CLIENT_SECRET" : "DISABLED",
    workerIntervalMs: env.OUTLOOK_SYNC_WORKER_INTERVAL_MS,
    pollIntervalMinutes: env.OUTLOOK_SYNC_POLL_INTERVAL_MINUTES,
    graphRequestTimeoutMs: env.OUTLOOK_GRAPH_REQUEST_TIMEOUT_MS,
    maxAttempts: env.OUTLOOK_SYNC_MAX_ATTEMPTS,
    processingTimeoutMinutes: env.OUTLOOK_SYNC_PROCESSING_TIMEOUT_MINUTES,
  };
}

export function createConfiguredMicrosoftGraphClient(): MicrosoftGraphClient {
  if (!env.OUTLOOK_CALENDAR_SYNC_ENABLED) {
    throw new AppError({
      statusCode: 503,
      code: "OUTLOOK_CALENDAR_SYNC_DISABLED",
      message: "Outlook Calendar synchronization is disabled.",
    });
  }

  const tenantId = env.MS_GRAPH_TENANT_ID;
  const clientId = env.MS_GRAPH_CLIENT_ID;
  const clientSecret = env.MS_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new AppError({
      statusCode: 503,
      code: "OUTLOOK_CALENDAR_SYNC_NOT_CONFIGURED",
      message: "Outlook Calendar synchronization is missing Microsoft Graph credentials.",
    });
  }

  const tokenProvider = createClientSecretGraphTokenProvider({
    tenantId,
    clientId,
    clientSecret,
    requestTimeoutMs: env.OUTLOOK_GRAPH_REQUEST_TIMEOUT_MS,
  });

  return createMicrosoftGraphClient({
    tokenProvider,
    requestTimeoutMs: env.OUTLOOK_GRAPH_REQUEST_TIMEOUT_MS,
  });
}
