import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { listsService } from "../../src/modules/lists/lists.service.js";

function createToken(): string {
  return jwt.sign({ userCode: "USER0007" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

describe("personal list endpoints", () => {
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

  it("uses the authenticated owner when listing personal lists", async () => {
    vi.spyOn(listsService, "list").mockResolvedValue([]);

    const response = await request(app)
      .get("/api/lists")
      .set("Authorization", `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(listsService.list).toHaveBeenCalledWith(7);
    expect(response.body.data).toEqual({ lists: [] });
  });

  it("creates a list without accepting a client owner identifier", async () => {
    const create = vi.spyOn(listsService, "create").mockResolvedValue({
      id: 2,
      name: "Planning",
      iconKey: "target",
      color: "#0D9488",
      isDefault: false,
      displayOrder: 1,
    });

    const response = await request(app)
      .post("/api/lists")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({ name: "Planning", iconKey: "target", color: "#0D9488", ownerUserId: 999 });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(7, {
      name: "Planning",
      iconKey: "target",
      color: "#0D9488",
    });
  });

  it("rejects unsupported list appearance values", async () => {
    const create = vi.spyOn(listsService, "create");

    const response = await request(app)
      .post("/api/lists")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({ name: "Planning", iconKey: "unknown", color: "red" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(create).not.toHaveBeenCalled();
  });
});
