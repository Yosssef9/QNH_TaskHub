import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import type { AuthMeData } from "../../src/modules/auth/auth.types.js";

const authProfile: AuthMeData = {
  user: {
    userId: 42,
    userCode: "QNH0042",
    userName: "TaskHub Test User",
    email: "test@qnhospital.com",
  },
  access: { roleCode: "USER" },
  preferences: {
    languageCode: "AR",
    theme: "SYSTEM",
    sidebarCollapsed: false,
    timezone: "Asia/Riyadh",
  },
};

function createPortalToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.spyOn(authService, "resolveCurrentUser").mockResolvedValue(authProfile);
  });

  it("rejects a request without a Portal token", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an invalid Portal token", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_PORTAL_TOKEN");
  });

  it("rejects a valid token without USER_CODE", async () => {
    const token = createPortalToken({ userId: 42, userName: "Untrusted Name" });
    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_PORTAL_TOKEN");
  });

  it("resolves authoritative TaskHub identity and access using USER_CODE", async () => {
    const token = createPortalToken({
      userId: 999999,
      userCode: "QNH0042",
      userName: "Forged Name",
      isAdmin: true,
    });

    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: authProfile });
    expect(authService.resolveCurrentUser).toHaveBeenCalledWith("QNH0042");
    expect(response.body.data.user.userId).toBe(42);
    expect(response.body.data.user.userName).toBe("TaskHub Test User");
    expect(response.body.data.access.roleCode).toBe("USER");
  });
});
