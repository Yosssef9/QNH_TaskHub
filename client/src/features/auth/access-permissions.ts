import type {
  AccessPermission,
  AccessPermissionCode,
  AccessModuleCode,
  AccessEntityCode,
  ProcurementEntityCode,
  TaskHubAccess,
} from './types/auth.types'

export function hasModuleAccessPermission(
  access: Pick<TaskHubAccess, 'permissions'> | null | undefined,
  moduleCode: AccessModuleCode,
  entityCode: AccessEntityCode,
  permissionCode: AccessPermissionCode = 'ACCESS',
  resourceOwnerUserId: number | null = null,
): boolean {
  return Boolean(
    access?.permissions.some(
      (permission) =>
        permission.moduleCode === moduleCode &&
        permission.entityCode === entityCode &&
        permission.permissionCode === permissionCode &&
        permission.resourceOwnerUserId === resourceOwnerUserId,
    ),
  )
}


export function hasAccessPermission(
  access: Pick<TaskHubAccess, 'permissions'> | null | undefined,
  entityCode: ProcurementEntityCode,
  permissionCode: AccessPermissionCode = 'ACCESS',
  resourceOwnerUserId: number | null = null,
): boolean {
  return hasModuleAccessPermission(
    access,
    'PROCUREMENT',
    entityCode,
    permissionCode,
    resourceOwnerUserId,
  )
}

export function hasKpiWorkCyclesAccess(
  access: Pick<TaskHubAccess, 'permissions'> | null | undefined,
): boolean {
  return hasModuleAccessPermission(access, 'KPI_MANAGEMENT', 'KPI_WORK_CYCLES')
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

