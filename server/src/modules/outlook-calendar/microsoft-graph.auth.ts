
import { AppError } from "../../shared/errors/app-error.js";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const TOKEN_REFRESH_SKEW_MS = 60_000;

type FetchLike = typeof fetch;

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

export interface MicrosoftGraphTokenProvider {
  getAccessToken(): Promise<string>;
  invalidate(): void;
}

export interface ClientSecretTokenProviderOptions {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  requestTimeoutMs: number;
  fetchImpl?: FetchLike;
  now?: () => number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function tokenEndpoint(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

export function createClientSecretGraphTokenProvider(
  options: ClientSecretTokenProviderOptions,
): MicrosoftGraphTokenProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cached: CachedToken | null = null;
  let inFlight: Promise<string> | null = null;

  const acquire = async (): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs);

    try {
      const body = new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        scope: GRAPH_SCOPE,
        grant_type: "client_credentials",
      });

      let response: Response;
      try {
        response = await fetchImpl(tokenEndpoint(options.tenantId), {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new AppError({
            statusCode: 503,
            code: "MS_GRAPH_AUTH_TIMEOUT",
            message: "Microsoft Graph authentication timed out.",
          });
        }

        throw new AppError({
          statusCode: 503,
          code: "MS_GRAPH_AUTH_UNAVAILABLE",
          message: "Microsoft Graph authentication is temporarily unavailable.",
          details: {
            cause: error instanceof Error ? error.name : "UNKNOWN",
          },
        });
      }

      const payload: unknown = await response.json().catch(() => null);
      const record = asRecord(payload);

      if (!response.ok) {
        const errorRecord = asRecord(record?.error);
        throw new AppError({
          statusCode: 503,
          code: "MS_GRAPH_AUTH_FAILED",
          message: "Microsoft Graph rejected the TaskHub application credentials.",
          details: {
            httpStatus: response.status,
            authorityCode:
              stringField(errorRecord, "code") ??
              stringField(record, "error") ??
              "UNKNOWN",
          },
        });
      }

      const accessToken = stringField(record, "access_token");
      const expiresInSeconds = numberField(record, "expires_in");

      if (!accessToken || !expiresInSeconds || expiresInSeconds <= 0) {
        throw new AppError({
          statusCode: 503,
          code: "MS_GRAPH_AUTH_INVALID_RESPONSE",
          message: "Microsoft Graph authentication returned an invalid token response.",
        });
      }

      cached = {
        accessToken,
        expiresAtMs: now() + expiresInSeconds * 1000,
      };

      return accessToken;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async getAccessToken(): Promise<string> {
      if (cached && now() + TOKEN_REFRESH_SKEW_MS < cached.expiresAtMs) {
        return cached.accessToken;
      }

      if (!inFlight) {
        inFlight = acquire().finally(() => {
          inFlight = null;
        });
      }

      return inFlight;
    },

    invalidate(): void {
      cached = null;
    },
  };
}
