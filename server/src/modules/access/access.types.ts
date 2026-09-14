import type { ProcurementAccessState } from "../access-permissions/access-permissions.types.js";
import type { TaskHubRoleCode } from "../auth/auth.types.js";

export type AccessRoleFilter = "ALL" | "USER" | "ADMIN" | "UNASSIGNED";
export type AccessStatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "UNASSIGNED";
export type AccessPermissionFilter = "ALL" | "WITH_ACCESS" | "WITHOUT_ACCESS";
export type AccessKpiWorkCyclesFilter = AccessPermissionFilter;
export type AccessMeetingFilter = "ALL" | "ORGANIZER" | "COORDINATOR" | "BOTH" | "NONE";
export type AccessSortBy =
  | "userName"
  | "userCode"
  | "role"
  | "procurement"
  | "kpiWorkCycles"
  | "meetings"
  | "status";
export type AccessSortDirection = "asc" | "desc";

export interface AccessUser {
  userId: number;
  userCode: string;
  userName: string;
  email: string | null;
  portalIsActive: boolean;
  roleCode: TaskHubRoleCode | null;
  accessIsActive: boolean;
  procurementAccess: ProcurementAccessState;
  kpiWorkCyclesAccess: boolean;
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
  role: AccessRoleFilter;
  status: AccessStatusFilter;
  procurement: AccessPermissionFilter;
  kpiWorkCycles: AccessKpiWorkCyclesFilter;
  meetings: AccessMeetingFilter;
  sortBy: AccessSortBy;
  sortDirection: AccessSortDirection;
  page: number;
  pageSize: number;
}

export interface UpdateAccessInput {
  userId: number;
  roleCode: TaskHubRoleCode;
  isActive: boolean;
  procurementAccess: ProcurementAccessState;
  kpiWorkCyclesAccess: boolean;
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
