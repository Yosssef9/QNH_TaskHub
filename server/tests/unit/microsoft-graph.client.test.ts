
import { describe, expect, it, vi } from "vitest";

import type { MicrosoftGraphTokenProvider } from "../../src/modules/outlook-calendar/microsoft-graph.auth.js";
import { createMicrosoftGraphClient } from "../../src/modules/outlook-calendar/microsoft-graph.client.js";
import { AppError } from "../../src/shared/errors/app-error.js";

function tokenProvider(): MicrosoftGraphTokenProvider & { invalidations: number } {
  return {
    invalidations: 0,
    async getAccessToken() {
      return "test-token";
    },
    invalidate() {
      this.invalidations += 1;
    },
  };
}

describe("Microsoft Graph HTTP client", () => {
  it("keeps requests on graph.microsoft.com and sends the bearer token with immutable IDs", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: "AAMk-test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = createMicrosoftGraphClient({
      tokenProvider: tokenProvider(),
      requestTimeoutMs: 5000,
      fetchImpl,
    });

    const result = await client.request<{ id: string }>({
      method: "GET",
      path: "/users/test%40qnhospital.com.sa/calendar/events/AAMk-test",
    });

    expect(result.id).toBe("AAMk-test");
    expect(requests[0]!.url).toBe(
      "https://graph.microsoft.com/v1.0/users/test%40qnhospital.com.sa/calendar/events/AAMk-test",
    );

    const headers = new Headers(requests[0]!.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("prefer")).toBe('IdType="ImmutableId"');
    expect(headers.get("client-request-id")).toBeTruthy();
  });

  it("rejects absolute or network-path URLs before any Graph call", async () => {
    const fetchImpl = vi.fn();
    const provider = tokenProvider();
    const client = createMicrosoftGraphClient({
      tokenProvider: provider,
      requestTimeoutMs: 5000,
      fetchImpl,
    });

    await expect(
      client.request({
        method: "GET",
        path: "https://evil.example/calendar",
      }),
    ).rejects.toMatchObject({ code: "MS_GRAPH_PATH_INVALID" });

    await expect(
      client.request({
        method: "GET",
        path: "//evil.example/calendar",
      }),
    ).rejects.toMatchObject({ code: "MS_GRAPH_PATH_INVALID" });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("invalidates one rejected token and retries authentication once", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ error: { code: "InvalidAuthenticationToken" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const provider = tokenProvider();
    const client = createMicrosoftGraphClient({
      tokenProvider: provider,
      requestTimeoutMs: 5000,
      fetchImpl,
    });

    await expect(
      client.request<{ value: unknown[] }>({
        method: "GET",
        path: "/users/test/calendar/events",
      }),
    ).resolves.toEqual({ value: [] });

    expect(provider.invalidations).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps Graph throttling to a retry-safe application error without returning raw content", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "TooManyRequests",
            message: "raw provider text should not be returned",
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "17",
            "request-id": "request-123",
          },
        },
      ),
    );

    const client = createMicrosoftGraphClient({
      tokenProvider: tokenProvider(),
      requestTimeoutMs: 5000,
      fetchImpl,
    });

    let thrown: unknown;
    try {
      await client.request({
        method: "GET",
        path: "/users/test/calendar/events",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({
      code: "MS_GRAPH_THROTTLED",
      details: {
        graphCode: "TooManyRequests",
        requestId: "request-123",
        retryAfterSeconds: 17,
      },
    });
    expect((thrown as Error).message).not.toContain("raw provider text");
  });
});
