import { describe, expect, it } from "vitest";
import { sqlServerGuidSchema } from "../../src/shared/validation/sql-server-guid.schema.js";
import { attachmentIdParamsSchema as taskAttachmentParamsSchema } from "../../src/modules/task-details/task-details.schemas.js";
import { meetingAttachmentParamsSchema } from "../../src/modules/meetings/meeting-workspace.schemas.js";
import { attachmentIdParamsSchema as contractAttachmentParamsSchema } from "../../src/modules/contracts/contracts.schemas.js";

const sqlSequentialId = "EB0656E1-6CCC-F111-9FDF-E8CF832B9092";
const standardUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("SQL Server attachment identifiers", () => {
  it("accepts SQL Server NEWSEQUENTIALID values rejected by RFC-version UUID validation", () => {
    expect(sqlServerGuidSchema.safeParse(sqlSequentialId).success).toBe(true);
    expect(taskAttachmentParamsSchema.safeParse({ attachmentId: sqlSequentialId }).success).toBe(true);
    expect(meetingAttachmentParamsSchema.safeParse({ attachmentId: sqlSequentialId }).success).toBe(true);
    expect(contractAttachmentParamsSchema.safeParse({ attachmentId: sqlSequentialId }).success).toBe(true);
  });

  it("continues to accept standard UUIDs", () => {
    expect(sqlServerGuidSchema.safeParse(standardUuid).success).toBe(true);
    expect(sqlServerGuidSchema.safeParse(standardUuid.toUpperCase()).success).toBe(true);
  });

  it.each(["", "not-a-guid", "EB0656E1-6CCC-F111-9FDF-E8CF832B909", "EB0656E1-6CCC-F111-9FDF-E8CF832B909Z", "../../secret", "{EB0656E1-6CCC-F111-9FDF-E8CF832B9092}"])(
    "rejects malformed identifier %s", (candidate) => {
      expect(sqlServerGuidSchema.safeParse(candidate).success).toBe(false);
    },
  );
});
