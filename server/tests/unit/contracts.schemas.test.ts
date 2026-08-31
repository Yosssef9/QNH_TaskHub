import { describe, expect, it } from "vitest";

import {
  attachmentIdParamsSchema,
  createContractBodySchema,
  updateContractBodySchema,
} from "../../src/modules/contracts/contracts.schemas.js";

const baseContract = {
  supplierId: 1,
  contractNumber: null,
  title: "Roche maintenance",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  isAutoRenewal: false,
  renewalTermMonths: null,
  noticePeriodDays: null,
  valueType: "FIXED" as const,
  contractValueSar: 120000,
  paymentFrequency: "ANNUAL" as const,
  paymentTiming: "IN_ADVANCE" as const,
  notes: null,
};

describe("contract schemas", () => {
  it("accepts a fixed non-auto-renewing contract", () => {
    expect(createContractBodySchema.safeParse(baseContract).success).toBe(true);
  });

  it("requires the full renewal terms when automatic renewal is enabled", () => {
    const result = createContractBodySchema.safeParse({
      ...baseContract,
      isAutoRenewal: true,
      renewalTermMonths: null,
      noticePeriodDays: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a fixed amount on a variable-value contract", () => {
    const result = createContractBodySchema.safeParse({
      ...baseContract,
      valueType: "VARIABLE",
    });

    expect(result.success).toBe(false);
  });

  it("accepts SQL Server NEWSEQUENTIALID-style GUID attachment ids", () => {
    expect(
      attachmentIdParamsSchema.safeParse({
        attachmentId: "D5FDF84C-27A5-F111-AE2F-C86E08EAAFA5",
      }).success,
    ).toBe(true);
  });

  it("normalizes accepted SQL Server row-version token encodings", () => {
    const canonical = updateContractBodySchema.safeParse({
      ...baseContract,
      rowVersion: "0x000000000000001A",
    });
    expect(canonical.success).toBe(true);
    if (canonical.success) expect(canonical.data.rowVersion).toBe("0x000000000000001A");

    const uppercasePrefix = updateContractBodySchema.safeParse({
      ...baseContract,
      rowVersion: "0X000000000000001A",
    });
    expect(uppercasePrefix.success).toBe(true);
    if (uppercasePrefix.success) expect(uppercasePrefix.data.rowVersion).toBe("0x000000000000001A");

    const bareHex = updateContractBodySchema.safeParse({
      ...baseContract,
      rowVersion: "000000000000001A",
    });
    expect(bareHex.success).toBe(true);
    if (bareHex.success) expect(bareHex.data.rowVersion).toBe("0x000000000000001A");

    const base64 = updateContractBodySchema.safeParse({
      ...baseContract,
      rowVersion: Buffer.from("000000000000001a", "hex").toString("base64"),
    });
    expect(base64.success).toBe(true);
    if (base64.success) expect(base64.data.rowVersion).toBe("0x000000000000001A");

    expect(
      updateContractBodySchema.safeParse({
        ...baseContract,
        rowVersion: "stale",
      }).success,
    ).toBe(false);
  });
});
