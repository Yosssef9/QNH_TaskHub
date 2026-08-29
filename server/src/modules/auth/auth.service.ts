import { AppError } from "../../shared/errors/app-error.js";
import { mapAuthMeData } from "./auth.mapper.js";
import { authRepository, type AuthRepository } from "./auth.repository.js";
import type { AuthMeData } from "./auth.types.js";

export interface AuthService {
  resolveCurrentUser(userCode: string): Promise<AuthMeData>;
}

export function createAuthService(repository: AuthRepository): AuthService {
  return {
    async resolveCurrentUser(userCode: string): Promise<AuthMeData> {
      const portalUser = await repository.findPortalUserByCode(userCode);

      if (!portalUser) {
        throw new AppError({
          statusCode: 403,
          code: "PORTAL_USER_NOT_FOUND",
          message: "The authenticated Portal user could not be found.",
        });
      }

      if (!portalUser.isActive) {
        throw new AppError({
          statusCode: 403,
          code: "PORTAL_USER_INACTIVE",
          message: "The QNH Portal user is inactive.",
        });
      }

      let access = await repository.findAccessProfile(portalUser.userId);

      if (!access) {
        throw new AppError({
          statusCode: 403,
          code: "TASKHUB_ACCESS_NOT_ASSIGNED",
          message: "TaskHub access has not been assigned to this user.",
        });
      }

      if (!access.isActive) {
        throw new AppError({
          statusCode: 403,
          code: "TASKHUB_ACCESS_INACTIVE",
          message: "TaskHub access for this user is inactive.",
        });
      }

      if (
        access.languageCode === null ||
        access.theme === null ||
        access.sidebarCollapsed === null ||
        access.calendarShowAdjacentDates === null ||
        access.timezone === null ||
        !access.hasDefaultList
      ) {
        await repository.ensureUserFoundation(portalUser.userId);
        access = await repository.findAccessProfile(portalUser.userId);
      }

      if (!access || !access.isActive) {
        throw new AppError({
          statusCode: 500,
          code: "ACCESS_PROVISIONING_FAILED",
          message: "TaskHub could not initialize the user workspace.",
        });
      }

      return mapAuthMeData(portalUser, access);
    },
  };
}

export const authService = createAuthService(authRepository);
