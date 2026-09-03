import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { notificationsService } from "../../src/modules/notifications/notifications.service.js";

function token(): string {
  return jwt.sign({ userCode: "USER0007" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

describe("notification endpoints", () => {
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
        meetingStartReminderEnabled: true,
        timeFormat: "12H",
        timezone: "Asia/Riyadh",
      },
    });
  });

  it("lists only notifications for the authenticated Portal owner", async () => {
    const list = vi.spyOn(notificationsService, "list").mockResolvedValue({
      unreadCount: 1,
      items: [
        {
          id: 41,
          type: "TASK_OVERDUE",
          subjectTitle: "Prepare report",
          contextTitle: "My Tasks",
          eventDate: "2026-08-27",
          actualValue: null,
          targetValue: null,
          measurementUnit: null,
          readAtUtc: null,
          createdAtUtc: "2026-08-28T06:00:00.000Z",
          href: "/lists/3?taskId=12",
        },
      ],
    });

    const response = await request(app)
      .get("/api/notifications?limit=10")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(7, 10);
    expect(response.body.data.unreadCount).toBe(1);
  });

  it("marks one notification read using the authenticated owner", async () => {
    const markRead = vi.spyOn(notificationsService, "markRead").mockResolvedValue(undefined);

    const response = await request(app)
      .patch("/api/notifications/41/read")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(markRead).toHaveBeenCalledWith(7, 41);
  });

  it("marks all notifications read for the authenticated owner", async () => {
    const markAll = vi.spyOn(notificationsService, "markAllRead").mockResolvedValue(3);

    const response = await request(app)
      .patch("/api/notifications/read-all")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(markAll).toHaveBeenCalledWith(7);
    expect(response.body.data.updated).toBe(3);
  });
});



