export type TaskHubRoleCode = "USER" | "ADMIN";
export type LanguageCode = "AR" | "EN";
export type ThemePreference = "LIGHT" | "DARK" | "SYSTEM";
export type TimeFormatPreference = "12H" | "24H";

export interface PortalIdentity {
  userCode: string;
}

export interface PortalUser {
  userId: number;
  userCode: string;
  userName: string;
  email: string | null;
}

export interface TaskHubAccess {
  roleCode: TaskHubRoleCode;
  contractsEnabled: boolean;
  meetingOrganizeEnabled?: boolean;
  meetingCoordinateEnabled?: boolean;
}

export interface UserPreferences {
  languageCode: LanguageCode;
  theme: ThemePreference;
  sidebarCollapsed: boolean;
  calendarShowAdjacentDates: boolean;
  meetingStartReminderEnabled: boolean;
  timeFormat: TimeFormatPreference;
  timezone: "Asia/Riyadh";
}

export interface AuthMeData {
  user: PortalUser;
  access: TaskHubAccess;
  preferences: UserPreferences;
}


