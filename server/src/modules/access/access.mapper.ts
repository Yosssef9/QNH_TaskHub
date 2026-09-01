import { AppError } from "../../shared/errors/app-error.js";
import type { TaskHubRoleCode } from "../auth/auth.types.js";
import type { AccessUser } from "./access.types.js";

export interface AccessUserRecord {
  userId: number;
  userCode: string;
  userName: string;
  email: string | null;
  portalIsActive: boolean;
  roleCode: string | null;
  accessIsActive: boolean | null;
  contractsEnabled: boolean | null;
  meetingOrganizeEnabled?: boolean | null;
  meetingCoordinateEnabled?: boolean | null;
}

function toNullableRoleCode(value: string | null): TaskHubRoleCode | null {
  if (value === null || value === "USER" || value === "ADMIN") {
    return value;
  }

  throw new AppError({
    statusCode: 500,
    code: "INVALID_ACCESS_CONFIGURATION",
    message: "A TaskHub user has an unsupported role configuration.",
  });
}

export function mapAccessUser(record: AccessUserRecord): AccessUser {
  return {
    userId: record.userId,
    userCode: record.userCode,
    userName: record.userName,
    email: record.email,
    portalIsActive: record.portalIsActive,
    roleCode: toNullableRoleCode(record.roleCode),
    accessIsActive: record.accessIsActive ?? false,
    contractsEnabled: record.contractsEnabled ?? false,
    meetingOrganizeEnabled: record.meetingOrganizeEnabled ?? false,
    meetingCoordinateEnabled: record.meetingCoordinateEnabled ?? false,
  };
}
