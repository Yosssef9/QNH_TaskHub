import { describe, expect, it, vi } from "vitest";

import type {
  AccessProfileRecord,
  AuthRepository,
  PortalUserRecord,
} from "../../src/modules/auth/auth.repository.js";
import { createAuthService } from "../../src/modules/auth/auth.service.js";
import type { AppError } from "../../src/shared/errors/app-error.js";

const portalUser: PortalUserRecord = {
  userId: 7,
  userCode: "QNH0007",
  userName: "Test User",
  email: null,
  isActive: true,
};

const accessProfile: AccessProfileRecord = {
  roleCode: "USER",
  isActive: true,
  languageCode: "AR",
  theme: "SYSTEM",
  sidebarCollapsed: false,
  timezone: "Asia/Riyadh",
  hasDefaultList: true,
};

function createRepository(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    findPortalUserByCode: vi.fn().mockResolvedValue(portalUser),
    findAccessProfile: vi.fn().mockResolvedValue(accessProfile),
    ensureUserFoundation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject<AppError>({ code });
}

describe("auth service", () => {
  it("rejects a Portal identity that no longer exists", async () => {
    const service = createAuthService(
      createRepository({ findPortalUserByCode: vi.fn().mockResolvedValue(null) }),
    );

    await expectAppError(service.resolveCurrentUser("MISSING"), "PORTAL_USER_NOT_FOUND");
  });

  it("rejects an inactive Portal user", async () => {
    const service = createAuthService(
      createRepository({
        findPortalUserByCode: vi.fn().mockResolvedValue({ ...portalUser, isActive: false }),
      }),
    );

    await expectAppError(service.resolveCurrentUser(portalUser.userCode), "PORTAL_USER_INACTIVE");
  });

  it("does not grant access merely because the Portal token is valid", async () => {
    const service = createAuthService(
      createRepository({ findAccessProfile: vi.fn().mockResolvedValue(null) }),
    );

    await expectAppError(
      service.resolveCurrentUser(portalUser.userCode),
      "TASKHUB_ACCESS_NOT_ASSIGNED",
    );
  });

  it("rejects inactive TaskHub access", async () => {
    const service = createAuthService(
      createRepository({
        findAccessProfile: vi.fn().mockResolvedValue({ ...accessProfile, isActive: false }),
      }),
    );

    await expectAppError(
      service.resolveCurrentUser(portalUser.userCode),
      "TASKHUB_ACCESS_INACTIVE",
    );
  });

  it("repairs missing user foundation before returning the profile", async () => {
    const incompleteAccess = { ...accessProfile, languageCode: null, hasDefaultList: false };
    const repository = createRepository({
      findAccessProfile: vi
        .fn()
        .mockResolvedValueOnce(incompleteAccess)
        .mockResolvedValueOnce(accessProfile),
    });
    const service = createAuthService(repository);

    const result = await service.resolveCurrentUser(portalUser.userCode);

    expect(repository.ensureUserFoundation).toHaveBeenCalledWith(portalUser.userId);
    expect(result.user.userId).toBe(portalUser.userId);
    expect(result.access.roleCode).toBe("USER");
  });
});
