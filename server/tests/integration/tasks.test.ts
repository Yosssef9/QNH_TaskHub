import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { tasksService } from "../../src/modules/tasks/tasks.service.js";
import type { PersonalTask } from "../../src/modules/tasks/tasks.types.js";

const task: PersonalTask = {
  id: 12,
  listId: 3,
  kpiInstanceId: null,
  kpiId: null,
  cycleId: null,
  cycleTitle: null,
  kpiName: null,
  kpiIconKey: null,
  kpiColor: null,
  isReadOnly: false,
  title: "Prepare report",
  description: null,
  status: "TODO",
  priority: "HIGH",
  startDate: null,
  dueDate: "2026-08-30",
  referenceDate: null,
  displayOrder: 1,
  createdAtUtc: "2026-08-25T08:00:00.000Z",
  updatedAtUtc: null,
  completedAtUtc: null,
  cancelledAtUtc: null,
  cancellationReason: null,
  isOverdue: false,
  subtaskTotal: 0,
  subtaskCompleted: 0,
};

function token(): string {
  return jwt.sign({ userCode: "USER0007" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

describe("personal task endpoints", () => {
  beforeEach(() => {
    vi.spyOn(authService, "resolveCurrentUser").mockResolvedValue({
      user: { userId: 7, userCode: "USER0007", userName: "User", email: null },
      access: { roleCode: "USER" },
      preferences: {
        languageCode: "AR",
        theme: "SYSTEM",
        sidebarCollapsed: false,
        calendarShowAdjacentDates: false,
        timezone: "Asia/Riyadh",
      },
    });
  });

  it("derives task ownership from the authenticated Portal identity", async () => {
    const create = vi.spyOn(tasksService, "create").mockResolvedValue(task);
    const response = await request(app)
      .post("/api/lists/3/tasks")
      .set("Authorization", `Bearer ${token()}`)
      .send({ title: "Prepare report", priority: "HIGH", dueDate: "2026-08-30", ownerUserId: 999 });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(7, 3, {
      title: "Prepare report",
      priority: "HIGH",
      dueDate: "2026-08-30",
    });
  });

  it("passes validated server pagination and filters to the service", async () => {
    const list = vi
      .spyOn(tasksService, "list")
      .mockResolvedValue({ items: [], page: 2, pageSize: 10, total: 0 });
    const response = await request(app)
      .get("/api/lists/3/tasks?status=TODO&page=2&pageSize=10")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(
      7,
      3,
      expect.objectContaining({ status: "TODO", page: 2, pageSize: 10 }),
    );
  });

  it("requires a reason when cancelling a task", async () => {
    const changeStatus = vi.spyOn(tasksService, "changeStatus");
    const response = await request(app)
      .patch("/api/tasks/12/status")
      .set("Authorization", `Bearer ${token()}`)
      .send({ status: "CANCELLED" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it("rejects impossible calendar dates", async () => {
    const create = vi.spyOn(tasksService, "create");
    const response = await request(app)
      .post("/api/lists/3/tasks")
      .set("Authorization", `Bearer ${token()}`)
      .send({ title: "Impossible", priority: "LOW", dueDate: "2026-02-30" });

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
