import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { mapAccessUser } from "./access.mapper.js";
import { assertLastAdminIsPreserved } from "./access.policy.js";
import { accessRepository } from "./access.repository.js";
import type {
  AccessListQuery,
  AccessUser,
  AccessUserList,
  UpdateAccessInput,
} from "./access.types.js";

export interface AccessService {
  listUsers(query: AccessListQuery): Promise<AccessUserList>;
  updateUserAccess(actorUserId: number, input: UpdateAccessInput): Promise<AccessUser>;
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

      const currentAccess = await accessRepository.findCurrentAccessForUpdate(
        transaction,
        input.userId,
      );

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

      const contractsEnabled = input.contractsEnabled ?? currentAccess?.contractsEnabled ?? false;
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
        contractsEnabled,
      });

      await accessRepository.saveMeetingPermissions(transaction, {
        actorUserId,
        targetUserId: input.userId,
        meetingOrganizeEnabled,
        meetingCoordinateEnabled,
      });

      if (input.isActive && contractsEnabled) {
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
};
