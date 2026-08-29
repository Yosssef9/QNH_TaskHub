import { describe, expect, it } from "vitest";

import { mapAttachment, mapSubtask } from "../../src/modules/task-details/task-details.mapper.js";
import {
  attachmentIdParamsSchema,
  reorderSubtasksBodySchema,
} from "../../src/modules/task-details/task-details.schemas.js";

describe("task details contracts", () => {
  it("does not expose the private storage key", () => {
    const attachment = mapAttachment({
      id: "22222222-2222-4222-8222-222222222222",
      taskId: 1,
      subtaskId: null,
      originalFileName: "report.pdf",
      storageKey: "private-key.pdf",
      mimeType: "application/pdf",
      fileExtension: ".pdf",
      sizeBytes: 120,
      uploadedAtUtc: new Date("2026-08-25T10:00:00Z"),
    });
    expect(attachment).not.toHaveProperty("storageKey");
    expect(attachment.originalFileName).toBe("report.pdf");
  });

  it("maps subtask dates without timezone drift", () => {
    const subtask = mapSubtask({
      id: 2,
      taskId: 1,
      title: "Prepare document",
      isCompleted: false,
      dueDate: new Date("2026-08-25T00:00:00Z"),
      displayOrder: 1,
      createdAtUtc: new Date("2026-08-20T10:00:00Z"),
      updatedAtUtc: null,
      completedAtUtc: null,
    });
    expect(subtask.dueDate).toBe("2026-08-25");
  });

  it("rejects empty reorder requests", () => {
    expect(reorderSubtasksBodySchema.safeParse({ subtaskIds: [] }).success).toBe(false);
  });

  it("accepts SQL Server sequential GUID attachment IDs", () => {
    expect(
      attachmentIdParamsSchema.safeParse({
        attachmentId: "4795BA43-7AA0-F111-AE2B-C86E08EAAFA5",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed attachment IDs", () => {
    expect(attachmentIdParamsSchema.safeParse({ attachmentId: "not-a-guid" }).success).toBe(false);
  });
});
