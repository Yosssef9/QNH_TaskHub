import { describe, expect, it } from "vitest";

import { assertLastAdminIsPreserved } from "../../src/modules/access/access.policy.js";

describe("last administrator policy", () => {
  it("prevents deactivating the final active administrator", () => {
    expect(() =>
      assertLastAdminIsPreserved({
        currentAccess: { roleCode: "ADMIN", isActive: true },
        nextRoleIsAdmin: true,
        nextIsActive: false,
        activeAdminCount: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "LAST_ACTIVE_ADMIN_REQUIRED" }));
  });

  it("allows changing an administrator when another active administrator remains", () => {
    expect(() =>
      assertLastAdminIsPreserved({
        currentAccess: { roleCode: "ADMIN", isActive: true },
        nextRoleIsAdmin: false,
        nextIsActive: true,
        activeAdminCount: 2,
      }),
    ).not.toThrow();
  });

  it("does not affect normal user access changes", () => {
    expect(() =>
      assertLastAdminIsPreserved({
        currentAccess: { roleCode: "USER", isActive: true },
        nextRoleIsAdmin: false,
        nextIsActive: false,
        activeAdminCount: 1,
      }),
    ).not.toThrow();
  });
});
