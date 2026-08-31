import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { calendarService } from "../../src/modules/calendar/calendar.service.js";

function token(): string {
  return jwt.sign({ userCode: "USER0007" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

describe("calendar endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authService, "resolveCurrentUser").mockResolvedValue({
      user: { userId: 7, userCode: "USER0007", userName: "User", email: null },
      access: { roleCode: "USER", contractsEnabled: false },
      preferences: {
        languageCode: "AR",
        theme: "SYSTEM",
        sidebarCollapsed: false,
        calendarShowAdjacentDates: false,
        timezone: "Asia/Riyadh",
      },
    });
  });

  it("derives calendar ownership from the authenticated Portal identity", async () => {
    const listTasks = vi.spyOn(calendarService, "listTasks").mockResolvedValue({ items: [] });

    const response = await request(app)
      .get(
        "/api/calendar/tasks?start=2026-08-01&end=2026-09-01&scope=PERSONAL&priority=HIGH&listId=3&ownerUserId=999",
      )
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(listTasks).toHaveBeenCalledWith(7, {
      start: "2026-08-01",
      end: "2026-09-01",
      scope: "PERSONAL",
      priority: "HIGH",
      listId: 3,
    });
  });

  it("rejects KPI filters in the personal calendar", async () => {
    const listTasks = vi.spyOn(calendarService, "listTasks");

    const response = await request(app)
      .get("/api/calendar/tasks?start=2026-08-01&end=2026-09-01&scope=PERSONAL&cycleId=4")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("rejects list filters in the KPI calendar", async () => {
    const listTasks = vi.spyOn(calendarService, "listTasks");

    const response = await request(app)
      .get("/api/calendar/tasks?start=2026-08-01&end=2026-09-01&scope=KPI&listId=3")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("rejects calendar ranges longer than 62 days", async () => {
    const listTasks = vi.spyOn(calendarService, "listTasks");

    const response = await request(app)
      .get("/api/calendar/tasks?start=2026-08-01&end=2026-10-04&scope=PERSONAL")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("searches dated Calendar tasks across all months with authenticated ownership", async () => {
    const searchTasks = vi.spyOn(calendarService, "searchTasks").mockResolvedValue({
      items: [],
      total: 0,
    });

    const response = await request(app)
      .get(
        "/api/calendar/search?q=report&scope=PERSONAL&priority=HIGH&listId=3&ownerUserId=999",
      )
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(searchTasks).toHaveBeenCalledWith(7, {
      q: "report",
      scope: "PERSONAL",
      priority: "HIGH",
      listId: 3,
    });
  });

  it("requires at least two characters for Calendar-wide search", async () => {
    const searchTasks = vi.spyOn(calendarService, "searchTasks");

    const response = await request(app)
      .get("/api/calendar/search?q=r&scope=PERSONAL")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(searchTasks).not.toHaveBeenCalled();
  });

  it("rejects incompatible scope filters in Calendar-wide search", async () => {
    const searchTasks = vi.spyOn(calendarService, "searchTasks");

    const response = await request(app)
      .get("/api/calendar/search?q=report&scope=KPI&listId=3")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(searchTasks).not.toHaveBeenCalled();
  });

});

