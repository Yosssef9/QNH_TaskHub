import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { preferencesService } from "../../src/modules/preferences/preferences.service.js";

function createToken(): string {
  return jwt.sign({ userCode: "QNH0007" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

describe("PATCH /api/users/me/preferences", () => {
  beforeEach(() => {
    vi.spyOn(authService, "resolveCurrentUser").mockResolvedValue({
      user: { userId: 7, userCode: "QNH0007", userName: "User", email: null },
      access: { roleCode: "USER", contractsEnabled: false },
      preferences: {
        languageCode: "AR",
        theme: "SYSTEM",
        sidebarCollapsed: false,
        calendarShowAdjacentDates: false,
        meetingStartReminderEnabled: true,
        timeFormat: "12H",
        timezone: "Asia/Riyadh",
      },
    });
  });

  it("updates an authenticated user's own preferences", async () => {
    vi.spyOn(preferencesService, "update").mockResolvedValue({
      languageCode: "EN",
      theme: "DARK",
      sidebarCollapsed: true,
      calendarShowAdjacentDates: true,
      meetingStartReminderEnabled: true,
      timeFormat: "12H",
      timezone: "Asia/Riyadh",
    });

    const response = await request(app)
      .patch("/api/users/me/preferences")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({
        languageCode: "EN",
        theme: "DARK",
        sidebarCollapsed: true,
        calendarShowAdjacentDates: true,
        meetingStartReminderEnabled: true,
        timeFormat: "12H",
      });

    expect(response.status).toBe(200);
    expect(preferencesService.update).toHaveBeenCalledWith(7, {
      languageCode: "EN",
      theme: "DARK",
      sidebarCollapsed: true,
      calendarShowAdjacentDates: true,
      meetingStartReminderEnabled: true,
      timeFormat: "12H",
    });
  });

  it("rejects an empty preference update", async () => {
    const update = vi.spyOn(preferencesService, "update");

    const response = await request(app)
      .patch("/api/users/me/preferences")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({});

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});



