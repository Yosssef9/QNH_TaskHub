import type {
  AccessPermission,
  AccessPermissionCode,
  ProcurementEntityCode,
  TaskHubAccess,
} from './types/auth.types'

export function hasAccessPermission(
  access: Pick<TaskHubAccess, 'permissions'> | null | undefined,
  entityCode: ProcurementEntityCode,
  permissionCode: AccessPermissionCode = 'ACCESS',
  resourceOwnerUserId: number | null = null,
): boolean {
  return Boolean(
    access?.permissions.some(
      (permission) =>
        permission.moduleCode === 'PROCUREMENT' &&
        permission.entityCode === entityCode &&
        permission.permissionCode === permissionCode &&
        permission.resourceOwnerUserId === resourceOwnerUserId,
    ),
  )
}

export function hasAnyProcurementAccess(
  access: Pick<TaskHubAccess, 'permissions'> | null | undefined,
): boolean {
  return Boolean(
    access?.permissions.some(
      (permission) =>
        permission.moduleCode === 'PROCUREMENT' &&
        permission.permissionCode === 'ACCESS' &&
        permission.resourceOwnerUserId === null,
    ),
  )
}

export function procurementAccessEntities(
  access: Pick<TaskHubAccess, 'permissions'> | null | undefined,
): ProcurementEntityCode[] {
  const order: ProcurementEntityCode[] = ['CONTRACTS', 'ITEMS', 'SUPPLIERS', 'PRICE_QUOTES']
  return order.filter((entityCode) => hasAccessPermission(access, entityCode))
}

export function permissionKey(permission: AccessPermission): string {
  return [
    permission.moduleCode,
    permission.entityCode,
    permission.permissionCode,
    permission.resourceOwnerUserId ?? 'GLOBAL',
  ].join(':')
}
