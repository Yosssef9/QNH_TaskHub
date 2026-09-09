import { describe, expect, it } from "vitest";

import {
  canManageContractOwnerAttachments,
  canViewContractOwner,
  hasAccessPermission,
  hasAnyProcurementAccess,
  procurementAccessState,
} from "../../src/modules/access-permissions/access-permissions.policy.js";
import type { AccessPermission } from "../../src/modules/access-permissions/access-permissions.types.js";

const permission = (
  entityCode: AccessPermission["entityCode"],
  permissionCode: AccessPermission["permissionCode"],
  resourceOwnerUserId: number | null = null,
): AccessPermission => ({
  moduleCode: "PROCUREMENT",
  entityCode,
  permissionCode,
  resourceOwnerUserId,
});

describe("access permissions policy", () => {
  it("matches only the requested Procurement entity, permission and owner scope", () => {
    const permissions = [
      permission("CONTRACTS", "ACCESS"),
      permission("CONTRACTS", "VIEW", 200),
    ];

    expect(hasAccessPermission(permissions, "CONTRACTS", "ACCESS")).toBe(true);
    expect(hasAccessPermission(permissions, "ITEMS", "ACCESS")).toBe(false);
    expect(hasAccessPermission(permissions, "CONTRACTS", "VIEW", 200)).toBe(true);
    expect(hasAccessPermission(permissions, "CONTRACTS", "VIEW", 201)).toBe(false);
  });

  it("reports Procurement workspace access only from global ACCESS permissions", () => {
    expect(hasAnyProcurementAccess([permission("CONTRACTS", "VIEW", 200)])).toBe(false);
    expect(hasAnyProcurementAccess([permission("PRICE_QUOTES", "ACCESS")])).toBe(true);
  });

  it("derives the four Procurement workspace flags independently", () => {
    expect(
      procurementAccessState([
        permission("CONTRACTS", "ACCESS"),
        permission("SUPPLIERS", "ACCESS"),
      ]),
    ).toEqual({
      contracts: true,
      items: false,
      suppliers: true,
      priceQuotes: false,
    });
  });

  it("always lets a Contract owner view and manage their own attachments", () => {
    expect(canViewContractOwner([], 100, 100)).toBe(true);
    expect(canManageContractOwnerAttachments([], 100, 100)).toBe(true);
  });

  it("keeps delegated VIEW and MANAGE_ATTACHMENTS owner-scoped", () => {
    const permissions = [
      permission("CONTRACTS", "VIEW", 200),
      permission("CONTRACTS", "MANAGE_ATTACHMENTS", 200),
    ];

    expect(canViewContractOwner(permissions, 100, 200)).toBe(true);
    expect(canManageContractOwnerAttachments(permissions, 100, 200)).toBe(true);
    expect(canViewContractOwner(permissions, 100, 201)).toBe(false);
    expect(canManageContractOwnerAttachments(permissions, 100, 201)).toBe(false);
  });
});
