import { AppError } from "../../shared/errors/app-error.js";
import type { AuthMeData, LanguageCode, TaskHubRoleCode, ThemePreference } from "./auth.types.js";
import type { AccessProfileRecord, PortalUserRecord } from "./auth.repository.js";

function toRoleCode(value: string): TaskHubRoleCode {
  if (value === "USER" || value === "ADMIN") {
    return value;
  }

  throw new AppError({
    statusCode: 500,
    code: "INVALID_ACCESS_CONFIGURATION",
    message: "TaskHub access has an unsupported role configuration.",
  });
}

function toLanguageCode(value: string | null): LanguageCode {
  if (value === "AR" || value === "EN") {
    return value;
  }

  throw new AppError({
    statusCode: 500,
    code: "INVALID_PREFERENCE_CONFIGURATION",
    message: "TaskHub language preference is missing or invalid.",
  });
}

function toTheme(value: string | null): ThemePreference {
  if (value === "LIGHT" || value === "DARK" || value === "SYSTEM") {
    return value;
  }

  throw new AppError({
    statusCode: 500,
    code: "INVALID_PREFERENCE_CONFIGURATION",
    message: "TaskHub theme preference is missing or invalid.",
  });
}

export function mapAuthMeData(
  portalUser: PortalUserRecord,
  access: AccessProfileRecord,
): AuthMeData {
  if (
    access.sidebarCollapsed === null ||
    access.calendarShowAdjacentDates === null ||
    access.timezone !== "Asia/Riyadh"
  ) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_PREFERENCE_CONFIGURATION",
      message: "TaskHub preferences are missing or invalid.",
    });
  }

  return {
    user: {
      userId: portalUser.userId,
      userCode: portalUser.userCode,
      userName: portalUser.userName,
      email: portalUser.email,
    },
    access: {
      roleCode: toRoleCode(access.roleCode),
    },
    preferences: {
      languageCode: toLanguageCode(access.languageCode),
      theme: toTheme(access.theme),
      sidebarCollapsed: access.sidebarCollapsed,
      calendarShowAdjacentDates: access.calendarShowAdjacentDates,
      timezone: access.timezone,
    },
  };
}
