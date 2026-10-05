
import { randomUUID } from "node:crypto";

import { AppError } from "../../shared/errors/app-error.js";
import type { MicrosoftGraphTokenProvider } from "./microsoft-graph.auth.js";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0/";

type FetchLike = typeof fetch;

export type MicrosoftGraphHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface MicrosoftGraphRequest {
  method: MicrosoftGraphHttpMethod;
  path: string;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
}

export interface MicrosoftGraphClient {
  request<T>(request: MicrosoftGraphRequest): Promise<T>;
}

export interface MicrosoftGraphClientOptions {
  tokenProvider: MicrosoftGraphTokenProvider;
  requestTimeoutMs: number;
  fetchImpl?: FetchLike;
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

function safeGraphPath(path: string): URL {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("\r") ||
    path.includes("\n") ||
    path.includes("://")
  ) {
    throw new AppError({
      statusCode: 500,
      code: "MS_GRAPH_PATH_INVALID",
      message: "Microsoft Graph request path must be a safe relative API path.",
    });
  }

  return new URL(path.slice(1), GRAPH_BASE_URL);
}

function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function graphFailure(response: Response): Promise<AppError> {
  const payload: unknown = await response.json().catch(() => null);
  const payloadRecord = asRecord(payload);
  const errorRecord = asRecord(payloadRecord?.error);
  const graphCode = stringField(errorRecord, "code");
  const requestId =
    response.headers.get("request-id") ??
    response.headers.get("client-request-id");

  if (response.status === 429) {
    return new AppError({
      statusCode: 503,
      code: "MS_GRAPH_THROTTLED",
      message: "Microsoft Graph temporarily throttled the TaskHub request.",
      details: {
        graphCode,
        requestId,
        retryAfterSeconds: retryAfterSeconds(response),
      },
    });
  }

  if (response.status === 401 || response.status === 403) {
    return new AppError({
      statusCode: 503,
      code: "MS_GRAPH_AUTHORIZATION_FAILED",
      message: "TaskHub is not authorized to perform this Microsoft Graph operation.",
      details: {
        httpStatus: response.status,
        graphCode,
        requestId,
      },
    });
  }

  if (response.status === 404) {
    return new AppError({
      statusCode: 404,
      code: "MS_GRAPH_RESOURCE_NOT_FOUND",
      message: "The requested Microsoft Graph resource was not found.",
      details: {
        graphCode,
        requestId,
      },
    });
  }

  return new AppError({
    statusCode: 503,
    code: "MS_GRAPH_REQUEST_FAILED",
    message: "Microsoft Graph could not complete the TaskHub request.",
    details: {
      httpStatus: response.status,
      graphCode,
      requestId,
    },
  });
}

export function createMicrosoftGraphClient(
  options: MicrosoftGraphClientOptions,
): MicrosoftGraphClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  const send = async <T>(
    request: MicrosoftGraphRequest,
    retryAuthentication: boolean,
  ): Promise<T> => {
    const url = safeGraphPath(request.path);
    const accessToken = await options.tokenProvider.getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs);

    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Accept", "application/json");
    headers.set("client-request-id", randomUUID());
    headers.set("return-client-request-id", "true");
    headers.set("Prefer", 'IdType="ImmutableId"');

    let body: string | undefined;
    if (request.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(request.body);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: request.method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AppError({
          statusCode: 503,
          code: "MS_GRAPH_REQUEST_TIMEOUT",
          message: "Microsoft Graph request timed out.",
        });
      }

      throw new AppError({
        statusCode: 503,
        code: "MS_GRAPH_UNAVAILABLE",
        message: "Microsoft Graph is temporarily unavailable.",
        details: {
          cause: error instanceof Error ? error.name : "UNKNOWN",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401 && retryAuthentication) {
      options.tokenProvider.invalidate();
      return send<T>(request, false);
    }

    if (!response.ok) {
      throw await graphFailure(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };

  return {
    request<T>(request: MicrosoftGraphRequest): Promise<T> {
      return send<T>(request, true);
    },
  };
}
