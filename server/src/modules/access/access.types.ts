import type { ProcurementAccessState } from "../access-permissions/access-permissions.types.js";
import type { TaskHubRoleCode } from "../auth/auth.types.js";

export interface AccessUser {
  userId: number;
  userCode: string;
  userName: string;
  email: string | null;
  portalIsActive: boolean;
  roleCode: TaskHubRoleCode | null;
  accessIsActive: boolean;
  procurementAccess: ProcurementAccessState;
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
  procurementAccess: ProcurementAccessState;
  meetingOrganizeEnabled?: boolean | undefined;
  meetingCoordinateEnabled?: boolean | undefined;
}

export interface CurrentAccessRecord {
  roleCode: TaskHubRoleCode;
  isActive: boolean;
  meetingOrganizeEnabled?: boolean;
  meetingCoordinateEnabled?: boolean;
}

export interface DelegationParticipantRecord {
  userId: number;
  contractsAccess: boolean;
}
