import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { accessPermissionsRepository } from "../access-permissions/access-permissions.repository.js";
import type { ContractAccessAdminData } from "../access-permissions/access-permissions.types.js";
import { mapAccessUser } from "./access.mapper.js";
import { assertLastAdminIsPreserved } from "./access.policy.js";
import { accessRepository } from "./access.repository.js";
import type { AccessListQuery, AccessUser, AccessUserList, UpdateAccessInput } from "./access.types.js";

export interface AccessService {
  listUsers(query: AccessListQuery): Promise<AccessUserList>;
  updateUserAccess(actorUserId: number, input: UpdateAccessInput): Promise<AccessUser>;
  getContractAccessAdminData(): Promise<ContractAccessAdminData>;
  updateContractDelegation(
    actorUserId: number,
    input: {
      granteeUserId: number;
      ownerUserId: number;
      view: boolean;
      manageAttachments: boolean;
    },
  ): Promise<ContractAccessAdminData>;
}

export const accessService: AccessService = {
  async listUsers(query) {
    const result = await accessRepository.listAccessUsers(query);
    return {
      items: result.items.map(mapAccessUser),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  },

  async updateUserAccess(actorUserId, input) {
    await withTransaction(async (transaction) => {
      const portalUser = await accessRepository.findPortalUserForUpdate(transaction, input.userId);
      if (!portalUser) {
        throw new AppError({
          statusCode: 404,
          code: "PORTAL_USER_NOT_FOUND",
          message: "The selected Portal user does not exist.",
        });
      }
      if (input.isActive && !portalUser.isActive) {
        throw new AppError({
          statusCode: 409,
          code: "PORTAL_USER_INACTIVE",
          message: "An inactive Portal user cannot receive active TaskHub access.",
        });
      }

      const currentAccess = await accessRepository.findCurrentAccessForUpdate(transaction, input.userId);
      if (!currentAccess && !input.isActive) {
        throw new AppError({
          statusCode: 409,
          code: "ACCESS_NOT_ASSIGNED",
          message: "TaskHub access must be granted before it can be deactivated.",
        });
      }

      const activeAdminCount = await accessRepository.countActiveAdminsForUpdate(transaction);
      assertLastAdminIsPreserved({
        currentAccess,
        nextRoleIsAdmin: input.roleCode === "ADMIN",
        nextIsActive: input.isActive,
        activeAdminCount,
      });

      const meetingOrganizeEnabled =
        input.meetingOrganizeEnabled ?? currentAccess?.meetingOrganizeEnabled ?? false;
      const meetingCoordinateEnabled =
        input.meetingCoordinateEnabled ?? currentAccess?.meetingCoordinateEnabled ?? false;

      await accessRepository.saveAccess(transaction, {
        actorUserId,
        targetUserId: input.userId,
        roleCode: input.roleCode,
        isActive: input.isActive,
        accessExists: currentAccess !== null,
      });

      await accessPermissionsRepository.saveProcurementAccess(transaction, {
        actorUserId,
        granteeUserId: input.userId,
        access: input.procurementAccess,
      });

      await accessRepository.saveMeetingPermissions(transaction, {
        actorUserId,
        targetUserId: input.userId,
        meetingOrganizeEnabled,
        meetingCoordinateEnabled,
      });

      if (input.isActive && input.procurementAccess.contracts) {
        await accessRepository.ensureContractSettingsInTransaction(transaction, input.userId);
      }
      if (input.isActive) {
        await accessRepository.ensureUserFoundationInTransaction(transaction, input.userId);
      }
    });

    const updatedUser = await accessRepository.findAccessUserById(input.userId);
    if (!updatedUser) {
      throw new AppError({
        statusCode: 500,
        code: "ACCESS_UPDATE_FAILED",
        message: "The updated TaskHub access could not be loaded.",
      });
    }
    return mapAccessUser(updatedUser);
  },

  getContractAccessAdminData() {
    return accessPermissionsRepository.getContractAccessAdminData();
  },

  async updateContractDelegation(actorUserId, input) {
    await withTransaction(async (transaction) => {
      const [grantee, owner] = await Promise.all([
        accessRepository.findDelegationParticipantForUpdate(transaction, input.granteeUserId),
        accessRepository.findDelegationParticipantForUpdate(transaction, input.ownerUserId),
      ]);
      if (!grantee || !owner) {
        throw new AppError({
          statusCode: 409,
          code: "CONTRACT_DELEGATION_USER_INACTIVE",
          message: "Both users must have active TaskHub and Portal access.",
        });
      }
      if (!owner.contractsAccess) {
        throw new AppError({
          statusCode: 409,
          code: "CONTRACT_DELEGATION_OWNER_ACCESS_REQUIRED",
          message: "The Contract owner must have Contracts access before access can be delegated.",
        });
      }

      await accessPermissionsRepository.saveContractDelegation(transaction, {
        actorUserId,
        granteeUserId: input.granteeUserId,
        ownerUserId: input.ownerUserId,
        view: input.view,
        manageAttachments: input.view && input.manageAttachments,
      });

      if (input.view && !grantee.contractsAccess) {
        await accessRepository.ensureContractSettingsInTransaction(transaction, input.granteeUserId);
      }
    });

    return accessPermissionsRepository.getContractAccessAdminData();
  },
};
