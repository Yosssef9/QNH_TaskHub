import type {
  AccessPermission,
  AccessPermissionCode,
  ProcurementAccessState,
  ProcurementEntityCode,
} from "./access-permissions.types.js";

export function hasAccessPermission(
  permissions: readonly AccessPermission[],
  entityCode: ProcurementEntityCode,
  permissionCode: AccessPermissionCode,
  resourceOwnerUserId: number | null = null,
): boolean {
  return permissions.some(
    (permission) =>
      permission.moduleCode === "PROCUREMENT" &&
      permission.entityCode === entityCode &&
      permission.permissionCode === permissionCode &&
      permission.resourceOwnerUserId === resourceOwnerUserId,
  );
}

export function hasAnyProcurementAccess(permissions: readonly AccessPermission[]): boolean {
  return permissions.some(
    (permission) =>
      permission.moduleCode === "PROCUREMENT" &&
      permission.permissionCode === "ACCESS" &&
      permission.resourceOwnerUserId === null,
  );
}

export function procurementAccessState(
  permissions: readonly AccessPermission[],
): ProcurementAccessState {
  return {
    contracts: hasAccessPermission(permissions, "CONTRACTS", "ACCESS"),
    items: hasAccessPermission(permissions, "ITEMS", "ACCESS"),
    suppliers: hasAccessPermission(permissions, "SUPPLIERS", "ACCESS"),
    priceQuotes: hasAccessPermission(permissions, "PRICE_QUOTES", "ACCESS"),
  };
}

export function canViewContractOwner(
  permissions: readonly AccessPermission[],
  actorUserId: number,
  ownerUserId: number,
): boolean {
  return (
    actorUserId === ownerUserId ||
    hasAccessPermission(permissions, "CONTRACTS", "VIEW", ownerUserId)
  );
}

export function canManageContractOwnerAttachments(
  permissions: readonly AccessPermission[],
  actorUserId: number,
  ownerUserId: number,
): boolean {
  return (
    actorUserId === ownerUserId ||
    hasAccessPermission(permissions, "CONTRACTS", "MANAGE_ATTACHMENTS", ownerUserId)
  );
}
