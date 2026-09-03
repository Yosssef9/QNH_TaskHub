import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { holidaysService } from "../../src/modules/holidays/holidays.service.js";
import type { AuthMeData } from "../../src/modules/auth/auth.types.js";

function token() {
  return jwt.sign({ userCode: "ADMIN001" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

function profile(roleCode: "USER" | "ADMIN"): AuthMeData {
  return {
    user: { userId: 1, userCode: "ADMIN001", userName: "Admin", email: null },
    access: { roleCode, contractsEnabled: false },
    preferences: {
      languageCode: "AR",
      theme: "SYSTEM",
      sidebarCollapsed: false,
      calendarShowAdjacentDates: false,
      meetingStartReminderEnabled: true,
      timeFormat: "12H",
      timezone: "Asia/Riyadh",
    },
  };
}

describe("official holiday administration", () => {
  beforeEach(() => {
    vi.spyOn(authService, "resolveCurrentUser").mockResolvedValue(profile("ADMIN"));
  });

  it("allows an administrator to list holidays", async () => {
    const list = vi.spyOn(holidaysService, "list").mockResolvedValue([]);
    const response = await request(app)
      .get("/api/admin/holidays")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledOnce();
  });

  it("does not allow a normal user to manage holidays", async () => {
    vi.mocked(authService.resolveCurrentUser).mockResolvedValue(profile("USER"));
    const list = vi.spyOn(holidaysService, "list");
    const response = await request(app)
      .get("/api/admin/holidays")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });
});



