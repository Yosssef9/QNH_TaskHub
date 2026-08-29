import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { kpiWorkService } from "../../src/modules/kpis/kpi-work.service.js";
import { kpisService } from "../../src/modules/kpis/kpis.service.js";
import type { PersonalTask } from "../../src/modules/tasks/tasks.types.js";

function token(): string {
  return jwt.sign({ userCode: "USER0007" }, env.PORTAL_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

const valid = {
  name: "Completion",
  description: null,
  iconKey: "gauge",
  color: "#0F766E",
  calculationMethod: "TASK_COMPLETION_RATE",
  periodType: "MONTHLY",
  targetValue: 90,
  targetDirection: "HIGHER_IS_BETTER",
  deadlineSource: null,
  businessDayOffset: null,
  deadlineDirection: null,
  referenceDateLabel: null,
  numeratorLabel: null,
  denominatorLabel: null,
  valueLabel: null,
} as const;

function kpiTask(id: number, title: string, priority: PersonalTask["priority"]): PersonalTask {
  return {
    id,
    listId: null,
    kpiInstanceId: 12,
    kpiId: 5,
    cycleId: 3,
    cycleTitle: "Board cycle",
    kpiName: "Completion",
    kpiIconKey: "gauge",
    kpiColor: "#0F766E",
    isReadOnly: false,
    title,
    description: null,
    status: "TODO",
    priority,
    startDate: null,
    dueDate: null,
    referenceDate: null,
    displayOrder: 1,
    createdAtUtc: "2026-08-26T00:00:00.000Z",
    updatedAtUtc: null,
    completedAtUtc: null,
    cancelledAtUtc: null,
    cancellationReason: null,
    isOverdue: false,
    subtaskTotal: 0,
    subtaskCompleted: 0,
  };
}

describe("personal KPI endpoints", () => {
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

  it("derives KPI template ownership from the authenticated Portal identity", async () => {
    const create = vi.spyOn(kpisService, "create").mockResolvedValue({
      id: 1,
      ...valid,
      measurementUnit: "PERCENT",
      displayOrder: 1,
      isActive: true,
      taskCount: 0,
      taskPolicy: {
        allowsTasks: true,
        usesTasks: true,
        dueDateMode: "OPTIONAL",
        requiresReferenceDate: false,
        subtaskDueDateMode: "OPTIONAL",
      },
    });

    const response = await request(app)
      .post("/api/kpis")
      .set("Authorization", `Bearer ${token()}`)
      .send({ ...valid, ownerUserId: 999 });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(7, valid);
  });

  it("rejects incomplete on-time configuration", async () => {
    const create = vi.spyOn(kpisService, "create");

    const response = await request(app)
      .post("/api/kpis")
      .set("Authorization", `Bearer ${token()}`)
      .send({
        ...valid,
        calculationMethod: "ON_TIME_RATE",
        deadlineSource: "REFERENCE_DATE",
        businessDayOffset: null,
        deadlineDirection: "BEFORE",
        referenceDateLabel: "Meeting date",
      });

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts task-due-date on-time configuration without reference settings", async () => {
    const create = vi.spyOn(kpisService, "create").mockResolvedValue({
      id: 2,
      ...valid,
      calculationMethod: "ON_TIME_RATE",
      deadlineSource: "TASK_DUE_DATE",
      measurementUnit: "PERCENT",
      displayOrder: 2,
      isActive: true,
      taskCount: 0,
      taskPolicy: {
        allowsTasks: true,
        usesTasks: true,
        dueDateMode: "REQUIRED",
        requiresReferenceDate: false,
        subtaskDueDateMode: "OPTIONAL",
      },
    });

    const input = {
      ...valid,
      calculationMethod: "ON_TIME_RATE" as const,
      deadlineSource: "TASK_DUE_DATE" as const,
    };

    const response = await request(app)
      .post("/api/kpis")
      .set("Authorization", `Bearer ${token()}`)
      .send(input);

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(7, input);
  });

  it("accepts the subtask on-time calculation method", async () => {
    const create = vi.spyOn(kpisService, "create").mockResolvedValue({
      id: 3,
      ...valid,
      calculationMethod: "SUBTASK_ON_TIME_RATE",
      measurementUnit: "PERCENT",
      displayOrder: 3,
      isActive: true,
      taskCount: 0,
      taskPolicy: {
        allowsTasks: true,
        usesTasks: true,
        dueDateMode: "OPTIONAL",
        requiresReferenceDate: false,
        subtaskDueDateMode: "REQUIRED",
      },
    });

    const input = { ...valid, calculationMethod: "SUBTASK_ON_TIME_RATE" as const };
    const response = await request(app)
      .post("/api/kpis")
      .set("Authorization", `Bearer ${token()}`)
      .send(input);

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(7, input);
  });

  it("does not accept manual labels for an automatic method", async () => {
    const response = await request(app)
      .post("/api/kpis")
      .set("Authorization", `Bearer ${token()}`)
      .send({ ...valid, valueLabel: "Result" });

    expect(response.status).toBe(400);
  });

  it("derives KPI-instance task ownership from the authenticated Portal identity", async () => {
    const list = vi.spyOn(kpiWorkService, "list").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    const response = await request(app)
      .get("/api/kpi-instances/12/tasks")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(7, 12, expect.objectContaining({ page: 1, pageSize: 20 }));
  });

  it("allows KPI-instance task requests without a due date so the snapshot policy can apply", async () => {
    const create = vi.spyOn(kpiWorkService, "create").mockResolvedValue(kpiTask(91, "Prepare minutes", "HIGH"));

    const response = await request(app)
      .post("/api/kpi-instances/12/tasks")
      .set("Authorization", `Bearer ${token()}`)
      .send({ title: "Prepare minutes", priority: "HIGH" });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(7, 12, {
      title: "Prepare minutes",
      priority: "HIGH",
    });
    expect(response.body.data.task.kpiInstanceId).toBe(12);
  });

  it("returns the server-calculated due-date preview for a KPI instance", async () => {
    const deadline = vi.spyOn(kpiWorkService, "deadline").mockResolvedValue({
      dueDate: "2026-08-26",
    });

    const response = await request(app)
      .get("/api/kpi-instances/12/task-deadline")
      .query({ referenceDate: "2026-09-02" })
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ dueDate: "2026-08-26" });
    expect(deadline).toHaveBeenCalledWith(7, 12, { referenceDate: "2026-09-02" });
  });

  it("lists KPI tasks with Work Cycle and template filters", async () => {
    const listAll = vi.spyOn(kpiWorkService, "listAll").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    const response = await request(app)
      .get("/api/kpi-tasks")
      .query({ cycleId: 3, kpiId: 5 })
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(listAll).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ cycleId: 3, kpiId: 5, page: 1, pageSize: 20 }),
    );
  });

  it("creates a global KPI task only with an explicit Cycle and KPI instance", async () => {
    const createGlobal = vi
      .spyOn(kpiWorkService, "createGlobal")
      .mockResolvedValue(kpiTask(92, "Prepare report", "MEDIUM"));

    const response = await request(app)
      .post("/api/kpi-tasks")
      .set("Authorization", `Bearer ${token()}`)
      .send({
        cycleId: 3,
        kpiInstanceId: 12,
        title: "Prepare report",
        priority: "MEDIUM",
      });

    expect(response.status).toBe(201);
    expect(createGlobal).toHaveBeenCalledWith(7, 3, 12, {
      title: "Prepare report",
      priority: "MEDIUM",
    });
    expect(response.body.data.task.kpiInstanceId).toBe(12);
    expect(response.body.data.task.cycleId).toBe(3);
  });

  it("requires both Cycle and KPI instance selections on the global KPI-task endpoint", async () => {
    const createGlobal = vi.spyOn(kpiWorkService, "createGlobal");

    const response = await request(app)
      .post("/api/kpi-tasks")
      .set("Authorization", `Bearer ${token()}`)
      .send({ title: "Prepare report", priority: "MEDIUM" });

    expect(response.status).toBe(400);
    expect(createGlobal).not.toHaveBeenCalled();
  });
});
