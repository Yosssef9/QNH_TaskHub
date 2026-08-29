import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { accessService } from "../../src/modules/access/access.service.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import type { AuthMeData } from "../../src/modules/auth/auth.types.js";

function createToken(): string {
  return jwt.sign({ userCode: "ADMIN001" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

function createProfile(roleCode: "USER" | "ADMIN"): AuthMeData {
  return {
    user: {
      userId: 1,
      userCode: "ADMIN001",
      userName: "Admin User",
      email: null,
    },
    access: { roleCode },
    preferences: {
      languageCode: "AR",
      theme: "SYSTEM",
      sidebarCollapsed: false,
      calendarShowAdjacentDates: false,
      timezone: "Asia/Riyadh",
    },
  };
}

describe("TaskHub access administration", () => {
  beforeEach(() => {
    vi.spyOn(authService, "resolveCurrentUser").mockResolvedValue(createProfile("ADMIN"));
  });

  it("allows an administrator to list Portal users and access state", async () => {
    vi.spyOn(accessService, "listUsers").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    const response = await request(app)
      .get("/api/admin/access/users")
      .set("Authorization", `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  it("rejects access administration by a normal user", async () => {
    vi.mocked(authService.resolveCurrentUser).mockResolvedValue(createProfile("USER"));
    const listUsers = vi.spyOn(accessService, "listUsers");

    const response = await request(app)
      .get("/api/admin/access/users")
      .set("Authorization", `Bearer ${createToken()}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("validates access updates before calling the service", async () => {
    const updateUserAccess = vi.spyOn(accessService, "updateUserAccess");

    const response = await request(app)
      .put("/api/admin/access/users/12")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({ roleCode: "SUPER_ADMIN", isActive: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(updateUserAccess).not.toHaveBeenCalled();
  });
});
