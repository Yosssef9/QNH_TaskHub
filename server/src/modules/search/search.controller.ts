import type { RequestHandler } from "express";

import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import {
  hasAccessPermission,
  hasKpiWorkCyclesAccess,
} from "../access-permissions/access-permissions.policy.js";
import type { GlobalSearchQuery } from "./search.schemas.js";
import { searchService } from "./search.service.js";
import type { GlobalSearchData, SearchAccessScope } from "./search.types.js";

export const globalSearch: RequestHandler = async (req, res) => {
  const authContext = req.authContext;
  if (!authContext?.user.userId || !authContext.access) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated access was not resolved.",
    });
  }

  const permissions = authContext.access.permissions;
  const access: SearchAccessScope = {
    includeKpiWorkCycles: hasKpiWorkCyclesAccess(permissions),
    canCoordinateMeetings: authContext.access.meetingCoordinateEnabled === true,
    includeContracts: hasAccessPermission(permissions, "CONTRACTS", "ACCESS"),
    includeSuppliers: hasAccessPermission(permissions, "SUPPLIERS", "ACCESS"),
    includeItems: hasAccessPermission(permissions, "ITEMS", "ACCESS"),
    includePriceQuotes: hasAccessPermission(permissions, "PRICE_QUOTES", "ACCESS"),
  };

  const query = getValidatedRequestPart<GlobalSearchQuery>(req, "query");
  const data = await searchService.search(
    authContext.user.userId,
    query.q,
    query.limit,
    access,
  );
  const body: ApiSuccessResponse<GlobalSearchData> = { success: true, data };
  res.json(body);
};
