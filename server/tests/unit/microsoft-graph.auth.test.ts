
import { describe, expect, it, vi } from "vitest";

import { createClientSecretGraphTokenProvider } from "../../src/modules/outlook-calendar/microsoft-graph.auth.js";
import { AppError } from "../../src/shared/errors/app-error.js";

describe("Microsoft Graph client-secret token provider", () => {
  it("uses the client-credentials flow and reuses a fresh token", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          token_type: "Bearer",
          access_token: "graph-token",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    const provider = createClientSecretGraphTokenProvider({
      tenantId: "qnhospital.onmicrosoft.com",
      clientId: "client-id",
      clientSecret: "super-secret",
      requestTimeoutMs: 5000,
      fetchImpl,
      now: () => Date.parse("2026-10-04T07:00:00Z"),
    });

    await expect(provider.getAccessToken()).resolves.toBe("graph-token");
    await expect(provider.getAccessToken()).resolves.toBe("graph-token");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const request = requests[0]!;
    expect(request.url).toBe(
      "https://login.microsoftonline.com/qnhospital.onmicrosoft.com/oauth2/v2.0/token",
    );
    expect(request.init?.method).toBe("POST");

    const body = request.init?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    const params = body as URLSearchParams;
    expect(params.get("client_id")).toBe("client-id");
    expect(params.get("client_secret")).toBe("super-secret");
    expect(params.get("grant_type")).toBe("client_credentials");
    expect(params.get("scope")).toBe("https://graph.microsoft.com/.default");
  });

  it("does not expose the configured client secret when Entra rejects authentication", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: "invalid_client",
          error_description: "credential rejected",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const provider = createClientSecretGraphTokenProvider({
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "do-not-leak-this",
      requestTimeoutMs: 5000,
      fetchImpl,
    });

    let thrown: unknown;
    try {
      await provider.getAccessToken();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({ code: "MS_GRAPH_AUTH_FAILED" });
    expect(String((thrown as Error).message)).not.toContain("do-not-leak-this");
    expect(JSON.stringify((thrown as AppError).details)).not.toContain("do-not-leak-this");
  });

  it("allows an explicit invalidation to force a fresh token request", async () => {
    let count = 0;
    const fetchImpl = vi.fn(async () => {
      count += 1;
      return new Response(
        JSON.stringify({
          access_token: `token-${count}`,
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    const provider = createClientSecretGraphTokenProvider({
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "secret",
      requestTimeoutMs: 5000,
      fetchImpl,
      now: () => 1_000_000,
    });

    await expect(provider.getAccessToken()).resolves.toBe("token-1");
    provider.invalidate();
    await expect(provider.getAccessToken()).resolves.toBe("token-2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
