import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { workCyclesService } from "../../src/modules/work-cycles/work-cycles.service.js";
import type { WorkCycle } from "../../src/modules/work-cycles/work-cycles.types.js";

function token(): string {
  return jwt.sign({ userCode: "USER0007" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

const cycle: WorkCycle = {
  id: 9,
  title: "Board cycle",
  description: null,
  iconKey: "briefcase",
  color: "#2563EB",
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  displayOrder: 1,
  closedAtUtc: null,
  archivedAtUtc: null,
  isCurrent: false,
  taskCount: 0,
  completedTaskCount: 0,
  overdueTaskCount: 0,
  instances: [],
};

const createInput = {
  title: "Board cycle",
  description: null,
  iconKey: "briefcase",
  color: "#2563EB",
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  kpiIds: [5],
} as const;

describe("Work Cycle endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authService, "resolveCurrentUser").mockResolvedValue({
      user: { userId: 7, userCode: "USER0007", userName: "User", email: null },
      access: { roleCode: "USER" },
      preferences: {
        languageCode: "AR",
        theme: "SYSTEM",
        sidebarCollapsed: false,
        timezone: "Asia/Riyadh",
      },
    });
  });

  it("creates a private Work Cycle using the authenticated Portal owner", async () => {
    const create = vi.spyOn(workCyclesService, "create").mockResolvedValue(cycle);

    const response = await request(app)
      .post("/api/work-cycles")
      .set("Authorization", `Bearer ${token()}`)
      .send({ ...createInput, ownerUserId: 999 });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(7, createInput);
    expect(response.body.data.cycle.id).toBe(9);
  });

  it("rejects duplicate KPI templates within one Cycle before calling the service", async () => {
    const create = vi.spyOn(workCyclesService, "create");

    const response = await request(app)
      .post("/api/work-cycles")
      .set("Authorization", `Bearer ${token()}`)
      .send({ ...createInput, kpiIds: [5, 5] });

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("closes only the authenticated owner's Cycle", async () => {
    const close = vi
      .spyOn(workCyclesService, "close")
      .mockResolvedValue({ ...cycle, closedAtUtc: "2026-08-27T10:00:00.000Z" });

    const response = await request(app)
      .post("/api/work-cycles/9/close")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(close).toHaveBeenCalledWith(7, 9);
  });

  it("removes an empty KPI instance through its parent Cycle", async () => {
    const remove = vi.spyOn(workCyclesService, "removeInstance").mockResolvedValue(undefined);

    const response = await request(app)
      .delete("/api/work-cycles/9/kpis/31")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(204);
    expect(remove).toHaveBeenCalledWith(7, 9, 31);
  });
});
