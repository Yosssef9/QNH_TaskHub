import { AppError } from "../../shared/errors/app-error.js";
import type { CurrentAccessRecord } from "./access.types.js";

interface LastAdminPolicyInput {
  currentAccess: CurrentAccessRecord | null;
  nextRoleIsAdmin: boolean;
  nextIsActive: boolean;
  activeAdminCount: number;
}

export function assertLastAdminIsPreserved({
  activeAdminCount,
  currentAccess,
  nextIsActive,
  nextRoleIsAdmin,
}: LastAdminPolicyInput): void {
  const removesActiveAdmin =
    currentAccess?.isActive === true &&
    currentAccess.roleCode === "ADMIN" &&
    (!nextIsActive || !nextRoleIsAdmin);

  if (removesActiveAdmin && activeAdminCount <= 1) {
    throw new AppError({
      statusCode: 409,
      code: "LAST_ACTIVE_ADMIN_REQUIRED",
      message: "The final active TaskHub administrator cannot be deactivated or demoted.",
    });
  }
}
