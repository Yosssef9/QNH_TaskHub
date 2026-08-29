import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { emailSettingsService } from "../../src/modules/email-settings/email-settings.service.js";
import type { EmailSettingsData } from "../../src/modules/email-settings/email-settings.types.js";

function token(): string {
  return jwt.sign({ userCode: "USER0007" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

const settings: EmailSettingsData = {
  systemEnabled: true,
  notificationsEnabled: true,
  portalEmail: "user@qnhospital.com",
  alternateEmail: null,
  alternateVerified: false,
  activeEmailSource: "PORTAL",
  activeEmail: "user@qnhospital.com",
  canEnableEmail: true,
  preferences: [
    { eventType: "TASK_OVERDUE", enabled: true },
    { eventType: "TASK_DUE_TODAY", enabled: false },
    { eventType: "HIGH_PRIORITY_TASK_DUE_TOMORROW", enabled: true },
    { eventType: "CURRENT_CYCLE_ENDING_SOON", enabled: true },
    { eventType: "CURRENT_CYCLE_PAST_END", enabled: true },
    { eventType: "KPI_BELOW_TARGET", enabled: true },
    { eventType: "KPI_MEASUREMENT_DUE", enabled: true },
  ],
  pendingVerification: null,
};

describe("email settings endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authService, "resolveCurrentUser").mockResolvedValue({
      user: {
        userId: 7,
        userCode: "USER0007",
        userName: "User",
        email: "user@qnhospital.com",
      },
      access: { roleCode: "USER" },
      preferences: {
        languageCode: "AR",
        theme: "SYSTEM",
        sidebarCollapsed: false,
        timezone: "Asia/Riyadh",
      },
    });
  });

  it("gets email settings for the authenticated Portal owner", async () => {
    const get = vi.spyOn(emailSettingsService, "get").mockResolvedValue(settings);

    const response = await request(app)
      .get("/api/email-settings")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledWith(7);
    expect(response.body.data.activeEmailSource).toBe("PORTAL");
  });

  it("updates one email event preference without accepting a client owner id", async () => {
    const update = vi.spyOn(emailSettingsService, "update").mockResolvedValue(settings);

    const response = await request(app)
      .patch("/api/email-settings")
      .set("Authorization", `Bearer ${token()}`)
      .send({ preferences: [{ eventType: "TASK_DUE_TODAY", enabled: true }] });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(7, {
      preferences: [{ eventType: "TASK_DUE_TODAY", enabled: true }],
    });
  });

  it("starts alternate-email verification for the authenticated owner", async () => {
    const requestVerification = vi
      .spyOn(emailSettingsService, "requestVerification")
      .mockResolvedValue({
        maskedEmail: "us***@example.com",
        expiresAtUtc: "2026-08-28T09:10:00.000Z",
        resendAvailableAtUtc: "2026-08-28T09:01:00.000Z",
        attemptsRemaining: 5,
      });

    const response = await request(app)
      .post("/api/email-settings/alternate/request-verification")
      .set("Authorization", `Bearer ${token()}`)
      .send({ email: "user@example.com" });

    expect(response.status).toBe(202);
    expect(requestVerification).toHaveBeenCalledWith(7, "user@example.com", "ar");
  });

  it("verifies a six-digit code for the authenticated owner", async () => {
    const verify = vi
      .spyOn(emailSettingsService, "verifyAlternate")
      .mockResolvedValue({
        ...settings,
        alternateEmail: "user@example.com",
        alternateVerified: true,
      });

    const response = await request(app)
      .post("/api/email-settings/alternate/verify")
      .set("Authorization", `Bearer ${token()}`)
      .send({ code: "483271" });

    expect(response.status).toBe(200);
    expect(verify).toHaveBeenCalledWith(7, "483271");
  });
});
