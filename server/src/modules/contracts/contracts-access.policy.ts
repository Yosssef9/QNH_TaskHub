import { AppError } from "../../shared/errors/app-error.js";
import {
  canManageContractOwnerAttachments,
  canViewContractOwner,
} from "../access-permissions/access-permissions.policy.js";
import type { AccessPermission } from "../access-permissions/access-permissions.types.js";

export interface ContractResourceAccess {
  isOwner: boolean;
  canManageAttachments: boolean;
}

export function resolveContractResourceAccess(
  actorUserId: number,
  permissions: readonly AccessPermission[],
  ownerUserId: number,
): ContractResourceAccess {
  if (!canViewContractOwner(permissions, actorUserId, ownerUserId)) {
    throw new AppError({
      statusCode: 403,
      code: "CONTRACT_OWNER_ACCESS_REQUIRED",
      message: "You do not have access to this Contract owner.",
    });
  }

  return {
    isOwner: actorUserId === ownerUserId,
    canManageAttachments: canManageContractOwnerAttachments(
      permissions,
      actorUserId,
      ownerUserId,
    ),
  };
}

export function requireContractOwner(access: ContractResourceAccess): void {
  if (!access.isOwner) {
    throw new AppError({
      statusCode: 403,
      code: "CONTRACT_OWNER_ACTION_REQUIRED",
      message: "Shared Contract access is read-only for Contract fields and lifecycle actions.",
    });
  }
}

export function requireContractAttachmentManagement(access: ContractResourceAccess): void {
  if (!access.canManageAttachments) {
    throw new AppError({
      statusCode: 403,
      code: "CONTRACT_ATTACHMENT_MANAGEMENT_REQUIRED",
      message: "You do not have permission to manage this Contract owner's attachments.",
    });
  }
}
