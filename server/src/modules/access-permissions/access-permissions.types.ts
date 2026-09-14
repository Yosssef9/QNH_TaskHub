export type AccessModuleCode = "PROCUREMENT" | "KPI_MANAGEMENT";
export type ProcurementEntityCode = "CONTRACTS" | "ITEMS" | "SUPPLIERS" | "PRICE_QUOTES";
export type KpiWorkCyclesEntityCode = "KPI_WORK_CYCLES";
export type AccessEntityCode = ProcurementEntityCode | KpiWorkCyclesEntityCode;
export type AccessPermissionCode = "ACCESS" | "VIEW" | "MANAGE_ATTACHMENTS";

export interface AccessPermission {
  moduleCode: AccessModuleCode;
  entityCode: AccessEntityCode;
  permissionCode: AccessPermissionCode;
  resourceOwnerUserId: number | null;
}

export interface ProcurementAccessState {
  contracts: boolean;
  items: boolean;
  suppliers: boolean;
  priceQuotes: boolean;
}

export interface ContractAccessScope {
  ownerUserId: number;
  ownerUserCode: string;
  ownerUserName: string;
  isOwn: boolean;
  canManageAttachments: boolean;
}

export interface ContractAccessAdminUser {
  userId: number;
  userCode: string;
  userName: string;
  contractsAccess: boolean;
}

export interface ContractAccessDelegation {
  granteeUserId: number;
  granteeUserCode: string;
  granteeUserName: string;
  ownerUserId: number;
  ownerUserCode: string;
  ownerUserName: string;
  view: boolean;
  manageAttachments: boolean;
}

export interface ContractAccessAdminData {
  users: ContractAccessAdminUser[];
  delegations: ContractAccessDelegation[];
}

export const PROCUREMENT_ENTITIES: readonly ProcurementEntityCode[] = [
  "CONTRACTS",
  "ITEMS",
  "SUPPLIERS",
  "PRICE_QUOTES",
] as const;

