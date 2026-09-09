import { describe, expect, it } from "vitest";

import type { AccessPermission } from "../../src/modules/access-permissions/access-permissions.types.js";
import {
  requireContractAttachmentManagement,
  requireContractOwner,
  resolveContractResourceAccess,
} from "../../src/modules/contracts/contracts-access.policy.js";

const delegated = (
  permissionCode: "VIEW" | "MANAGE_ATTACHMENTS",
  ownerUserId = 200,
): AccessPermission => ({
  moduleCode: "PROCUREMENT",
  entityCode: "CONTRACTS",
  permissionCode,
  resourceOwnerUserId: ownerUserId,
});

describe("Contract delegated-access policy", () => {
  it("returns full resource capability for the Contract owner", () => {
    expect(resolveContractResourceAccess(100, [], 100)).toEqual({
      isOwner: true,
      canManageAttachments: true,
    });
  });

  it("returns read-only capability for a VIEW delegate", () => {
    const access = resolveContractResourceAccess(100, [delegated("VIEW")], 200);

    expect(access).toEqual({ isOwner: false, canManageAttachments: false });
    expect(() => requireContractOwner(access)).toThrowError(
      expect.objectContaining({ code: "CONTRACT_OWNER_ACTION_REQUIRED" }),
    );
    expect(() => requireContractAttachmentManagement(access)).toThrowError(
      expect.objectContaining({ code: "CONTRACT_ATTACHMENT_MANAGEMENT_REQUIRED" }),
    );
  });

  it("allows attachment management without granting Contract-field ownership actions", () => {
    const access = resolveContractResourceAccess(
      100,
      [delegated("VIEW"), delegated("MANAGE_ATTACHMENTS")],
      200,
    );

    expect(access).toEqual({ isOwner: false, canManageAttachments: true });
    expect(() => requireContractAttachmentManagement(access)).not.toThrow();
    expect(() => requireContractOwner(access)).toThrowError(
      expect.objectContaining({ code: "CONTRACT_OWNER_ACTION_REQUIRED" }),
    );
  });

  it("rejects a user without owner or delegated VIEW access", () => {
    expect(() => resolveContractResourceAccess(100, [], 200)).toThrowError(
      expect.objectContaining({ code: "CONTRACT_OWNER_ACCESS_REQUIRED" }),
    );
  });
});
