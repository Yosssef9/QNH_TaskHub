import type { TaskHubRoleCode } from "../auth/auth.types.js";

export interface AccessUser {
  userId: number;
  userCode: string;
  userName: string;
  email: string | null;
  portalIsActive: boolean;
  roleCode: TaskHubRoleCode | null;
  accessIsActive: boolean;
  contractsEnabled: boolean;
  meetingOrganizeEnabled?: boolean;
  meetingCoordinateEnabled?: boolean;
}

export interface AccessUserList {
  items: AccessUser[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AccessListQuery {
  search?: string | undefined;
  page: number;
  pageSize: number;
}

export interface UpdateAccessInput {
  userId: number;
  roleCode: TaskHubRoleCode;
  isActive: boolean;
  contractsEnabled?: boolean | undefined;
  meetingOrganizeEnabled?: boolean | undefined;
  meetingCoordinateEnabled?: boolean | undefined;
}

export interface CurrentAccessRecord {
  roleCode: TaskHubRoleCode;
  isActive: boolean;
  contractsEnabled: boolean;
  meetingOrganizeEnabled?: boolean;
  meetingCoordinateEnabled?: boolean;
}
